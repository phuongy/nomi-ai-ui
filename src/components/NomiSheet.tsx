import { GEMINI_VOICES, useVoice, setVoice } from '../lib/voices'
import { toggle, usePlayingId } from '../lib/tts'

// Per-Nomi voice settings. Pick from the Gemini voice catalog; the choice saves
// immediately (meta-backed, survives nomi sync) and drives bubble playback. Each
// row has a ▶ preview — in mock it just runs the play/stop lifecycle (no sound),
// in prod it speaks a sample line in that voice.
const SAMPLE = 'Hey — this is how I sound. Tap a bubble to hear me read it.'

export function NomiSheet({ uuid, name, onClose }: { uuid: string; name: string; onClose: () => void }) {
  const current = useVoice(uuid)
  const playingId = usePlayingId()

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Voice for {name}</h2>
        <div className="sub" style={{ marginTop: -4 }}>
          Used when you play a message · {GEMINI_VOICES.length} Gemini voices
        </div>

        <div className="voicelist">
          {GEMINI_VOICES.map((v) => {
            const on = v.name === current
            const previewId = `preview:${v.name}`
            const previewing = playingId === previewId
            return (
              <div
                key={v.name}
                className={`opt voice${on ? ' on' : ''}`}
                onClick={() => void setVoice(uuid, v.name)}
              >
                <button
                  className={`vprev${previewing ? ' on' : ''}`}
                  aria-label={`Preview ${v.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggle(previewId, SAMPLE, v.name)
                  }}
                >
                  {previewing ? '◼' : '▶'}
                </button>
                <span className="opt-nm">
                  {v.name}
                  <span className="voice-tone">{v.tone}</span>
                </span>
                <span className={`chk${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
