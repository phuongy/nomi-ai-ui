import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForRoom } from './db'
import type { Nomi, Room } from './db'
import { bumpActivity } from './convos'
import { api } from './api'
import { isMock } from './settings'

// Create a room (SPEC §4 Rooms). In mock mode it's a local Dexie record so the
// whole rooms UX is testable without touching the account. In live mode it hits
// POST /rooms (payload unverified — V4) and stores the returned id.
export async function createRoom(name: string, memberUuids: string[]): Promise<Room> {
  let id: string
  if (isMock()) {
    id = `room-${crypto.randomUUID()}`
  } else {
    const created = await api.createRoom({ name, nomiUuids: memberUuids, backchannelingEnabled: true })
    id = created.id ?? created.uuid ?? `room-${crypto.randomUUID()}`
  }
  const room: Room = { id, name, memberUuids }
  await db.rooms.put(room)
  // Surface the new room at the top of the list immediately.
  await bumpActivity(convoKeyForRoom(id), Date.now())
  return room
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
