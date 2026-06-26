import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Nomi, Room } from './db'

// Hardcoded rooms, seeded into Dexie because the live GET /rooms is broken (it
// always returns []). The list renders rooms straight from Dexie (see
// useConversations), so seeding is all that's needed to make a room appear and
// be chatable (POST /rooms/:id/chat works fine — only the list endpoint is
// broken).
//
// Insert-only: a seed is written ONLY when its id isn't already in Dexie, so the
// hardcoded room is bootstrapped once but never clobbers edits made through the
// Add-room form (e.g. setting members on 1924723201). memberUuids must be uuids
// from your Nomi list (db.nomis) so avatars, the member count, and the nudge bar
// resolve.
const SEED_ROOMS: Room[] = [
  { id: '1924723201', name: 'Room', memberUuids: [] }, // TODO: set name + members (or do it via [+])
]

export async function seedRooms(): Promise<void> {
  for (const r of SEED_ROOMS) {
    if (!(await db.rooms.get(r.id))) await db.rooms.put(r)
  }
}

// Resolve a room's member uuids to their Nomi records (names + avatars), live.
export function useRoomMembers(memberUuids: string[]): Nomi[] {
  const key = memberUuids.join(',')
  return (
    useLiveQuery(async () => {
      const rows = await db.nomis.bulkGet(memberUuids)
      return rows.filter((n): n is Nomi => !!n)
    }, [key]) ?? []
  )
}
