# Companion Client — Build Spec (Claude Code handoff)

A personal, local-first web client for the Nomi API. Single user (you), not shipped, not multi-tenant. The goal is a fast, stable, polished chat experience that fixes Nomi's clunky native UI: instant navigation, no flicker, optimistic send, graceful handling of the one-reply-at-a-time constraint.

This spec is the source of truth for the build. Anything marked **VERIFY** must be confirmed against the live API before the related code is finalised (commands in the Verification section). Treat the verification block as a first task, not an afterthought, because two design decisions depend on its results.

---

## 1. Architecture

- **Client:** Vite + React SPA. Dexie (IndexedDB) is the source of truth for all rendering. The UI never blocks on the network; it renders from Dexie and reconciles in the background.
- **Proxy:** a thin Hono server that relays to `api.nomi.ai`. It is **stateless about the key** — it holds none. The browser sends the key on each request (from local storage) and the proxy forwards it upstream verbatim. The proxy exists to bypass CORS and host the long-running `/chat` call, not to hide the key.
- **Key is client-side.** The user pastes the key into Settings; it is saved locally (Dexie/localStorage) and attached to every `/api/*` call. This makes the app a static deploy (Netlify, etc.) with a relay — no server secret to provision. Trade-off: the key lives in the browser, acceptable only because this is a personal, single-user, local-first app (the threat model here).
- **Same origin:** the SPA build and the `/api/*` relay are served from one origin (one Hono process locally; static site + Function on Netlify), so the browser→proxy hop has no CORS to configure.
- **Long-lived call vs. serverless timeout.** Replies can take up to 30s. Locally, the long-lived Hono process is fine. On Netlify, **deploy the relay as an Edge Function, not a regular Function** (resolved in V7): Edge Functions allow a **40s response-header window** and exclude `fetch`/wait time from the 50ms CPU budget, so a ~30s blocking `/chat` fits cleanly. Regular sync Functions are account-dependent (10s–60s) and not safe for this. Fallback if ever needed: the same stateless relay on a small VPS, with the static SPA pointed at it.
- **The proxy is the swap seam.** Every call goes through it. When the custom backend is built later, only the proxy's forward target changes; the SPA and Dexie layer stay untouched.

```
browser (SPA, Dexie)  <-->  Hono proxy (holds key)  <-->  api.nomi.ai
        same origin               localhost / VPS
```

---

## 2. API context (Nomi v1)

Base URL: `https://api.nomi.ai/v1`
Auth: header `Authorization: <api-key>`. The key is a raw UUID, **no `Bearer` prefix**. Key comes from the Integration tab of the Nomi profile. In this client it is **entered in the UI (Settings) and stored locally**, then sent with each request and forwarded verbatim by the proxy — there is no server-side env var.
Responses are JSON. Requests with a body must set `Content-Type: application/json`.

### Endpoints (documented)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/nomis` | List the Nomis on the account |
| GET | `/v1/nomis/:id` | Get one Nomi's details |
| POST | `/v1/nomis/:id/chat` | Send a message, get the reply (blocking) |
| GET | `/v1/nomis/:id/avatar` | Fetch one Nomi's avatar (webp) |
| GET | `/v1/rooms` | List rooms |
| POST | `/v1/rooms` | Create a room with one or more Nomis |
| GET | `/v1/rooms/:id` | Get one room's details |
| POST | `/v1/rooms/:id/chat` | Post a message to the room as the user |
| POST | `/v1/rooms/:id/chat/request` | Ask a specific Nomi to reply in the room |
| PUT | `/v1/rooms/:id` | Update a room |
| DELETE | `/v1/rooms/:id` | Delete a room |

### Chat endpoint shape (confirmed)

```ts
// POST /v1/nomis/:id/chat
// Request
{ messageText: string }

// Response
{
  sentMessage:  { uuid: string; text: string; sent: string /* ISO */ };
  replyMessage: { uuid: string; text: string; sent: string /* ISO */ };
}
```

Note: the reply is **text only**. There are no image or media fields. In-app selfies and generated art do not come through the API.

### Error types (use these to drive UI states)

