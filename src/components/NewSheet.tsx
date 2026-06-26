import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForRoom } from '../lib/db'
import type { Room } from '../lib/db'
import { bumpActivity, type Convo } from '../lib/convos'
import { Avatar } from './Avatar'

// Add a room to the LOCAL registry. Nomi's GET /rooms is broken, so rooms can't
// be fetched — instead you register an existing room's id here and it's stored
// straight into Dexie (no API call). The list renders rooms from Dexie, so it
// shows up immediately and is chatable. 2+ members is kept: a Nomi room must
// have at least two members to exist on their side. Edit/delete live elsewhere.
export function NewSheet({ onClose, onOpenRoom }: { onClose: () => void; onOpenRoom: (c: Convo) => void }) {
  const nomis = useLiveQuery(() => db.nomis.toArray()) ?? []
  const [sel, setSel] = useState<string[]>([])
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (uuid: string) =>
    setSel((s) => (s.includes(uuid) ? s.filter((x) => x !== uuid) : [...s, uuid]))

  const roomId = id.trim()
  const canAdd = roomId.length > 0 && sel.length >= 2

  async function add() {
    if (!canAdd || busy) return
    setBusy(true)
    const room: Room = { id: roomId, name: name.trim() || 'Room', memberUuids: sel }
    await db.rooms.put(room) // local upsert — no POST /rooms
    await bumpActivity(convoKeyForRoom(room.id), Date.now()) // surface at top
    onOpenRoom({
      key: convoKeyForRoom(room.id),
      kind: 'room',
      id: room.id,
      name: room.name,
      members: room.memberUuids,
      avatarSeed: room.memberUuids[0] ?? room.id,
      lastActivityAt: Date.now(),
      unread: 0,
    })
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Add room</h2>
        <div className="sub" style={{ marginTop: -4 }}>
          Saved to this device only · doesn’t create a room on Nomi
        </div>

        <input
          className="gate-input"
          placeholder="Room ID (required)"
          value={id}
          onChange={(e) => setId(e.target.value)}
          style={{ fontFamily: 'var(--font-body)', marginBottom: 6 }}
        />
        <input
          className="gate-input"
          placeholder="Room name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontFamily: 'var(--font-body)', marginBottom: 6 }}
        />

        <div className="sub">Add members · pick at least 2</div>
        {nomis.map((n) => (
          <div className="opt" key={n.uuid} onClick={() => toggle(n.uuid)}>
            <Avatar uuid={n.uuid} name={n.name} size={40} />
            <span className="opt-nm">{n.name}</span>
            <span className={`chk${sel.includes(n.uuid) ? ' on' : ''}`}>
              {sel.includes(n.uuid) ? '✓' : ''}
            </span>
          </div>
        ))}

        <button className="cta" disabled={!canAdd || busy} onClick={add}>
          {!roomId ? 'Enter a room ID' : sel.length < 2 ? 'Pick at least 2 members' : `Add room with ${sel.length}`}
        </button>
      </div>
    </div>
  )
}
