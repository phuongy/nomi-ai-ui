import { useEffect, useState } from 'react'
import { markRead, type Convo } from '../lib/convos'
import { setActiveConvo } from '../lib/chatEngine'
import { ConversationList } from './ConversationList'
import { ChatScreen } from './ChatScreen'
import { SettingsSheet } from './SettingsSheet'
import { NewSheet } from './NewSheet'
import { QuickSwitcher } from './QuickSwitcher'

// App shell. Renders either the conversation list or an open chat. The list
// owns its own list refresh (see ConversationList); chat threads don't need the
// Nomi/room lists, so opening one stops the focus re-sync entirely.
// Replies are mocked by default (Settings).
export function Home({ onSignOut }: { onSignOut: () => void }) {
  const [selected, setSelected] = useState<Convo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)

  // Tell the engine which conversation is on screen, so replies to others mark unread.
  useEffect(() => {
    setActiveConvo(selected?.key ?? null)
    return () => setActiveConvo(null)
  }, [selected])

  // ⌘K / Ctrl+K toggles the quick-switcher from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setQuickOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function open(c: Convo) {
    setSelected(c)
    void markRead(c.key)
  }

  return (
    <div className="app">
      {selected ? (
        <ChatScreen
          convo={selected}
          onBack={() => setSelected(null)}
          onJump={() => setQuickOpen(true)}
          onOpenRoom={open}
        />
      ) : (
        <ConversationList
          onOpen={open}
          onSettings={() => setSettingsOpen(true)}
          onNew={() => setNewOpen(true)}
          onJump={() => setQuickOpen(true)}
        />
      )}
      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} />
      )}
      {newOpen && (
        <NewSheet
          onClose={() => setNewOpen(false)}
          onOpenRoom={(c) => {
            setNewOpen(false)
            open(c)
          }}
        />
      )}
      {quickOpen && (
        <QuickSwitcher
          onClose={() => setQuickOpen(false)}
          onPick={(c) => {
            setQuickOpen(false)
            open(c)
          }}
        />
      )}
    </div>
  )
}
