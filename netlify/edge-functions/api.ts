import { Hono } from 'hono'
import type { Config } from '@netlify/edge-functions'

// The stateless relay (SPEC §6). It holds no key: the browser sends the user's
// Nomi key in the Authorization header and we forward it verbatim to api.nomi.ai.
// This same Hono app is the "swap seam" — only BASE changes when a custom
// backend is built later.

const BASE = 'https://api.nomi.ai/v1'

type Vars = { key: string }
const app = new Hono<{ Variables: Vars }>()

// Require the client-supplied key on every call; 401 fast so the UI can prompt
// for it instead of round-tripping to Nomi (SPEC §4, §6).
app.use('/api/*', async (c, next) => {
  const key = c.req.header('Authorization')?.trim()
  if (!key) return c.json({ error: { type: 'MissingApiKey' } }, 401)
  c.set('key', key)
  await next()
})

// JSON passthrough. Preserves the upstream status code so the client can branch
// on Nomi's error types (NomiStillResponding, NoReply, LimitExceeded, …).
// No outbound AbortController: a /chat generation may run the full 30s and must
// not be cut off (SPEC §6). The Edge 40s response-header window covers it (V7).
async function relayJson(key: string, path: string, method = 'GET', body?: string) {
  const upstream = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body,
  })
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Binary passthrough for avatars; carry the upstream content-type through.
async function relayRaw(key: string, path: string) {
  const upstream = await fetch(`${BASE}${path}`, { headers: { Authorization: key } })
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

const id = (c: { req: { param: (k: string) => string } }) => c.req.param('id')

// --- Nomis ---
app.get('/api/nomis', (c) => relayJson(c.get('key'), '/nomis'))
app.get('/api/nomis/:id', (c) => relayJson(c.get('key'), `/nomis/${id(c)}`))
app.get('/api/nomis/:id/avatar', (c) => relayRaw(c.get('key'), `/nomis/${id(c)}/avatar`))
app.post('/api/nomis/:id/chat', async (c) =>
  relayJson(c.get('key'), `/nomis/${id(c)}/chat`, 'POST', await c.req.text()),
)

// --- Rooms ---
app.get('/api/rooms', (c) => relayJson(c.get('key'), '/rooms'))
app.post('/api/rooms', async (c) => relayJson(c.get('key'), '/rooms', 'POST', await c.req.text()))
app.get('/api/rooms/:id', (c) => relayJson(c.get('key'), `/rooms/${id(c)}`))
app.put('/api/rooms/:id', async (c) =>
  relayJson(c.get('key'), `/rooms/${id(c)}`, 'PUT', await c.req.text()),
)
app.delete('/api/rooms/:id', (c) => relayJson(c.get('key'), `/rooms/${id(c)}`, 'DELETE'))
app.post('/api/rooms/:id/chat', async (c) =>
  relayJson(c.get('key'), `/rooms/${id(c)}/chat`, 'POST', await c.req.text()),
)
app.post('/api/rooms/:id/chat/request', async (c) =>
  relayJson(c.get('key'), `/rooms/${id(c)}/chat/request`, 'POST', await c.req.text()),
)

// --- Text-to-speech (Gemini) ---
// Unlike the Nomi routes, this one does NOT forward the user's key upstream: it
// calls Gemini with a server-side GEMINI_API_KEY. Gemini TTS returns raw PCM
// (16-bit, mono, base64), so we wrap it in a WAV header and hand the client a
// ready-to-play blob. The /api/* auth gate above still requires the Nomi key, so
// only signed-in clients can spend the TTS budget.
// Upgrade path: gemini-3.1-flash-tts-preview is newer (more expressive, audio
// tags, streaming) but lives on the new Interactions API (POST /v1beta/interactions,
// different body: input + response_format + speech_config[]). Switching means
// rewriting the fetch + parse below; the client stays the same (still gets WAV).
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'

app.post('/api/tts', async (c) => {
  const apiKey = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(
    'GEMINI_API_KEY',
  )
  if (!apiKey) return c.json({ error: { type: 'MissingGeminiKey' } }, 500)

  const { text, voice } = (await c.req.json()) as { text?: string; voice?: string }
  if (!text) return c.json({ error: { type: 'EmptyText' } }, 400)

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } },
          },
        },
      }),
    },
  )
  if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status })

  const data = await upstream.json()
  const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!inline?.data) return c.json({ error: { type: 'NoAudio' } }, 502)

  const pcm = base64ToBytes(inline.data)
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? '')?.[1] ?? 24000)
  return new Response(pcmToWav(pcm, rate), {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=86400' },
  })
})

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Prepend a 44-byte PCM WAV header (16-bit mono) so an <audio> element can play
// Gemini's raw little-endian PCM.
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample // mono
  const byteRate = sampleRate * blockAlign
  const buf = new ArrayBuffer(44 + pcm.length)
  const view = new DataView(buf)
  const ascii = (offset: string, at: number) => {
    for (let i = 0; i < offset.length; i++) view.setUint8(at + i, offset.charCodeAt(i))
  }
  ascii('RIFF', 0)
  view.setUint32(4, 36 + pcm.length, true)
  ascii('WAVE', 8)
  ascii('fmt ', 12)
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // channels = mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  ascii('data', 36)
  view.setUint32(40, pcm.length, true)
  new Uint8Array(buf, 44).set(pcm)
  return new Uint8Array(buf)
}

export default (request: Request) => app.fetch(request)

// Rate-limit backstop against client loop bugs (SPEC §7.1). Code-based rule,
// available on all Netlify plans. Also declares the route for this edge function.
export const config: Config = {
  path: '/api/*',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
