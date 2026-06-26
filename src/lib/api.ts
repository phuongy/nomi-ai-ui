import { getApiKey } from './keyStore'
import type { Nomi, Room } from './db'

// Client for the same-origin relay (/api/*). Attaches the local key as the
// Authorization header on every call and maps Nomi's error types to a typed
// error the UI can branch on (SPEC §2 error table, §7 state machine).
//
// NOTE: the exact error body shape is a VERIFY item — the parser below is
// defensive (checks a few likely shapes) until confirmed against the live API.

const CLIENT_TIMEOUT_MS = 35_000 // just past the 30s server ceiling (SPEC §7)

export class ApiError extends Error {
  constructor(
    public type: string,
    public status: number,
    public body?: unknown,
  ) {
    super(type)
    this.name = 'ApiError'
  }
}

function errorType(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const nested = b.error as Record<string, unknown> | undefined
    const t = (nested?.type ?? b.type ?? nested?.error ?? b.error) as unknown
    if (typeof t === 'string') return t
  }
  return `Http${status}`
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  { key = getApiKey(), timeoutMs = CLIENT_TIMEOUT_MS }: { key?: string; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: key,
        ...(init.headers ?? {}),
      },
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('NoReply', 0) // treat timeout as the NoReply state
    }
    throw new ApiError('NetworkError', 0, err)
  }
  clearTimeout(timer)

  const text = await res.text()
  const body: unknown = text ? safeJson(text) : undefined
  if (!res.ok) throw new ApiError(errorType(res.status, body), res.status, body)
  return body as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Validate a candidate key by hitting GET /api/nomis with it (SPEC §4 "test key"). */
export async function validateKey(candidate: string): Promise<boolean> {
  await request('/nomis', { method: 'GET' }, { key: candidate.trim(), timeoutMs: 15_000 })
  return true
}

// Verified reply shape (SPEC §2): both messages are { uuid, text, sent (ISO) }.
export type ChatReply = {
  sentMessage: { uuid: string; text: string; sent: string }
  replyMessage: { uuid: string; text: string; sent: string }
}

export const api = {
  // Lists are wrapped (verified): { nomis: [...] } / { rooms: [...] }.
  listNomis: async (): Promise<Nomi[]> => (await request<{ nomis: Nomi[] }>('/nomis')).nomis ?? [],
  getNomi: (id: string) => request<Nomi>(`/nomis/${id}`),
  listRooms: async (): Promise<Room[]> => (await request<{ rooms: Room[] }>('/rooms')).rooms ?? [],
  chat: (id: string, messageText: string) =>
    request<ChatReply>(`/nomis/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messageText }),
    }),

  // Rooms. Payload/response shapes are the community-assumed ones (VERIFY V4 —
  // unconfirmed until a real room exists). Used only in live mode.
  createRoom: (payload: { name: string; nomiUuids: string[]; backchannelingEnabled?: boolean }) =>
    request<{ id?: string; uuid?: string }>('/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  postRoomMessage: (id: string, messageText: string) =>
    request<ChatReply>(`/rooms/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messageText }),
    }),
  nudgeRoom: (id: string, nomiUuid: string) =>
    request<ChatReply>(`/rooms/${id}/chat/request`, {
      method: 'POST',
      body: JSON.stringify({ nomiUuid }),
    }),
}
