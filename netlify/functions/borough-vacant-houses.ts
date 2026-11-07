import { getStore } from '@netlify/blobs'
import type { Context } from '@netlify/functions'

const STORE_NAME = process.env.NETLIFY_BLOBS_STORE?.trim() || 'mazes'

function boroughFromRequest(req: Request, context: Context): string {
  const url = new URL(req.url)
  return (
    url.searchParams.get('borough')
    || context.params?.id
    || process.env.DEFAULT_BOROUGH_ID
    || 'islington'
  ).trim()
}

export default async (req: Request, context: Context) => {
  const borough = boroughFromRequest(req, context)
  if (!borough) {
    return new Response(JSON.stringify({ error: 'missing borough' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const store = getStore(STORE_NAME)
  const payload = await store.get(`${borough}/vacant-houses`, { type: 'json' })
  if (!payload) {
    return new Response(JSON.stringify({
      id: borough,
      label: borough,
      kind: 'vacant-houses',
      generatedAt: new Date(0).toISOString(),
      houses: [],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    })
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  })
}

export const config = {
  path: '/api/borough/:id/vacant-houses',
}
