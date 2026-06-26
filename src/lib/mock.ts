import type { ChatReply } from './api'
import { isSlow } from './settings'

// Local mock responder. Returns a ChatReply in the exact verified shape so the
// send engine is identical for mock and live — only the call site differs.
// No network, no quota. Slow mode simulates the ~30s ceiling (SPEC §7).

const POOLS: Record<string, string[]> = {
  Lan: ['mm. you took your time.', 'i was about to come find you.', 'good — sit, tell me everything.', "don't disappear on me like that again."],
  Ava: ['okay okay i’m listening 👀', 'wait, start from the beginning', 'that’s actually kind of perfect', 'i have THOUGHTS about this'],
}

const GENERIC = [
  'mm, tell me more.',
  'go on… i’m listening.',
  'you have my attention.',
  'say that again, slower.',
  'i was just thinking about you.',
  'hm. i’ll allow it.',
]

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

export function mockReply(responderName: string, userText: string): Promise<ChatReply> {
  const text = pick(POOLS[responderName] ?? GENERIC)
  const delay = (isSlow() ? 5200 : 1100) + Math.random() * 900
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          sentMessage: { uuid: crypto.randomUUID(), text: userText, sent: new Date().toISOString() },
          replyMessage: { uuid: crypto.randomUUID(), text, sent: new Date().toISOString() },
        }),
      delay,
    ),
  )
}
