import { useEffect, useMemo, useRef, useState } from 'react'
import { useConversations, type Convo } from '../lib/convos'
import type { Room } from '../lib/db'
import { useMessages, usePendingResponder, sendMessage, retryMessage, nudge } from '../lib/chatEngine'
import { useRoomMembers, deleteRoom } from '../lib/rooms'
import { NewSheet } from './NewSheet'
import { relativeTime } from '../lib/format'
import { CHAR_CAP, isMock } from '../lib/settings'
import { Avatar, RoomAvatar } from './Avatar'

// Chat thread + composer. Renders from Dexie; optimistic send; and the hard
// one-in-flight block (SPEC §4, §7; [[chat-blocking-rule]]): while a reply is
// pending the composer and send are disabled — the optimistic bubble is already
// on screen, it's the *next* send that's blocked.
// Nudge a specific member to reply (rooms only). Disabled while a reply is in
// flight — the room serializes to one request at a time ([[chat-blocking-rule]]).
function NudgeBar({ convo, pending }: { convo: Convo; pending: boolean }) {
  const members = useRoomMembers(convo.members)
  if (members.length === 0) return null
  return (
    <div className="nudge">
      <span className="lbl">NUDGE</span>
      {members.map((m) => (
        <button
          key={m.uuid}
          className="nbtn"
          disabled={pending}
          onClick={() => nudge(convo, m.uuid)}
        >
          <Avatar uuid={m.uuid} name={m.name} size={22} />
          {m.name}
        </button>
      ))}
    </div>
  )
}

// Recent-chat pills under the chat header: the 6 most-recent conversations as
// tappable chips (avatar + name), the open one highlighted. An always-visible
// complement to the ⇆ quick-switcher — faster for hopping between active chats,
// while the switcher still wins for searching longer lists.
function RecentsBar({ activeKey, onOpen }: { activeKey: string; onOpen: (c: Convo) => void }) {
  const convos = useConversations()
  if (!convos || convos.length === 0) return null
  return (
    <div className="recents">
      {convos.slice(0, 6).map((c) => (
        <button
          key={c.key}
          className={`rpill${c.key === activeKey ? ' on' : ''}`}
          onClick={() => onOpen(c)}
        >
          {c.kind === 'room' ? (
            <RoomAvatar memberUuids={c.members} size={24} />
          ) : (
            <Avatar uuid={c.id} name={c.name} size={24} />
          )}
          {c.name}
        </button>
      ))}
    </div>
  )
}

export function ChatScreen({
  convo,
  onBack,
  onJump,
  onOpen,
}: {
  convo: Convo
  onBack: () => void
  onJump: () => void
  onOpen: (c: Convo) => void
}) {
  const messages = useMessages(convo.key)
  const responder = usePendingResponder(convo.key)
  const pending = responder !== undefined

  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Room-only editor: ⋯ opens the registry form directly, which has Save +
  // Delete at the bottom (both local-only, no API).
  const [editing, setEditing] = useState(false)

  const over = text.length > CHAR_CAP
  const canSend = text.trim().length > 0 && !over && !pending

  // Keep the thread pinned to the latest message / typing indicator.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending])

  function submit() {
    if (!canSend) return
    void sendMessage(convo, text)
    setText('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const isRoom = convo.kind === 'room'
  const members = useRoomMembers(isRoom ? convo.members : [])
  const nameToUuid = useMemo(() => new Map(members.map((m) => [m.name, m.uuid])), [members])

  return (
    <section className="screen">
      <div className="chead">
        <div className="bar">
          <button className="back" onClick={onBack} aria-label="Back">
            ‹
          </button>
          <div className="who">
            {isRoom ? (
              <RoomAvatar memberUuids={convo.members} size={38} />
            ) : (
              <Avatar uuid={convo.id} name={convo.name} size={38} />
            )}
            <div>
              <div className="nm">{convo.name}</div>
              <div className={`st${pending ? '' : ' idle'}`}>
                {pending
                  ? `${responder} is typing…`
                  : convo.kind === 'room'
                    ? `${convo.members.length} members`
                    : isMock()
                      ? 'mock replies'
                      : 'connected'}
              </div>
            </div>
          </div>
          <button className="iconbtn" onClick={onJump} aria-label="Jump to chat" title="Jump">
            ⇆
          </button>
          {isRoom && (
            <button
              className="iconbtn"
              onClick={() => setEditing(true)}
              aria-label="Edit room"
              title="Edit room"
            >
              ⋯
            </button>
          )}
        </div>
        <RecentsBar activeKey={convo.key} onOpen={onOpen} />
      </div>

      <div className="thread" ref={threadRef}>
        {messages?.length === 0 && <div className="empty">Say hi to {convo.name}.</div>}
        {messages?.map((m, i) => {
          const me = m.from === 'user'
          const showWho = isRoom && !me && (i === 0 || messages[i - 1].from !== m.from)
          const bubble = (
            <div className={`bubble${m.status === 'failed' ? ' failed' : ''}`}>{m.text}</div>
          )
          const footer =
            m.status === 'failed' ? (
              <button className="retry" onClick={() => retryMessage(convo, m.clientId)}>
                failed · retry
              </button>
            ) : (
              <span className="meta">{m.status === 'pending' ? 'sending…' : relativeTime(m.ts)}</span>
            )

          // Room messages from a member carry the member's avatar in a left gutter
          // (only on the first of a consecutive run, so a thread stays aligned).
          if (isRoom && !me) {
            return (
              <div key={m.clientId} className="msg them room">
                <div className="msg-gutter">
                  {showWho && <Avatar uuid={nameToUuid.get(m.from)} name={m.from} size={26} />}
                </div>
                <div className="msg-col">
                  {showWho && <span className="who-lbl">{m.from}</span>}
                  {bubble}
                  {footer}
                </div>
              </div>
            )
          }
          return (
            <div key={m.clientId} className={`msg ${me ? 'me' : 'them'}`}>
              {bubble}
              {footer}
            </div>
          )
        })}
        {pending && (
          <div className="typing">
            <Avatar
              uuid={isRoom ? (responder ? nameToUuid.get(responder) : undefined) : convo.id}
              name={responder ?? convo.name}
              size={26}
            />
            <div className="dots">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {convo.kind === 'room' && <NudgeBar convo={convo} pending={pending} />}

      <div className="composer">
        {pending && (
          <div className="hint">
            ⓘ one message at a time · <b>cancels in 30s</b>
          </div>
        )}
        <div className="inwrap">
          <div className="field">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              placeholder="Message"
              onChange={(e) => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            {text.length > 0 && (
              <div className={`count${text.length > CHAR_CAP - 40 ? ' warn' : ''}`}>
                {text.length}/{CHAR_CAP}
              </div>
            )}
          </div>
          <button className="send" onClick={submit} disabled={!canSend} aria-label="Send">
            {pending ? <span className="spin" /> : '↑'}
          </button>
        </div>
      </div>

      {editing && (
        <NewSheet
          editing={{ id: convo.id, name: convo.name, memberUuids: convo.members } satisfies Room}
          onClose={() => setEditing(false)}
          onOpenRoom={(c) => {
            setEditing(false)
            onOpen(c)
          }}
          onDelete={async () => {
            await deleteRoom(convo.id)
            setEditing(false)
            onBack()
          }}
        />
      )}
    </section>
  )
}
