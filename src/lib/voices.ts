import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from './db'

// The full Gemini 2.5 TTS prebuilt-voice catalog with Google's published tone
// descriptors. The saved per-Nomi preference is always one of these names —
// that's what the live Gemini path sends as voiceName. In mock mode tts.ts maps
// the name to a browser speechSynthesis voice best-effort (Web Speech has its
// own, unrelated voice set), so dev playback still sounds distinct per Nomi.
export type GeminiVoice = { name: string; tone: string }

export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Zephyr', tone: 'Bright' },
  { name: 'Puck', tone: 'Upbeat' },
  { name: 'Charon', tone: 'Informative' },
  { name: 'Kore', tone: 'Firm' },
  { name: 'Fenrir', tone: 'Excitable' },
  { name: 'Leda', tone: 'Youthful' },
  { name: 'Orus', tone: 'Firm' },
  { name: 'Aoede', tone: 'Breezy' },
  { name: 'Callirrhoe', tone: 'Easy-going' },
  { name: 'Autonoe', tone: 'Bright' },
  { name: 'Enceladus', tone: 'Breathy' },
  { name: 'Iapetus', tone: 'Clear' },
  { name: 'Umbriel', tone: 'Easy-going' },
  { name: 'Algieba', tone: 'Smooth' },
  { name: 'Despina', tone: 'Smooth' },
  { name: 'Erinome', tone: 'Clear' },
  { name: 'Algenib', tone: 'Gravelly' },
  { name: 'Rasalgethi', tone: 'Informative' },
  { name: 'Laomedeia', tone: 'Upbeat' },
  { name: 'Achernar', tone: 'Soft' },
  { name: 'Alnilam', tone: 'Firm' },
  { name: 'Schedar', tone: 'Even' },
  { name: 'Gacrux', tone: 'Mature' },
  { name: 'Pulcherrima', tone: 'Forward' },
  { name: 'Achird', tone: 'Friendly' },
  { name: 'Zubenelgenubi', tone: 'Casual' },
  { name: 'Vindemiatrix', tone: 'Gentle' },
  { name: 'Sadachbia', tone: 'Lively' },
  { name: 'Sadaltager', tone: 'Knowledgeable' },
  { name: 'Sulafat', tone: 'Warm' },
]

export const DEFAULT_VOICE = 'Kore'
export const isVoice = (name: string): boolean => GEMINI_VOICES.some((v) => v.name === name)

// Per-Nomi voice preference, stored in meta (key `voice:<uuid>`) so it survives
// nomi list re-syncs. Unset → DEFAULT_VOICE.
const voiceKey = (uuid: string) => `voice:${uuid}`

export async function getVoice(uuid: string): Promise<string> {
  return (await getMeta<string>(voiceKey(uuid))) ?? DEFAULT_VOICE
}

export async function setVoice(uuid: string, name: string): Promise<void> {
  await setMeta(voiceKey(uuid), name)
}

// Live read for the picker UI.
export function useVoice(uuid: string): string {
  return useLiveQuery(() => getVoice(uuid), [uuid]) ?? DEFAULT_VOICE
}
