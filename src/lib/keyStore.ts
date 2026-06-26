// The Nomi API key is client-side (SPEC §1, §2): entered in the UI, stored
// locally, and attached to every /api/* request. localStorage (not Dexie) so the
// fetch layer and the first-run gate can read it synchronously.

const STORAGE_KEY = 'companion.apiKey'

export const getApiKey = (): string => localStorage.getItem(STORAGE_KEY) ?? ''
export const hasApiKey = (): boolean => getApiKey().length > 0

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY)
}
