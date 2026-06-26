import { useEffect, useState } from 'react'
import { db } from './db'
import { getApiKey } from './keyStore'

// Fetch-once avatar blob cache (SPEC §4 Assets). The webp (verified ~60 KB) is
// stored in Dexie under `avatar:<uuid>` and served from a local object URL, so
// there is no re-fetch flicker. Object URLs are cached for the page lifetime.

const urlCache = new Map<string, string>()

async function loadAvatarUrl(uuid: string): Promise<string | null> {
  const cached = urlCache.get(uuid)
  if (cached) return cached

  const key = `avatar:${uuid}`
  let asset = await db.assets.get(key)
  if (!asset) {
    try {
      const res = await fetch(`/api/nomis/${uuid}/avatar`, {
        headers: { Authorization: getApiKey() },
      })
      if (!res.ok) return null
      const blob = await res.blob()
      asset = { key, blob }
      await db.assets.put(asset)
    } catch {
      return null
    }
  }
  const url = URL.createObjectURL(asset.blob)
  urlCache.set(uuid, url)
  return url
}

export function useAvatarUrl(uuid: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (uuid ? (urlCache.get(uuid) ?? null) : null))
  useEffect(() => {
    if (!uuid) return
    let alive = true
    loadAvatarUrl(uuid).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [uuid])
  return url
}
