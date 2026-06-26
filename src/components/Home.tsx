import { useEffect, useState } from 'react'
import { syncAll } from '../lib/sync'
import { markRead, type Convo } from '../lib/convos'
import { setActiveConvo } from '../lib/chatEngine'
import { ConversationList } from './ConversationList'
import { ChatScreen } from './ChatScreen'
import { SettingsSheet } from './SettingsSheet'
import { NewSheet } from './NewSheet'

// App shell. Refreshes the Nomi/room lists into Dexie on mount, then renders the
// conversation list and the chat. Replies are mocked by default (Settings).
export function Home({ onSignOut }: { onSignOut: () => void }) {
  const [selected, setSelected] = useState<Convo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    syncAll().catch(() => {
      // Offline / key revoked: fall back to whatever Dexie already holds.
    })
  }, [])

  // Tell the engine which conversation is on screen, so replies to others mark unread.
  useEffect(() => {
    setActiveConvo(selected?.key ?? null)
    return () => setActiveConvo(null)
  }, [selected])

  function open(c: Convo) {
    setSelected(c)
    void markRead(c.key)
  }

  return (
    <div className="app">
      {selected ? (
        <ChatScreen convo={selected} onBack={() => setSelected(null)} />
      ) : (
        <ConversationList
          onOpen={open}
          onSettings={() => setSettingsOpen(true)}
          onNew={() => setNewOpen(true)}
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
    </div>
  )
}
