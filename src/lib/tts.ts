import { useSyncExternalStore } from 'react'
import { db } from './db'
import { getApiKey } from './keyStore'
import { isMock } from './settings'

// Per-bubble TTS playback. One clip plays at a time: starting a new one (or
// re-tapping the playing bubble) stops the current. Components subscribe via
// usePlayingId() to flip their play/stop icon.
//
// Mock mode makes NO sound and NO network call — it just runs the playing-state
// lifecycle (so the icons toggle and auto-clear) on a simulated timer. Live mode
// fetches WAV from the /api/tts edge route (Gemini), caches the blob in Dexie,
// and plays it.

let playingId: string | null = null
const listeners = new Set<() => void>()

function setPlaying(id: string | null) {
  if (id === playingId) return
  playingId = id
  listeners.forEach((l) => l())
}

export function usePlayingId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => playingId,
  )
}

// Active playback handles, cleared by stop().
let audioEl: HTMLAudioElement | null = null
let mockTimer: ReturnType<typeof setTimeout> | null = null

export function stop(): void {
  if (mockTimer) {
    clearTimeout(mockTimer)
    mockTimer = null
  }
  if (audioEl) {
    audioEl.pause()
    audioEl = null
  }
  setPlaying(null)
}

// Toggle playback for a bubble. `text` is the message body; `voice` is a Gemini
// voice name (used live; mock ignores it beyond logging).
export async function toggle(id: string, text: string, voice: string): Promise<void> {
  if (playingId === id) {
    stop()
    return
  }
  stop()
  setPlaying(id)
  if (isMock()) {
    playMock(id, text, voice)
    return
  }
  try {
    await playLive(id, text, voice)
  } catch {
    if (playingId === id) setPlaying(null)
  }
}

// Strip the action asterisks so they aren't read/sent literally; the words stay.
const forSpeech = (text: string) => text.replace(/\*/g, '').trim()

// Simulate a clip of roughly speech length so the stop icon shows for a beat
// then reverts — no audio, no request.
function playMock(id: string, text: string, voice: string): void {
  const spoken = forSpeech(text)
  // eslint-disable-next-line no-console
  console.debug(`[tts:mock] play "${spoken.slice(0, 40)}…" as ${voice}`)
  const ms = Math.min(900 + spoken.length * 45, 6000)
  mockTimer = setTimeout(() => {
    mockTimer = null
    if (playingId === id) setPlaying(null)
  }, ms)
}

async function playLive(id: string, text: string, voice: string): Promise<void> {
  const blob = await getOrFetchAudio(forSpeech(text), voice)
  const url = URL.createObjectURL(blob)
  const el = new Audio(url)
  audioEl = el
  const done = () => {
    URL.revokeObjectURL(url)
    if (playingId === id) setPlaying(null)
  }
  el.onended = done
  el.onerror = done
  await el.play()
}

// Cache by hash(voice + text): identical lines never regenerate or re-bill.
async function getOrFetchAudio(text: string, voice: string): Promise<Blob> {
  const key = await cacheKey(voice, text)
  const hit = await db.audio.get(key)
  if (hit) return hit.blob

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getApiKey() },
    body: JSON.stringify({ text, voice }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const blob = await res.blob()
  await db.audio.put({ key, blob, ts: Date.now() })
  return blob
}

async function cacheKey(voice: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${voice}:${text}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
