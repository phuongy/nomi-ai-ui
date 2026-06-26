import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, convoKeyForRoom } from '../lib/db'
import type { Room } from '../lib/db'
import { saveRoom } from '../lib/rooms'
import type { Convo } from '../lib/convos'
import { Avatar } from './Avatar'

// Add or edit a room in the LOCAL registry. Nomi's GET /rooms is broken, so
// rooms can't be fetched — you register a room's id here and it's stored
// straight into Dexie (no API call). The list renders rooms from Dexie, so it
// shows up immediately. 2+ members is kept: a Nomi room must have at least two
// members to exist on their side. In edit mode the id is editable; changing it
// is a rename (the old row + its local data are dropped — see saveRoom).
export function NewSheet({
  onClose,
  onOpenRoom,
  editing,
  onDelete,
}: {
  onClose: () => void
  onOpenRoom: (c: Convo) => void
  editing?: Room
  onDelete?: () => void
}) {
  const nomis = useLiveQuery(() => db.nomis.toArray()) ?? []
  const [sel, setSel] = useState<string[]>(editing?.memberUuids ?? [])
  const [id, setId] = useState(editing?.id ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [busy, setBusy] = useState(false)

  const toggle = (uuid: string) =>
    setSel((s) => (s.includes(uuid) ? s.filter((x) => x !== uuid) : [...s, uuid]))

  const roomId = id.trim()
  const canSave = roomId.length > 0 && sel.length >= 2

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    const room: Room = { id: roomId, name: name.trim() || 'Room', memberUuids: sel }
    await saveRoom(room, editing?.id) // local upsert (+ rename cleanup) — no POST /rooms
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
        <h2>{editing ? 'Edit room' : 'Add room'}</h2>
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

        <div className="form-actions">
          <button className="cta save" disabled={!canSave || busy} onClick={save}>
            {!roomId
              ? 'Enter a room ID'
              : sel.length < 2
                ? 'Pick at least 2 members'
                : editing
                  ? 'Save changes'
                  : `Add room with ${sel.length}`}
          </button>
          {editing && onDelete && (
            <button className="cta danger" onClick={onDelete} disabled={busy} aria-label="Delete room">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
