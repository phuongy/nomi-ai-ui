import { useState } from 'react'
import { hasApiKey, clearApiKey } from './lib/keyStore'
import { KeyGate } from './components/KeyGate'
import { Home } from './components/Home'

export default function App() {
  // First-run gate: no key stored -> require entry before anything loads (SPEC §4).
  const [authed, setAuthed] = useState(hasApiKey)

  if (!authed) return <KeyGate onSaved={() => setAuthed(true)} />

  return (
    <Home
      onSignOut={() => {
        clearApiKey()
        setAuthed(false)
      }}
    />
  )
}