| Error | Meaning | Client handling |
|---|---|---|
| `NomiStillResponding` | A reply is already in flight for this Nomi (UI or API) | Queue the send; do not error. This is the one-in-flight rule. |
| `NoReply` | No reply within 30s (rare, server issue) | Mark the pending bubble failed, offer retry. |
| `MessageLengthLimitExceeded` | Over the cap | Enforce client-side first: 400 chars free, 800 subscription. |
| `LimitExceeded` | Daily message quota exhausted | Surface a clear, non-blocking notice. |
| `NomiNotReady` | Brief window right after Nomi creation | Retry after a few seconds. |
| `OngoingVoiceCallDetected` | Nomi is in a voice call | Surface, block send. |
| `NomiNotFound` / `InvalidRouteParams` | Bad id | Treat as a bug; log. |
| `InvalidContentType` / `InvalidBody` | Bad request | Treat as a bug; log. |

Rate limits exist but are described as generous; a 429 returns a standard error body. Back off on 429.

### Hard constraints this API imposes (design around these)

1. **Text only.** No media via the API except per-Nomi avatars. No media gallery is possible.
2. **No history endpoint.** Nothing returns past messages (**VERIFY V1** re: the nomi-detail payload). Assume Dexie is the only history and the client accumulates forward from empty.
3. **One reply in flight per Nomi.** Enforced by `NomiStillResponding`. The composer must lock or queue while a reply is pending.
4. **30s ceiling.** `NoReply` caps generation. Use this as the client timeout bound.
5. **No presence.** There is no online/last-seen endpoint. Do not show "online" as if it were real.
6. **No push / webhook.** Proactive (unprompted) messages cannot be received for a 1:1. Out of scope for v1.
7. **No settings/profile API.** Anything in a Settings screen is local client state only.

---

## 3. Verification (run first, with your real key)

These resolve the **VERIFY** items. Run them against the live API and record the results in the repo (e.g. `docs/api-findings.md`) so the schema is built from fact, not assumption.

```bash
export NOMI_KEY="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
BASE="https://api.nomi.ai/v1"

# V-fields: exact shape of the Nomi list (field names for the schema)
curl -s -H "Authorization: $NOMI_KEY" "$BASE/nomis" | jq

# V1 (DESIGN-CRITICAL): does the nomi-detail payload include any recent messages?
#   -> if yes, you get a nicer first load (backfill on open)
#   -> if no, design for an empty thread on a fresh install (the safe default)
curl -s -H "Authorization: $NOMI_KEY" "$BASE/nomis/<NOMI_UUID>" | jq

# V2: confirm /chat is a single blocking JSON response (not streamed); note wall time
time curl -s -H "Authorization: $NOMI_KEY" -H "Content-Type: application/json" \
  -d '{"messageText":"ping"}' "$BASE/nomis/<NOMI_UUID>/chat" | jq

# V4: room object shape (needed for create + update payloads)
curl -s -H "Authorization: $NOMI_KEY" "$BASE/rooms" | jq
#   Known from community use: PUT /rooms/:id expects name + backchannelingEnabled + nomiUuids.
#   Confirm field names and the create (POST /rooms) body before building the New-room flow.

# V5: avatar content type + caching headers
curl -s -D - -H "Authorization: $NOMI_KEY" "$BASE/nomis/<NOMI_UUID>/avatar" -o /tmp/av.webp; file /tmp/av.webp

# V6 (optional): trip the rate limit deliberately to see the 429 body, so backoff is built to spec

# V7 (deploy): the relay & key-from-header model.
#   a) CORS: can the browser call Nomi directly? Almost certainly not (server API, no CORS
#      headers) -> the relay stays required even though the key is now client-side.
#   b) Timeout: RESOLVED via docs -> deploy the relay as a Netlify EDGE Function. Edge
#      Functions give a 40s response-header window and exclude fetch/wait from the 50ms CPU
#      budget, so the ~30s blocking /chat fits. (Regular sync Functions are account-dependent,
#      10s-60s, and not safe.) Still confirm empirically: time one real ~30s reply on the
#      deployed edge function before trusting it.
#      Refs: docs.netlify.com/build/edge-functions/limits/
```

