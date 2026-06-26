import { useState } from 'react'
import { isMock, setMock, isSlow, setSlow } from '../lib/settings'

// Local-only settings (SPEC §4). Mock toggle swaps the chat between the local
// mock responder and the live Nomi API; slow simulates the 30s lock.
export function SettingsSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const [mock, setMockState] = useState(isMock)
  const [slow, setSlowState] = useState(isSlow)

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Settings</h2>

        <div className="setrow">
          <div>
            <div className="t">Mock replies</div>
            <div className="d">Replies are simulated locally — no real messages, no quota.</div>
          </div>
          <button
            className={`toggle${mock ? ' on' : ''}`}
            aria-label="Toggle mock replies"
            onClick={() => {
              const v = !mock
              setMock(v)
              setMockState(v)
            }}
          >
            <i />
          </button>
        </div>

        <div className="setrow">
          <div>
            <div className="t">Slow replies</div>
            <div className="d">Simulate the ~30s ceiling to feel the locked composer. Mock only.</div>
          </div>
          <button
            className={`toggle${slow ? ' on' : ''}`}
            aria-label="Toggle slow replies"
            onClick={() => {
              const v = !slow
              setSlow(v)
              setSlowState(v)
            }}
          >
            <i />
          </button>
        </div>

        <div className="setrow" style={{ borderBottom: 'none' }}>
          <div>
            <div className="t">API key</div>
            <div className="d">Stored only on this device.</div>
          </div>
          <button className="linkbtn" onClick={onSignOut}>
            Clear key
          </button>
        </div>
      </div>
    </div>
  )
}
