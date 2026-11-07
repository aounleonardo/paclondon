/**
 * Upload Bill's vacant-houses JSON into Netlify Blobs.
 *
 *   npm run upload:vacant-houses -- path/to/islington-vacant-houses.json
 */
import { config as loadEnv } from 'dotenv'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMazesStore } from './lib/netlifyBlobs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
loadEnv({ path: path.join(root, '.env') })

interface VacantHousesBlob {
  id: string
  label: string
  kind: 'vacant-houses'
  generatedAt: string
  houses: Array<{
    id: string
    label?: string
    lat: number
    lng: number
  }>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseVacantHousesBlob(payload: unknown): VacantHousesBlob {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object')
  }
  const record = payload as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error('Missing string "id" (e.g. "islington")')
  }
  if (typeof record.label !== 'string' || !record.label.trim()) {
    throw new Error('Missing string "label"')
  }
  if (record.kind !== 'vacant-houses') {
    throw new Error('"kind" must be "vacant-houses"')
  }
  if (typeof record.generatedAt !== 'string' || !record.generatedAt.trim()) {
    throw new Error('Missing string "generatedAt" (ISO-8601)')
  }
  if (!Array.isArray(record.houses)) {
    throw new Error('"houses" must be an array')
  }

  const houses = record.houses.map((house, index) => {
    if (!house || typeof house !== 'object') {
      throw new Error(`houses[${index}] must be an object`)
    }
    const item = house as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`houses[${index}].id must be a non-empty string`)
    }
    if (!isFiniteNumber(item.lat) || !isFiniteNumber(item.lng)) {
      throw new Error(`houses[${index}] needs numeric lat/lng`)
    }
    return {
      id: item.id.trim(),
      label: typeof item.label === 'string' ? item.label.trim() : undefined,
      lat: item.lat,
      lng: item.lng,
    }
  })

  return {
    id: record.id.trim(),
    label: record.label.trim(),
    kind: 'vacant-houses',
    generatedAt: record.generatedAt.trim(),
    houses,
  }
}

async function main(): Promise<void> {
  const inputArg = process.argv[2]
  if (!inputArg) {
    throw new Error('Usage: npm run upload:vacant-houses -- path/to/file.json')
  }

  const inputPath = path.resolve(process.cwd(), inputArg)
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as unknown
  const payload = parseVacantHousesBlob(raw)
  const key = `${payload.id}/vacant-houses`

  const store = getMazesStore()
  await store.setJSON(key, payload, {
    metadata: {
      label: payload.label,
      kind: 'vacant-houses',
      count: String(payload.houses.length),
      generatedAt: payload.generatedAt,
    },
  })

  const check = await store.get(key, { type: 'json' }) as VacantHousesBlob | null
  if (!check || check.kind !== 'vacant-houses') {
    throw new Error('Upload verification failed')
  }

  console.log(`Uploaded ${key} with ${check.houses.length} houses from ${path.relative(root, inputPath)}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