Decision gates:
- **V1 = no messages** -> confirm "local is the only history" model. Empty threads on fresh install. (This is the assumption the rest of the spec is written against.)
- **V1 = some messages** -> add a one-time backfill into Dexie on first open of each conversation.
- **V4** -> lock the exact create/update room payloads before writing the rooms feature.
- **V7** -> RESOLVED: relay ships as a Netlify Edge Function (40s header window covers the 30s `/chat`). VPS fallback only if an empirical timing test fails.

---

## 4. Functional requirements

Derived from the approved prototype. Caveats from the constraints above are baked in.

**Conversation list**
- Unified list of Nomis and rooms, sorted by **local** `lastActivityAt` (derived from messages through this client, since there is no server activity feed).
- Per-row: avatar, name, last-message preview, relative time, unread dot.
- **Unread is client-computed** ("arrived since you last opened"), not server read-state. Do not imply sync with the official app.

**Chat**
- Render the thread synchronously from Dexie. No spinner-then-content swap. No remount on conversation switch (swap data, keep the view mounted).
- **Optimistic send:** write the user message to Dexie and render it immediately; never wait on the server to show the user's own message.
- **Optimistic, then posting blocked (1:1):** the user's own message renders instantly, then *posting* locks until the reply returns. The composer **stays editable and focused** (you can compose the next message ahead); only the submit path is disabled — send button + Enter-to-post — with a typing indicator. This is a hard block, not a guess: the API allows only one reply in flight per Nomi (`NomiStillResponding`), so a second post must never start. Show the "one message at a time / cancels in 30s" hint while locked.
- **Gate submission, not input:** while a reply is pending, disable every control that could *post* another message to the same Nomi — send button, Enter-to-post, retry, and (rooms) nudge buttons. **Do not disable the text input itself** — that blurs it and forces a re-click each reply (a real UX regression); keep it editable/focused and gate only the submit path. Re-enable posting on reply, failure, or timeout.
- **Reconcile:** on `replyMessage`, write it in; map the optimistic temp id to `sentMessage.uuid`.
- **Errors:** `NomiStillResponding` -> queue. `NoReply`/timeout -> failed bubble with retry. `LimitExceeded` -> notice. Length enforced client-side at the verified cap.
- **Recents strip** in the chat header for zero-navigation hopping between conversations.
- **Quick-switcher** (search + arrow/enter) reachable from the list and from within a chat.

**Rooms**
- Post to room via `/rooms/:id/chat`.
- **Nudge** a specific member via `/rooms/:id/chat/request`.
- **Serialize sends (rooms too):** a room has multiple members, but still send only **one** message/nudge at a time. While any room request is in flight, lock the composer and disable all nudge buttons; unlock when it resolves. Group chat differs from 1:1 in *who* can reply, not in the one-at-a-time rule — the blocking behavior is the same.
- Create a room via `/rooms` (multi-select). Member **removal is not cleanly supported**: model "edit members" as leave/recreate, not in-place edit.
- Room avatar is composited client-side (no room avatar endpoint).

**Assets**
- Fetch each Nomi avatar once, cache the webp blob in Dexie (or Cache API), serve locally thereafter. No re-fetch flicker.

**Settings (local only)**
- **API key field:** paste/edit the Nomi key (stored locally, the only credential entry point); a "test key" action hits `GET /api/nomis` to confirm it works; a clear-key button wipes it.
- **First run:** if no key is stored, gate the app behind a key-entry screen — it can't list Nomis without one. A `401` from the proxy (missing/invalid key) sends the user back to this screen.
- Display name, theme, and any dev toggles. Beyond the key test, nothing here is account settings — local client state only.

**Presence**
- Drop "online", or replace with local last-activity. No presence data exists.

---

## 5. Data model (Dexie)

Confirm field names against V-fields / V4 before finalising. Indicative schema:

```ts
// db.ts (Dexie)
nomis:      'uuid, name, updatedAt'                      // from GET /v1/nomis
rooms:      'id, name, *memberUuids, updatedAt'          // from GET /v1/rooms
messages:   'clientId, convoKey, serverUuid, ts, status' // convoKey = `nomi:<uuid>` | `room:<id>`
assets:     'key'                                        // key = `avatar:<uuid>`, value = Blob
meta:       'key'                                        // apiKey, lastActivityAt per convo, unread counts, settings

// message record
type Message = {
  clientId: string;          // local id, assigned on optimistic send
  convoKey: string;          // groups messages into a conversation
  serverUuid?: string;       // filled from sentMessage.uuid / replyMessage.uuid
  from: 'user' | string;     // 'user' or the Nomi name
  text: string;
  ts: number;
  status: 'pending' | 'sent' | 'failed';
}
```

