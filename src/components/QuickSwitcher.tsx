import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useConversations, type Convo } from '../lib/convos'
import { Avatar, RoomAvatar } from './Avatar'

// ⌘K quick-switcher (SPEC §4, matches the prototype `.qs`). Search + ↑/↓/↵
// keyboard nav to jump to any conversation. Renders from the same live Dexie
// list, so it's always in sync with the conversation list.
export function QuickSwitcher({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (c: Convo) => void
}) {
  const convos = useConversations() ?? []
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const list = useMemo(
    () => convos.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [convos, query],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keep the selection in range as the filtered list shrinks/grows.
  const active = Math.min(sel, Math.max(0, list.length - 1))

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel(Math.min(active + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(Math.max(active - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (list[active]) onPick(list[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="scrim center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="qs" onKeyDown={onKeyDown}>
        <div className="qf">
          🔍
          <input
            ref={inputRef}
            placeholder="Jump to a chat…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
          />
        </div>
        <div className="qlist">
          {list.length === 0 ? (
            <div className="qempty">No matches</div>
          ) : (
            list.map((c, i) => (
              <div
                key={c.key}
                className={`qrow${i === active ? ' sel' : ''}`}
                onClick={() => onPick(c)}
              >
                {c.kind === 'room' ? (
                  <RoomAvatar memberUuids={c.members} size={32} />
                ) : (
                  <Avatar uuid={c.id} name={c.name} size={32} />
                )}
                <span className="nm">{c.name}</span>
                <span className="k">
                  {c.kind === 'room' ? 'room' : 'chat'}
                  {i === active ? '  ↵' : ''}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="qfoot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
