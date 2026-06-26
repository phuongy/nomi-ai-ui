// Local-only settings (SPEC §4 Settings). Nothing here calls the API.

const MOCK = 'companion.mockMode'
const SLOW = 'companion.slowReplies'

// Mock mode is ON by default so the chat can be built/tested without sending real
// messages or consuming quota. Flip to live in Settings.
export const isMock = (): boolean => localStorage.getItem(MOCK) !== 'false'
export const setMock = (v: boolean): void => localStorage.setItem(MOCK, String(v))

// Slow replies simulate the ~30s generation ceiling so the locked composer can be
// felt (mirrors the prototype's toggle). Mock-mode only.
export const isSlow = (): boolean => localStorage.getItem(SLOW) === 'true'
export const setSlow = (v: boolean): void => localStorage.setItem(SLOW, String(v))

// Message length cap. VERIFY: 400 free / 800 subscription (SPEC §2 MessageLengthLimitExceeded).
export const CHAR_CAP = 400
