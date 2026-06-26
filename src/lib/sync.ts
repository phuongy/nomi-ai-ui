import { api } from './api'
import { db } from './db'
import { isMock } from './settings'

// Pull the Nomi (and room) lists into Dexie. Dexie is the render source of
// truth; this just refreshes it in the background (SPEC §1). Local-only fields
// (messages, lastActivityAt, unread, cached avatars) are never overwritten —
// bulkPut only touches the nomis/rooms rows by primary key.

export async function syncNomis(): Promise<void> {
  const nomis = await api.listNomis()
  if (nomis.length) await db.nomis.bulkPut(nomis)
}

export async function syncRooms(): Promise<void> {
  // Mock rooms live only in Dexie — never let a live (empty) list wipe them.
  if (isMock()) return
  const rooms = await api.listRooms()
  // Replace the room set (rooms can be deleted upstream). Safe: room rows hold
  // no local-only data — messages live in the messages table keyed by convoKey.
  await db.transaction('rw', db.rooms, async () => {
    await db.rooms.clear()
    if (rooms.length) await db.rooms.bulkPut(rooms)
  })
}

export async function syncAll(): Promise<void> {
  await Promise.all([syncNomis(), syncRooms()])
}
