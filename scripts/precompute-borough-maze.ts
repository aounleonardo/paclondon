/**
 * Bake a borough playable maze (no vacant houses) and optionally upload to Netlify Blobs.
 *
 *   npx vite-node scripts/precompute-borough-maze.ts
 *   npx vite-node scripts/precompute-borough-maze.ts --borough=islington --upload
 */
import { config as loadEnv } from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRoadData } from '../src/data/overpass'
import { generatePlayableMap } from '../src/generator/generatePlayableMap'
import { DEFAULT_SPAWN } from '../src/map/mapController'
import type { Bounds, PlayableMap, RoadData, RoadGraphEdge, RoadGraphNode, Viewport } from '../src/types'
import { loadBoroughPolygon, pointInRing, splitBounds } from './lib/boroughGeo'
import { getMazesStore } from './lib/netlifyBlobs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
loadEnv({ path: path.join(root, '.env') })

const TILE_ROWS = 3
const TILE_COLS = 3
const SHOULD_UPLOAD = process.argv.includes('--upload')

function argValue(prefix: string, fallback: string): string {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`))
  return match ? match.slice(prefix.length + 1) : fallback
}

const BOROUGH_ID = argValue('--borough', 'islington')

export interface BoroughMazeBlob {
  id: string
  label: string
  kind: 'maze'
  generatedAt: string
  viewport: Viewport
  map: PlayableMap
}

function mergeRoadData(chunks: RoadData[]): RoadData {
  const nodeMap = new Map<string, RoadGraphNode>()
  const edgeMap = new Map<string, RoadGraphEdge>()

  for (const chunk of chunks) {
    for (const node of chunk.nodes) {
      const existing = nodeMap.get(node.id)
      if (!existing) {
        nodeMap.set(node.id, { ...node, neighbors: [...node.neighbors] })
        continue
      }
      for (const neighbor of node.neighbors) {
        if (!existing.neighbors.includes(neighbor)) {
          existing.neighbors.push(neighbor)
        }
      }
    }
    for (const edge of chunk.edges) {
      edgeMap.set(edge.id, { ...edge })
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  }
}

function clipRoadDataToPolygon(roadData: RoadData, ring: { lng: number; lat: number }[]): RoadData {
  const insideIds = new Set(
    roadData.nodes
      .filter((node) => pointInRing(node, ring))
      .map((node) => node.id),
  )

  const nodes = roadData.nodes
    .filter((node) => insideIds.has(node.id))
    .map((node) => ({
      ...node,
      neighbors: node.neighbors.filter((neighbor) => insideIds.has(neighbor)),
    }))

  const edges = roadData.edges.filter((edge) => insideIds.has(edge.from) && insideIds.has(edge.to))
  return { nodes, edges }
}

async function fetchBoroughRoads(bounds: Bounds, ring: { lng: number; lat: number }[]): Promise<RoadData> {
  const tiles = splitBounds(bounds, TILE_ROWS, TILE_COLS)
  console.log(`Fetching roads in ${tiles.length} Overpass tiles...`)
  const chunks: RoadData[] = []

  for (const [index, tile] of tiles.entries()) {
    process.stdout.write(`  tile ${index + 1}/${tiles.length}... `)
    const chunk = await fetchRoadData(tile)
    console.log(`${chunk.nodes.length} nodes / ${chunk.edges.length} edges`)
    chunks.push(chunk)
  }

  const merged = mergeRoadData(chunks)
  console.log(`Merged bbox roads: ${merged.nodes.length} nodes / ${merged.edges.length} edges`)
  const clipped = clipRoadDataToPolygon(merged, ring)
  console.log(`Clipped to borough: ${clipped.nodes.length} nodes / ${clipped.edges.length} edges`)
  return clipped
}

async function main(): Promise<void> {
  const boroughPath = path.join(root, 'public', 'boroughs', `${BOROUGH_ID}.geojson`)
  const outputPath = path.join(root, 'public', 'mazes', `${BOROUGH_ID}.json`)
  const geojson = JSON.parse(await readFile(boroughPath, 'utf8')) as Parameters<typeof loadBoroughPolygon>[0]
  const borough = loadBoroughPolygon(geojson)
  console.log(`Borough ${borough.name} (${BOROUGH_ID}) bounds`, borough.bounds)

  const roadData = await fetchBoroughRoads(borough.bounds, borough.ring)
  const viewport: Viewport = {
    center: { lat: DEFAULT_SPAWN.lat, lng: DEFAULT_SPAWN.lng },
    zoom: DEFAULT_SPAWN.zoom,
    bounds: borough.bounds,
  }

  const map = generatePlayableMap(viewport, roadData, { vacantHouses: [] })
  console.log(
    `PlayableMap mode=${map.sourceMode} nodes=${map.nodes.length} edges=${map.edges.length} vacant=${map.vacantHouses.length}`,
  )

  const payload: BoroughMazeBlob = {
    id: borough.id,
    label: borough.name,
    kind: 'maze',
    generatedAt: new Date().toISOString(),
    viewport,
    map,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8')
  const bytes = Buffer.byteLength(JSON.stringify(payload))
  console.log(`Wrote ${path.relative(root, outputPath)} (${(bytes / 1024).toFixed(1)} KB)`)

  if (!SHOULD_UPLOAD) {
    console.log('Skipping Netlify upload (pass --upload to push blobs).')
    return
  }

  const store = getMazesStore()
  const mazeKey = `${borough.id}/maze`
  const vacantKey = `${borough.id}/vacant-houses`

  await store.setJSON(mazeKey, payload, {
    metadata: {
      label: borough.name,
      kind: 'maze',
      generatedAt: payload.generatedAt,
      nodes: String(map.nodes.length),
      edges: String(map.edges.length),
    },
  })
  console.log(`Uploaded blob ${mazeKey}`)

  await store.setJSON(vacantKey, {
    id: borough.id,
    label: borough.name,
    kind: 'vacant-houses',
    generatedAt: payload.generatedAt,
    houses: [],
  }, {
    metadata: {
      label: borough.name,
      kind: 'vacant-houses',
      count: '0',
    },
  })
  console.log(`Uploaded empty blob ${vacantKey}`)

  const check = await store.get(mazeKey, { type: 'json' }) as BoroughMazeBlob | null
  if (!check?.map?.nodes?.length) {
    throw new Error('Upload verification failed: maze blob missing or empty')
  }
  console.log(`Verified maze blob (${check.map.nodes.length} nodes).`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
