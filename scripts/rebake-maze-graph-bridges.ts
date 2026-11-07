/**
 * Apply junction-gap bridging to an existing baked maze JSON (no Overpass refetch).
 *
 *   npx vite-node scripts/rebake-maze-graph-bridges.ts --borough=islington
 *   npx vite-node scripts/rebake-maze-graph-bridges.ts --borough=islington --upload
 */
import { config as loadEnv } from 'dotenv'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRAPH_BRIDGE_VERSION } from '../src/data/precomputedMaze'
import { bridgeRoadGraphGaps } from '../src/generator/bridgeRoadGraphGaps'
import type { PlayableMap } from '../src/types'
import { getMazesStore } from './lib/netlifyBlobs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
loadEnv({ path: path.join(root, '.env') })

const SHOULD_UPLOAD = process.argv.includes('--upload')

function argValue(prefix: string, fallback: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`))
  return match ? match.slice(prefix.length + 1) : fallback
}

const BOROUGH_ID = argValue('--borough', 'islington')

interface MazeBlob {
  id: string
  label: string
  kind?: string
  generatedAt?: string
  graphBridgeVersion?: number
  viewport: unknown
  map: PlayableMap
}

function gapBridgeCount(edges: PlayableMap['edges']): number {
  return edges.filter((edge) => edge.id.startsWith('bridge:')).length
}

async function main(): Promise<void> {
  const mazePath = path.join(root, 'public', 'mazes', `${BOROUGH_ID}.json`)
  const raw = JSON.parse(await readFile(mazePath, 'utf8')) as MazeBlob

  const beforeBridges = gapBridgeCount(raw.map.edges)
  const bridged = bridgeRoadGraphGaps({
    nodes: raw.map.nodes,
    edges: raw.map.edges,
  })
  const afterBridges = gapBridgeCount(bridged.edges)

  const payload: MazeBlob = {
    ...raw,
    generatedAt: new Date().toISOString(),
    graphBridgeVersion: GRAPH_BRIDGE_VERSION,
    map: {
      ...raw.map,
      nodes: bridged.nodes,
      edges: bridged.edges,
    },
  }

  await writeFile(mazePath, `${JSON.stringify(payload)}\n`, 'utf8')
  const bytes = Buffer.byteLength(JSON.stringify(payload))
  console.log(
    `Rebaked ${path.relative(root, mazePath)}: edges ${raw.map.edges.length} → ${bridged.edges.length}`
      + ` (≤1 m bridge edges ${beforeBridges} → ${afterBridges}, ${(bytes / 1024).toFixed(1)} KB)`,
  )

  if (!SHOULD_UPLOAD) {
    console.log('Skipping Netlify upload (pass --upload to push islington/maze blob).')
    return
  }

  const store = getMazesStore()
  const mazeKey = `${raw.id}/maze`
  await store.setJSON(mazeKey, payload, {
    metadata: {
      label: raw.label,
      kind: 'maze',
      generatedAt: payload.generatedAt ?? '',
      graphBridgeVersion: String(GRAPH_BRIDGE_VERSION),
      nodes: String(payload.map.nodes.length),
      edges: String(payload.map.edges.length),
    },
  })
  console.log(`Uploaded blob ${mazeKey}`)

  const check = await store.get(mazeKey, { type: 'json' }) as MazeBlob | null
  if (!check?.map?.edges?.length || check.graphBridgeVersion !== GRAPH_BRIDGE_VERSION) {
    throw new Error('Upload verification failed')
  }
  console.log(`Verified maze blob (${check.map.edges.length} edges, graphBridgeVersion=${check.graphBridgeVersion}).`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