`lastActivityAt` and `unread` live in `meta` and are updated on every send and reply. A fresh install has no activity data until messages flow. The Nomi key is stored under `meta['apiKey']` (or `localStorage`) and read by the API client on every request; a fresh install has no key until the user enters one.

---

## 6. Proxy (Hono)

Holds the key, forwards to Nomi, relays the response. Passthrough per endpoint. Key only in env.

```ts
import { Hono } from 'hono'
const app = new Hono()
const BASE = 'https://api.nomi.ai/v1'

// The browser sends the user's key in the Authorization header; forward it verbatim.
// The proxy never stores a key. Short-circuit if it is missing so the UI can prompt.
const headers = (c) => ({
  Authorization: c.req.header('Authorization') ?? '',
  'Content-Type': 'application/json',
})

app.get('/api/nomis', async (c) =>
  c.json(await (await fetch(`${BASE}/nomis`, { headers: headers(c) })).json()))

app.post('/api/nomis/:id/chat', async (c) => {
  const r = await fetch(`${BASE}/nomis/${c.req.param('id')}/chat`, {
    method: 'POST', headers: headers(c), body: JSON.stringify(await c.req.json()),
    // IMPORTANT: disable client-side fetch timeouts so a 30s generation is not cut off.
  })
  return c.json(await r.json(), r.status)        // pass status through for error mapping
})

// + GET /api/nomis/:id, GET /api/nomis/:id/avatar (return the blob),
//   GET/POST /api/rooms, GET /api/rooms/:id, POST /api/rooms/:id/chat,
//   POST /api/rooms/:id/chat/request, PUT/DELETE /api/rooms/:id

// also serve the static Vite build from this same process (same origin -> no CORS)
export default app
```

Proxy notes:
- The client attaches `Authorization: <local key>` to every `/api/*` request; the proxy forwards it. No env var.
- If the header is missing/empty, short-circuit with a 401 so the UI prompts for the key instead of round-tripping to Nomi.
- Disable or raise Node/undici fetch timeouts on the outbound `/chat` call so it can run the full 30s.
- Pass the upstream status code through so the client can branch on the error types.
- Avatar route returns the binary; set the right content-type from the upstream response.
- Deploy: locally one Hono process serves SPA + `/api/*`. On Netlify, the same Hono app runs as an **Edge Function** (Deno) handling `/api/*`, with the static SPA served alongside — Edge, not a regular Function, so the 30s `/chat` fits the 40s header window (V7).
- Rate-limit the relay at the edge as a runaway backstop (see §7.1). Code-based rule on all plans:

```ts
// Netlify edge function config — rate-limit backstop on the relay
export const config = {
  path: '/api/*',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] }, // -> 429 on exceed
}
```

---

## 7. Send state machine (the core interaction)

```
idle
  -> user submits (text within cap)
  -> write optimistic message (status: pending) to Dexie, render immediately
  -> lock composer, show typing indicator
  -> POST /chat
       success      -> write replyMessage; set sentMessage uuid on the optimistic record (status: sent); unlock; bump lastActivityAt
       NomiStillResponding -> keep queued; retry when current reply lands
       NoReply / timeout    -> mark pending message failed; offer retry; unlock
       LimitExceeded        -> notice; unlock; do not retry automatically
```

Client timeout: ~35s AbortController (just past the 30s server ceiling) so a genuinely stuck request fails cleanly rather than hanging the UI.

### 7.1 Runaway guardrails (defense-in-depth)

The only realistic way this app hurts itself (or burns the Netlify quota) is a buggy loop hammering `/chat`. Two independent layers make that structurally impossible. The client layer is primary (it never wastes a call); the edge layer is the backstop (it catches any bug that bypasses the client).

