import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForRoom } from '../lib/db'
import { createRoom } from '../lib/rooms'
import type { Convo } from '../lib/convos'
import { Avatar } from './Avatar'

// Create a room: pick 2+ Nomis and name it (SPEC §4). On create, opens the room.
export function NewSheet({ onClose, onOpenRoom }: { onClose: () => void; onOpenRoom: (c: Convo) => void }) {
  const nomis = useLiveQuery(() => db.nomis.toArray()) ?? []
  const [sel, setSel] = useState<string[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (uuid: string) =>
    setSel((s) => (s.includes(uuid) ? s.filter((x) => x !== uuid) : [...s, uuid]))

  async function create() {
    if (sel.length < 2 || busy) return
    setBusy(true)
    const room = await createRoom(name.trim() || 'New Room', sel)
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
        <h2>New room</h2>

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

        <button className="cta" disabled={sel.length < 2 || busy} onClick={create}>
          {sel.length < 2 ? 'Pick at least 2' : `Create room with ${sel.length}`}
        </button>
      </div>
    </div>
  )
}
