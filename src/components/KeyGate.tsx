import { useState } from 'react'
import { validateKey, ApiError } from '../lib/api'
import { setApiKey } from '../lib/keyStore'

// First-run key entry (SPEC §4). Pastes the Nomi key, validates it against
// GET /api/nomis through the relay, and saves it locally on success.
export function KeyGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'testing'>('idle')
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const candidate = value.trim()

  async function submit() {
    if (!candidate || status === 'testing') return
    setStatus('testing')
    setMsg(null)
    try {
      await validateKey(candidate)
      setApiKey(candidate)
      setMsg({ kind: 'ok', text: 'Key works — connecting…' })
      onSaved()
    } catch (err) {
      // Nomi rejects a bad key with 400 InvalidAPIKey (verified against the live API),
      // not 401 — treat both as "rejected".
      const rejected =
        err instanceof ApiError &&
        (err.type === 'InvalidAPIKey' || err.status === 401 || err.status === 403)
      const text = rejected
        ? 'That key was rejected. Check it and try again.'
        : err instanceof ApiError && err.type === 'NetworkError'
          ? 'Could not reach the relay. Is the dev server running?'
          : 'Something went wrong testing the key.'
      setMsg({ kind: 'err', text })
      setStatus('idle')
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Companion</h1>
        <p>
          Paste your Nomi API key to begin. It is stored only on this device and sent straight to
          Nomi through the local relay — never to anyone else.
        </p>

        <label className="gate-label" htmlFor="key">
          Nomi API key
        </label>
        <input
          id="key"
          className="gate-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />

        <button
          className="gate-btn"
          disabled={!candidate || status === 'testing'}
          onClick={submit}
        >
          {status === 'testing' ? 'Testing…' : 'Test & save'}
        </button>

        {msg && <div className={`gate-msg ${msg.kind}`}>{msg.text}</div>}

        <div className="gate-hint">
          Find it in the Integration tab of your Nomi profile.
          <br />
          Raw UUID, no “Bearer” prefix.
        </div>
      </div>
    </div>
  )
}