**Layer 1 — client (primary):**
- **One-in-flight lock per Nomi** (the core rule): while a reply is pending the conversation is locked — composer disabled, and the send / Enter-to-send / retry / nudge controls all disabled — so a second send to the same Nomi can never start. Applies to 1:1 (the whole chat is blocked until the reply) and rooms (serialize to one request at a time). The optimistic message still renders instantly; it's the *next* send that's blocked, not the display.
- **Bounded retries:** every retry path (`NoReply`, `429`) is capped at **3 attempts** with exponential backoff + jitter (~1s, 2s, 4s), then drops to a *manual* failed-bubble. No path auto-retries past the cap.
- **Circuit breaker:** track consecutive failures; after **5 failures within 60s**, open the circuit — block all sends for a **60s cooldown** and show a banner. A broken backend gets backed off, not hammered.
- **Global send budget (the catch-all):** a client token-bucket capping **all** `/chat` calls at **~20 per rolling 60s** across every conversation. This is the net under an infinite-loop bug: even a path that skips the normal lock trips the budget and hard-stops with a visible error instead of looping.
- **Never** add a bare `setInterval`/auto-retry without backoff to the send path.

**Layer 2 — edge relay (backstop):**
- Netlify built-in rate limiting on `/api/*`: **windowLimit 60, windowSize 60s, aggregateBy `ip`+`domain`**, action block → `429` (code-based rule, available on all plans; max window 180s). Single-user traffic never approaches it; a runaway client (hundreds/sec) hits it immediately and is cut off at the edge before reaching Nomi. Tighten the `/chat` path further if wanted.
- The client treats this edge `429` like any other (backoff, then circuit-break), so the two layers compose instead of fighting.

---

## 8. Component map

```
<App>                      // routing-light; screen = list | chat; Dexie hooks
  <ConversationList>       // unified nomis+rooms, sorted by local lastActivityAt
    <ConversationRow>
  <ChatScreen>
    <ChatHeader>           // avatar, name, status (drop presence), jump icon
    <RecentsStrip>         // zero-nav hopping
    <MessageThread>        // virtualized; renders from Dexie; optimistic + typing
    <NudgeBar>             // rooms only -> /chat/request
    <Composer>             // char counter (verified cap), lock/queue, send
  <QuickSwitcher>          // search + keyboard nav, from list or chat
  <NewSheet>               // start chat / create room (multi-select)
  <SettingsSheet>          // local-only settings
  <AvatarCache>            // fetch-once blob cache util
```

Prototype reference: `companion-client-prototype.html` (the approved look and interactions). Match its visual design: deep warm ink background, single ember accent for the user's own messages and active states, companion names in a soft serif, mono for timestamps and the counter.

---

## 9. Suggested build order

1. **Verification block** (Section 3). Record findings. Resolve V1 and V4 gates.
2. Hono proxy (stateless — key read from the request header) with `/api/nomis` and `/api/nomis/:id/chat`, same-origin static serving, no timeout on `/chat`.
3. Dexie schema (incl. local key storage) + first-run key-entry gate + the list and chat screens rendering from Dexie (static seed first).
4. Wire real send: optimistic write, POST, reconcile, the full send state machine and error mapping, plus the §7.1 guardrails (bounded retries, circuit breaker, client send-budget) and the edge rate-limit config.
5. Avatar fetch-once blob cache.
6. Recents strip + quick-switcher.
7. Rooms: list, room chat, nudge (`/chat/request`), create-room flow (using V4 payload).
8. Settings (local), polish, reduced-motion and keyboard-focus pass.

---

## 10. Out of scope (v1)

Shipping / app-store distribution. Real auth or multi-user. Media or image generation. Any NSFW model integration (this client is just a front end on Nomi's existing service). Proactive/unprompted message delivery (no push exists). In-place room member removal. Voice calls.

---

## 11. Open questions to resolve during the build

- V1: nomi-detail message backfill (drives empty-state vs first-load behaviour).
- V4: exact `POST /rooms` and `PUT /rooms/:id` payloads.
- V-fields: exact field names on the Nomi list (finalises the Dexie schema).
- Avatar caching headers (V5): whether to trust upstream cache or always store the blob locally.
- V7: RESOLVED — relay deploys as a Netlify **Edge** Function (40s response-header window vs the 30s `/chat`); regular Functions avoided. Only open part: a one-time empirical timing test of a real ~30s reply on the deployed edge function.
