// Local-only settings (SPEC §4 Settings). Nothing here calls the API.

const MOCK = 'companion.mockMode'
const SLOW = 'companion.slowReplies'

// Mock vs live responder. The DEFAULT is environment-based: local dev (`netlify
// dev` / Vite) defaults to mock so the chat can be built/tested without sending
// real messages or consuming quota; a production build defaults to the live API.
// An explicit toggle in Settings overrides the default and persists per-device.
export const isMock = (): boolean => {
  const override = localStorage.getItem(MOCK)
  if (override === 'true') return true
  if (override === 'false') return false
  return import.meta.env.DEV // unset → dev = mock, prod = live
}
export const setMock = (v: boolean): void => localStorage.setItem(MOCK, String(v))

// Slow replies simulate the ~30s generation ceiling so the locked composer can be
// felt (mirrors the prototype's toggle). Mock-mode only.
export const isSlow = (): boolean => localStorage.getItem(SLOW) === 'true'
export const setSlow = (v: boolean): void => localStorage.setItem(SLOW, String(v))

// Message length cap. VERIFY: 400 free / 800 subscription (SPEC §2 MessageLengthLimitExceeded).
export const CHAR_CAP = 400
