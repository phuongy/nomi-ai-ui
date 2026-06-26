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

export default (request: Request) => app.fetch(request)

// Rate-limit backstop against client loop bugs (SPEC §7.1). Code-based rule,
// available on all Netlify plans. Also declares the route for this edge function.
export const config: Config = {
  path: '/api/*',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
