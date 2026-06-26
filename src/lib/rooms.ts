import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForRoom } from './db'
import type { Nomi, Room } from './db'
import { bumpActivity, forgetConvoMeta } from './convos'

// Rooms are managed entirely from the UI now — added via the [+] form and
// edited/deleted from the room chat's ⋯ menu (GET /rooms is broken, so they
// can't be fetched; see sync.ts). SEED_ROOMS is left empty on purpose: a
// hardcoded entry would re-appear on every mount (insert-only below) and so
// resurrect itself right after you edit its id away — fighting the edit. Add an
// entry here only if you want a guaranteed default room. Rooms already in Dexie
// are untouched by an empty seed.
const SEED_ROOMS: Room[] = []

export async function seedRooms(): Promise<void> {
  for (const r of SEED_ROOMS) {
    if (!(await db.rooms.get(r.id))) await db.rooms.put(r)
  }
}

// Save a room to the local registry (no API call). On an id change the id is the
// primary key / convoKey, so it's a rename: the old row and its local-only data
// (messages, activity/unread meta) are dropped. Used by the [+] add form and the
// ⋯ edit flow.
export async function saveRoom(room: Room, prevId?: string): Promise<void> {
  await db.rooms.put(room)
  if (prevId && prevId !== room.id) {
    await db.rooms.delete(prevId)
    await removeRoomLocalData(prevId)
  }
  await bumpActivity(convoKeyForRoom(room.id), Date.now())
}

// Remove a room from the local registry, along with its messages and meta.
export async function deleteRoom(id: string): Promise<void> {
  await db.rooms.delete(id)
  await removeRoomLocalData(id)
}

async function removeRoomLocalData(id: string): Promise<void> {
  const key = convoKeyForRoom(id)
  await db.messages.where('convoKey').equals(key).delete()
  await forgetConvoMeta(key)
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
