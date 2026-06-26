import { useAvatarUrl } from '../lib/avatars'
import { useRoomMembers } from '../lib/rooms'

// Avatar: cached Nomi webp when available, else a deterministic gradient with the
// initial. Rooms use RoomAvatar (a composite mosaic of member avatars), matching
// the Nomi app — there is no room avatar endpoint (SPEC §4 Assets).

function hue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export function avatarGradient(seed: string): string {
  const h = hue(seed)
  return `linear-gradient(140deg, hsl(${h} 45% 70%), hsl(${(h + 28) % 360} 50% 55%))`
}

export function Avatar({
  uuid,
  name,
  room = false,
  size = 50,
}: {
  uuid?: string
  name: string
  room?: boolean
  size?: number
}) {
  const url = useAvatarUrl(room ? undefined : uuid)
  return (
    <div
      className={`av${room ? ' room' : ''}`}
      style={{ width: size, height: size, background: url ? undefined : avatarGradient(uuid ?? name) }}
    >
      {url ? <img src={url} alt={name} /> : <span>{room ? '⬢' : (name[0] ?? '?').toUpperCase()}</span>}
      <div className="ring" />
    </div>
  )
}

// One face in the room facepile: a member's cached avatar or gradient initial.
function MemberFace({ uuid, name, size }: { uuid: string; name: string; size: number }) {
  const url = useAvatarUrl(uuid)
  return (
    <div
      className="face"
      style={{ width: size, height: size, background: url ? undefined : avatarGradient(uuid) }}
    >
      {url ? <img src={url} alt={name} /> : <span>{(name[0] ?? '?').toUpperCase()}</span>}
    </div>
  )
}

// Composite room avatar: member avatars as an overlapping facepile (legible at
// small sizes, unlike a clipped mosaic). Shows up to 3.
export function RoomAvatar({ memberUuids, size = 50 }: { memberUuids: string[]; size?: number }) {
  const members = useRoomMembers(memberUuids)
  const shown = members.slice(0, 3)
  const face = Math.round(size * 0.74)
  const shift = Math.round(face * 0.45)

  if (shown.length === 0) {
    return (
      <div className="av room" style={{ width: size, height: size, background: avatarGradient(memberUuids[0] ?? 'room') }}>
        <span>⬢</span>
      </div>
    )
  }

  return (
    <div className="facepile" style={{ height: size }}>
      {shown.map((m, i) => (
        <div key={m.uuid} style={{ marginLeft: i === 0 ? 0 : -shift, zIndex: shown.length - i }}>
          <MemberFace uuid={m.uuid} name={m.name} size={face} />
        </div>
      ))}
    </div>
  )
}
