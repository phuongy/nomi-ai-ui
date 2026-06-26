import { api } from './api'
import { db } from './db'

// Pull the Nomi list into Dexie. Dexie is the render source of truth; this just
// refreshes it in the background (SPEC §1). Local-only fields (messages,
// lastActivityAt, unread, cached avatars) are never overwritten — bulkPut only
// touches the nomis rows by primary key.
//
// NOTE: there is deliberately no room sync. The live GET /api/rooms is broken —
// it always returns an empty array — and syncing it would clear-then-empty the
// local rooms table, wiping rooms created on this device. Rooms live in Dexie
// (seeded by seedRooms / added via the [+] Add-room form); don't re-add a server
// pull until /rooms actually returns the room set.

export async function syncNomis(): Promise<void> {
  const nomis = await api.listNomis()
  if (nomis.length) await db.nomis.bulkPut(nomis)
}
