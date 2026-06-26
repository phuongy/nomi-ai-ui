import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Message } from './db'
import { bumpActivity, incrUnread } from './convos'
import type { Convo } from './convos'
import { api } from './api'
import { isMock } from './settings'
import { mockReply } from './mock'

// The send engine and the one-in-flight lock (SPEC §7, §7.1; [[chat-blocking-rule]]).
//
// The lock lives in a module-level store (not component state) so it survives
// conversation switches: a reply still lands in Dexie even if you navigate away,
// and the thread (which renders from Dexie) reflects it. While a conversation is
// in flight, sendMessage hard-refuses a second send to it — the UI also disables
// its controls, but this guard is the backstop.

const inFlight = new Map<string, string>() // convoKey -> responder name
const listeners = new Set<() => void>()

// The conversation currently on screen. A reply that lands for any *other*
// conversation marks it unread (the dot in the list); a reply for the open one
// does not. Set by the shell when a chat is opened/closed.
let activeConvoKey: string | null = null
export function setActiveConvo(convoKey: string | null): void {
  activeConvoKey = convoKey
}
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The responder name if this conversation is awaiting a reply, else undefined. */
export function usePendingResponder(convoKey: string): string | undefined {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  )
  return inFlight.get(convoKey)
}

/** Live thread for a conversation, oldest-first. Renders straight from Dexie. */
export function useMessages(convoKey: string): Message[] | undefined {
  return useLiveQuery(
    () => db.messages.where('convoKey').equals(convoKey).sortBy('ts'),
    [convoKey],
  )
}

async function respond(convo: Convo, responder: string, text: string) {
  if (isMock()) return mockReply(responder, text)
  return convo.kind === 'room' ? api.postRoomMessage(convo.id, text) : api.chat(convo.id, text)
}

// A room reply comes from a member; resolve its uuid to a display name. For a
// plain post, pick a random member; for a nudge, the targeted one.
async function roomResponderName(convo: Convo, preferUuid?: string): Promise<string> {
  const uuid = preferUuid ?? convo.members[Math.floor(Math.random() * convo.members.length)]
  const nomi = uuid ? await db.nomis.get(uuid) : undefined
  return nomi?.name ?? convo.name
}

export async function sendMessage(convo: Convo, rawText: string): Promise<void> {
  const text = rawText.trim()
  if (!text || inFlight.has(convo.key)) return // hard one-in-flight guard

  const ts = Date.now()
  const clientId = crypto.randomUUID()

  // Optimistic: write + render immediately, never wait on the network (SPEC §4).
  await db.messages.add({ clientId, convoKey: convo.key, from: 'user', text, ts, status: 'pending' })
  await bumpActivity(convo.key, ts)

  const responder = convo.kind === 'room' ? await roomResponderName(convo) : convo.name
  inFlight.set(convo.key, responder)
  emit()

  try {
    const reply = await respond(convo, responder, text)
    // Reconcile: map the optimistic record to the server uuid; mark sent.
    await db.messages.update(clientId, { status: 'sent', serverUuid: reply.sentMessage?.uuid })
    const rts = Date.now()
    await db.messages.add({
      clientId: crypto.randomUUID(),
      convoKey: convo.key,
      serverUuid: reply.replyMessage?.uuid,
      from: responder,
      text: reply.replyMessage.text,
      ts: rts,
      status: 'sent',
    })
    await bumpActivity(convo.key, rts)
    // New-message signal: only if you're not currently looking at this chat.
    if (activeConvoKey !== convo.key) await incrUnread(convo.key)
  } catch {
    // NoReply / timeout / quota: leave a failed bubble the user can retry (SPEC §7).
    await db.messages.update(clientId, { status: 'failed' })
  } finally {
    inFlight.delete(convo.key)
    emit()
  }
}

/**
 * Nudge a specific room member to reply (SPEC §4 Rooms; POST /rooms/:id/chat/request).
 * No user message — just a reply from that member. Same one-in-flight lock as a
 * send: refused (and the buttons disabled) while the room is already pending.
 */
export async function nudge(convo: Convo, memberUuid: string): Promise<void> {
  if (inFlight.has(convo.key)) return
  const responder = await roomResponderName(convo, memberUuid)
  inFlight.set(convo.key, responder)
  emit()
  try {
    const reply = isMock() ? await mockReply(responder, '') : await api.nudgeRoom(convo.id, memberUuid)
    const rts = Date.now()
    await db.messages.add({
      clientId: crypto.randomUUID(),
      convoKey: convo.key,
      serverUuid: reply.replyMessage?.uuid,
      from: responder,
      text: reply.replyMessage?.text ?? '…',
      ts: rts,
      status: 'sent',
    })
    await bumpActivity(convo.key, rts)
    if (activeConvoKey !== convo.key) await incrUnread(convo.key)
  } catch {
    // A failed nudge just leaves the thread as-is; the user can nudge again.
  } finally {
    inFlight.delete(convo.key)
    emit()
  }
}

/** Retry a failed send: drop the failed bubble and resend its text. */
export async function retryMessage(convo: Convo, clientId: string): Promise<void> {
  const msg = await db.messages.get(clientId)
  if (!msg || msg.status !== 'failed') return
  await db.messages.delete(clientId)
  await sendMessage(convo, msg.text)
}
