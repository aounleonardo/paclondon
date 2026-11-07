import { filterReachableVacantHouses } from '../generator/filterReachableVacantHouses'
import type { PlayableMap, VacantProperty } from '../types'
import { parsePrecomputedMaze, type PrecomputedMazeFile } from './precomputedMaze'
import { parseVacantHouses } from './vacantHouses'

const DEFAULT_BOROUGH_ID = import.meta.env.VITE_DEFAULT_BOROUGH_ID || 'islington'

function mazeUrls(boroughId: string): string[] {
  const configured = import.meta.env.VITE_MAZE_URL
  const bundled = `${import.meta.env.BASE_URL}mazes/${boroughId}.json`
  const api = `/api/borough/${boroughId}/maze`
  const fallback = `${import.meta.env.BASE_URL}mazes/newspeak-house.json`
  // In dev, prefer bundled maze if /api is not wired (avoids SPA index.html masquerading as JSON).
  if (import.meta.env.DEV) {
    return [configured, bundled, api, fallback].filter((value): value is string => Boolean(value))
  }
  return [configured, api, bundled, fallback].filter((value): value is string => Boolean(value))
}

function vacantUrls(boroughId: string): string[] {
  const configured = import.meta.env.VITE_VACANT_HOUSES_URL
  return [
    configured,
    `/api/borough/${boroughId}/vacant-houses`,
    `${import.meta.env.BASE_URL}${boroughId}-vacant-houses.json`,
    `${import.meta.env.BASE_URL}vacant-houses.json`,
  ].filter((value): value is string => Boolean(value))
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return null
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json') && !contentType.includes('text/plain')) {
      return null
    }
    return await response.json() as unknown
  } catch {
    return null
  }
}

export async function loadBoroughMaze(boroughId = DEFAULT_BOROUGH_ID): Promise<PrecomputedMazeFile | null> {
  for (const url of mazeUrls(boroughId)) {
    const payload = await fetchJson(url)
    const parsed = parsePrecomputedMaze(payload)
    if (parsed) {
      return parsed
    }
  }
  return null
}

export async function loadBoroughVacantHouses(boroughId = DEFAULT_BOROUGH_ID): Promise<VacantProperty[]> {
  for (const url of vacantUrls(boroughId)) {
    const payload = await fetchJson(url)
    if (!payload || typeof payload !== 'object') {
      continue
    }
    const houses = parseVacantHouses(payload as { houses?: Array<{ id?: string; label?: string; lat?: number; lng?: number }> })
    // Skip empty blob/API payloads so we can fall through to bundled borough JSON.
    if (houses.length > 0) {
      return houses
    }
  }
  return []
}

/** Attach reachable vacant houses onto a maze that was baked without them. */
export function attachVacantHouses(map: PlayableMap, houses: VacantProperty[]): PlayableMap {
  const vacantHouses = filterReachableVacantHouses(
    houses.map((house) => ({ ...house, status: 'vacant' as const })),
    map.nodes,
    map.edges,
  )
  return {
    ...map,
    vacantHouses,
  }
}

export function defaultBoroughId(): string {
  return DEFAULT_BOROUGH_ID
}
