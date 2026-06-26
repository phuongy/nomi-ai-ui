import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForNomi, convoKeyForRoom, setMeta, getMeta } from './db'
import type { Message } from './db'

// A unified conversation row (Nomi or room), assembled live from Dexie.
// Ordering is local: lastActivityAt comes from meta (updated on every send/reply),
// falling back to the last message, then the Nomi's `created` — the API gives no
// server activity signal (verified). See [[chat-blocking-rule]] for send behavior.

export type Convo = {
  key: string // convoKey
  kind: 'nomi' | 'room'
  id: string // uuid or room id
  name: string
  members: string[] // [uuid] for a Nomi; memberUuids for a room
  avatarSeed: string // uuid to fetch the avatar for (first member for rooms)
  relationshipType?: string
  lastActivityAt: number
  lastMessage?: Message
  unread: number
}

const activityKey = (convoKey: string) => `activity:${convoKey}`
const unreadKey = (convoKey: string) => `unread:${convoKey}`

export async function bumpActivity(convoKey: string, ts: number): Promise<void> {
  await setMeta(activityKey(convoKey), ts)
}

export async function incrUnread(convoKey: string): Promise<void> {
  const cur = (await getMeta<number>(unreadKey(convoKey))) ?? 0
  await setMeta(unreadKey(convoKey), cur + 1)
}

export async function markRead(convoKey: string): Promise<void> {
  await setMeta(unreadKey(convoKey), 0)
}

// Drop a conversation's local activity/unread meta (used when a room is deleted
// or its id is changed). Messages are removed separately by the caller.
export async function forgetConvoMeta(convoKey: string): Promise<void> {
  await db.meta.bulkDelete([activityKey(convoKey), unreadKey(convoKey)])
}

export function useConversations(): Convo[] | undefined {
  return useLiveQuery(async () => {
    const [nomis, rooms, messages, metas] = await Promise.all([
      db.nomis.toArray(),
      db.rooms.toArray(),
      db.messages.toArray(),
      db.meta.toArray(),
    ])

    const meta = new Map(metas.map((m) => [m.key, m.value]))
    // Last message per conversation (small scale: reduce in memory).
    const lastByConvo = new Map<string, Message>()
    for (const m of messages) {
      const prev = lastByConvo.get(m.convoKey)
      if (!prev || m.ts > prev.ts) lastByConvo.set(m.convoKey, m)
    }

    const num = (k: string, fallback = 0) => {
      const v = meta.get(k)
      return typeof v === 'number' ? v : fallback
    }

    const convos: Convo[] = []

    for (const n of nomis) {
      const key = convoKeyForNomi(n.uuid)
      const last = lastByConvo.get(key)
      convos.push({
        key,
        kind: 'nomi',
        id: n.uuid,
        name: n.name,
        members: [n.uuid],
        avatarSeed: n.uuid,
        relationshipType: n.relationshipType,
        lastActivityAt: num(activityKey(key), last?.ts ?? toMs(n.created)),
        lastMessage: last,
        unread: num(unreadKey(key)),
      })
    }

    for (const r of rooms) {
      const key = convoKeyForRoom(r.id)
      const last = lastByConvo.get(key)
      convos.push({
        key,
        kind: 'room',
        id: r.id,
        name: r.name,
        members: r.memberUuids ?? [],
        avatarSeed: (r.memberUuids ?? [])[0] ?? r.id,
        lastActivityAt: num(activityKey(key), last?.ts ?? 0),
        lastMessage: last,
        unread: num(unreadKey(key)),
      })
    }

    return convos.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  })
}

function toMs(iso?: string): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}
