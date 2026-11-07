import type { Bounds, GeoPoint, PlayableMap, SourceMode, VacantProperty, Viewport } from '../types'

const DEFAULT_MAZE_URL = `${import.meta.env.BASE_URL}mazes/newspeak-house.json`

export interface PrecomputedMazeFile {
  id: string
  label: string
  generatedAt?: string
  viewport: Viewport
  map: PlayableMap
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isGeoPoint(value: unknown): value is GeoPoint {
  return isRecord(value)
    && typeof value.lng === 'number'
    && typeof value.lat === 'number'
}

function isBounds(value: unknown): value is Bounds {
  return isRecord(value)
    && typeof value.north === 'number'
    && typeof value.south === 'number'
    && typeof value.east === 'number'
    && typeof value.west === 'number'
}

function isViewport(value: unknown): value is Viewport {
  return isRecord(value)
    && isGeoPoint(value.center)
    && typeof value.zoom === 'number'
    && isBounds(value.bounds)
}

function isVacantHouse(value: unknown): value is VacantProperty {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.lat === 'number'
    && typeof value.lng === 'number'
    && (value.status === 'vacant' || value.status === 'reported')
}

function isPlayableMap(value: unknown): value is PlayableMap {
  if (!isRecord(value) || !isBounds(value.bounds) || !isGeoPoint(value.center)) {
    return false
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return false
  }
  if (!Array.isArray(value.pellets) || !Array.isArray(value.powerPellets)) {
    return false
  }
  if (!Array.isArray(value.vacantHouses) || !value.vacantHouses.every(isVacantHouse)) {
    return false
  }
  if (typeof value.spawnNodeId !== 'string' || !Array.isArray(value.ghostHomeNodeIds)) {
    return false
  }
  const mode = value.sourceMode
  return mode === 'road' || mode === 'hybrid' || mode === 'generated'
}

export function parsePrecomputedMaze(payload: unknown): PrecomputedMazeFile | null {
  if (!isRecord(payload) || typeof payload.id !== 'string' || typeof payload.label !== 'string') {
    return null
  }
  if (!isViewport(payload.viewport) || !isPlayableMap(payload.map)) {
    return null
  }

  return {
    id: payload.id,
    label: payload.label,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : undefined,
    viewport: payload.viewport,
    map: {
      ...payload.map,
      vacantHouses: payload.map.vacantHouses.map((house) => ({ ...house, status: 'vacant' as const })),
      sourceMode: payload.map.sourceMode as SourceMode,
    },
  }
}

export async function loadPrecomputedMaze(
  url = DEFAULT_MAZE_URL,
): Promise<PrecomputedMazeFile | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return null
    }
    const payload = await response.json() as unknown
    return parsePrecomputedMaze(payload)
  } catch {
    return null
  }
}
