import { getStore } from '@netlify/blobs'

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env var ${name}`)
  }
  return value
}

export function getMazesStore() {
  const name = process.env.NETLIFY_BLOBS_STORE?.trim() || 'mazes'
  const region = process.env.NETLIFY_BLOBS_REGION?.trim() || undefined
  return getStore({
    name,
    siteID: requireEnv('NETLIFY_SITE_ID'),
    token: requireEnv('NETLIFY_AUTH_TOKEN'),
    ...(region ? { region } : {}),
  })
}
