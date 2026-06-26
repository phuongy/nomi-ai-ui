import { useEffect } from 'react'
import { useConversations, type Convo } from '../lib/convos'
import { syncNomis } from '../lib/sync'
import { seedRooms } from '../lib/rooms'
import { relativeTime } from '../lib/format'
import { Avatar, RoomAvatar } from './Avatar'

// Unified Nomis + rooms list, sorted by local lastActivityAt (SPEC §4).
// Renders straight from Dexie via useLiveQuery — no spinner-then-content swap.

// Keep the Nomi list fresh while the dashboard is on screen: pull Nomis on mount
// and again whenever the tab regains focus/visibility (renames, new Nomis). Lives
// here, not in the app shell, so an open chat thread — which shows no list —
// doesn't trigger a sync on every focus. Rooms are intentionally not synced (the
// /rooms endpoint is broken; see sync.ts). The API has no message history, so
// this can't recover messages ([[nomi-api-no-history]]).
function useListSync() {
  useEffect(() => {
    let lastSync = 0
    const sync = (force = false) => {
      if (!force && document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastSync < 10_000) return // throttle: at most once / 10s, no thrash on focus
      lastSync = now
      syncNomis().catch(() => {
        // Offline / key revoked: fall back to whatever Dexie already holds.
      })
    }
    void seedRooms() // rooms can't be fetched (/rooms broken) — seed the hardcoded set
    sync(true) // initial pull when the list mounts
    const onFocus = () => sync()
    const onVisible = () => sync()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}

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
  onJump,
}: {
  onOpen: (c: Convo) => void
  onSettings: () => void
  onNew: () => void
  onJump: () => void
}) {
  const convos = useConversations()
  useListSync()

  return (
    <section className="screen">
      <div className="lhead">
        <div className="ltitle">
          <h1>Chats</h1>
          <button className="iconbtn" onClick={onNew} aria-label="New room">
            ＋
          </button>
        </div>
        <button className="search" onClick={onJump} aria-label="Search or jump to a chat">
          🔍 <span>Search or jump to…</span>
          <span className="kbd">⌘K</span>
        </button>
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
