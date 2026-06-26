import Dexie, { type Table } from 'dexie'

// Dexie is the source of truth for all rendering (SPEC §1, §5).
//
// NOTE: field names below are the spec's *indicative* schema. They are marked
// VERIFY against V-fields (Nomi list shape) and V4 (room payloads) and should be
// confirmed against the live API before they are relied on. Bump the Dexie
// version() and migrate if they change.

export type Nomi = {
  uuid: string
  name: string
  gender?: string
  relationshipType?: string
  created?: string // ISO. The API exposes no updatedAt/activity field (verified);
  // conversation ordering is local (meta lastActivityAt), not server-derived.
}

export type Room = {
  id: string
  name: string
  memberUuids: string[]
  backchannelingEnabled?: boolean
  updatedAt?: number
}

export type MsgStatus = 'pending' | 'sent' | 'failed'

export type Message = {
  clientId: string // local id, assigned on optimistic send
  convoKey: string // `nomi:<uuid>` | `room:<id>`
  serverUuid?: string // from sentMessage.uuid / replyMessage.uuid
  from: 'user' | string // 'user' or the Nomi name
  text: string
  ts: number
  status: MsgStatus
}

export type Asset = { key: string; blob: Blob } // key = `avatar:<uuid>`
export type Meta = { key: string; value: unknown } // lastActivityAt, unread, settings

class CompanionDB extends Dexie {
  nomis!: Table<Nomi, string>
  rooms!: Table<Room, string>
  messages!: Table<Message, string>
  assets!: Table<Asset, string>
  meta!: Table<Meta, string>

  constructor() {
    super('companion')
    this.version(1).stores({
      nomis: 'uuid, name',
      rooms: 'id, name, *memberUuids',
      messages: 'clientId, convoKey, serverUuid, ts, status, [convoKey+ts]',
      assets: 'key',
      meta: 'key',
    })
  }
}

export const db = new CompanionDB()

export const convoKeyForNomi = (uuid: string) => `nomi:${uuid}`
export const convoKeyForRoom = (id: string) => `room:${id}`

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
