import { useConversations, type Convo } from '../lib/convos'
import { relativeTime } from '../lib/format'
import { Avatar, RoomAvatar } from './Avatar'

// Unified Nomis + rooms list, sorted by local lastActivityAt (SPEC §4).
// Renders straight from Dexie via useLiveQuery — no spinner-then-content swap.

function preview(c: Convo): string {
  const m = c.lastMessage
  if (!m) return 'Say hi'
  if (m.from === 'user') return `You: ${m.text}`
  if (c.kind === 'room') return `${m.from}: ${m.text}`
  return m.text
}

export function ConversationList({
  onOpen,
  onSettings,
  onNew,
}: {
  onOpen: (c: Convo) => void
  onSettings: () => void
  onNew: () => void
}) {
  const convos = useConversations()

  return (
    <section className="screen">
      <div className="lhead">
        <div className="ltitle">
          <h1>Chats</h1>
          <button className="iconbtn" onClick={onNew} aria-label="New room">
            ＋
          </button>
        </div>
      </div>

      <div className="rows">
        {convos === undefined ? null : convos.length === 0 ? (
          <div className="empty">No conversations yet.</div>
        ) : (
          convos.map((c) => (
            <div className="row" key={c.key} onClick={() => onOpen(c)}>
              {c.kind === 'room' ? (
                <RoomAvatar memberUuids={c.members} size={50} />
              ) : (
                <Avatar uuid={c.id} name={c.name} size={50} />
              )}
              <div className="rmain">
                <div className="rtop">
                  <span className="rname">{c.name}</span>
                  {c.kind === 'room' ? (
                    <span className="rtag">{c.members.length}</span>
                  ) : c.relationshipType ? (
                    <span className="rtag">{c.relationshipType}</span>
                  ) : null}
                  <span className="rtime">{relativeTime(c.lastActivityAt)}</span>
                </div>
                <div className="rprev">
                  {c.unread > 0 && <span className="dot" />}
                  <span className="prevtext">{preview(c)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="lfoot">
        <button className="pill" onClick={onSettings}>
          ⚙ Settings
        </button>
      </div>
    </section>
  )
}
