/**
 * One-shot: fetch OSM roads around Newspeak House, generate a PlayableMap,
 * and write public/mazes/newspeak-house.json for instant load on app open.
 *
 * Run: npx vite-node scripts/precompute-newspeak-maze.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRoadData } from '../src/data/overpass'
import { parseVacantHouses, selectVacantHousesForPlay } from '../src/data/vacantHouses'
import { generatePlayableMap } from '../src/generator/generatePlayableMap'
import { DEFAULT_SPAWN } from '../src/map/mapController'
import type { Bounds, PlayableMap, Viewport } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outputPath = path.join(root, 'public', 'mazes', 'newspeak-house.json')
const vacantPath = path.join(root, 'public', 'vacant-houses.json')

/**
 * Canonical stage size for the baked maze.
 * Slightly larger than a typical panel+map layout so the four mock vacant
 * houses around Newspeak House stay inside the playable bounds.
 */
const VIEWPORT_WIDTH_PX = 1280
const VIEWPORT_HEIGHT_PX = 960

export interface PrecomputedMazeFile {
  id: string
  label: string
  generatedAt: string
  viewport: Viewport
  map: PlayableMap
}

function boundsAround(lat: number, lng: number, zoom: number, widthPx: number, heightPx: number): Bounds {
  const metersPerPixel = (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom)
  const halfWidthMeters = (widthPx * metersPerPixel) / 2
  const halfHeightMeters = (heightPx * metersPerPixel) / 2
  const latScale = 111_320
  const lngScale = Math.cos((lat * Math.PI) / 180) * latScale
  return {
    north: lat + halfHeightMeters / latScale,
    south: lat - halfHeightMeters / latScale,
    east: lng + halfWidthMeters / lngScale,
    west: lng - halfWidthMeters / lngScale,
  }
}

async function main(): Promise<void> {
  const viewport: Viewport = {
    center: { lat: DEFAULT_SPAWN.lat, lng: DEFAULT_SPAWN.lng },
    zoom: DEFAULT_SPAWN.zoom,
    bounds: boundsAround(DEFAULT_SPAWN.lat, DEFAULT_SPAWN.lng, DEFAULT_SPAWN.zoom, VIEWPORT_WIDTH_PX, VIEWPORT_HEIGHT_PX),
  }

  console.log('Fetching roads for Newspeak House viewport...', viewport.bounds)
  const roadData = await fetchRoadData(viewport.bounds)
  console.log(`Roads: ${roadData.nodes.length} nodes, ${roadData.edges.length} edges`)

  const vacantPayload = JSON.parse(await readFile(vacantPath, 'utf8')) as Parameters<typeof parseVacantHouses>[0]
  const vacantCatalog = parseVacantHouses(vacantPayload)
  const vacantHouses = selectVacantHousesForPlay(vacantCatalog, viewport.bounds, viewport.center)
  console.log(`Vacant houses selected: ${vacantHouses.length}`)

  const map = generatePlayableMap(viewport, roadData, { vacantHouses })
  console.log(
    `PlayableMap: mode=${map.sourceMode}, nodes=${map.nodes.length}, edges=${map.edges.length}, vacant=${map.vacantHouses.length}`,
  )

  const payload: PrecomputedMazeFile = {
    id: 'newspeak-house',
    label: 'Newspeak House, Tower Hamlets',
    generatedAt: new Date().toISOString(),
    viewport,
    map,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${path.relative(root, outputPath)} (${(JSON.stringify(payload).length / 1024).toFixed(1)} KB)`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
