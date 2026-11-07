import type { GeoPoint, RoadGraphNode } from '../types'

/** Furthest ghost home from the player at round start. */
export const GHOST_SPAWN_RADIUS_METERS = 320

const MIN_GHOST_SPAWN_DISTANCE_METERS = 55

/** Ring distances so ghosts stay nearby but not stacked on one junction. */
const GHOST_SPAWN_TARGET_DISTANCES_METERS = [70, 130, 200, 280]

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function pickClosestToDistance(
  entries: Array<{ node: RoadGraphNode; distance: number }>,
  targetMeters: number,
  used: Set<string>,
): string | null {
  let bestId: string | null = null
  let bestGap = Number.POSITIVE_INFINITY
  for (const entry of entries) {
    if (used.has(entry.node.id)) {
      continue
    }
    if (entry.distance > GHOST_SPAWN_RADIUS_METERS) {
      continue
    }
    const gap = Math.abs(entry.distance - targetMeters)
    if (gap < bestGap) {
      bestGap = gap
      bestId = entry.node.id
    }
  }
  return bestId
}

/**
 * Pick distinct road nodes for ghost homes near the player on concentric rings.
 */
export function chooseGhostHomesNear(
  nodes: RoadGraphNode[],
  anchor: GeoPoint,
  count = 4,
  maxRadiusMeters = GHOST_SPAWN_RADIUS_METERS,
): string[] {
  const traversable = nodes.filter((node) => node.neighbors.length > 0)
  const ranked = traversable
    .map((node) => ({ node, distance: distanceMeters(node, anchor) }))
    .filter((entry) => entry.distance >= MIN_GHOST_SPAWN_DISTANCE_METERS && entry.distance <= maxRadiusMeters)
    .sort((a, b) => a.distance - b.distance)

  const fallback = traversable
    .map((node) => ({ node, distance: distanceMeters(node, anchor) }))
    .filter((entry) => entry.distance >= MIN_GHOST_SPAWN_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance)

  const pool = ranked.length >= count ? ranked : fallback

  if (pool.length === 0) {
    return traversable.slice(0, count).map((node) => node.id)
  }

  const used = new Set<string>()
  const picks: string[] = []
  for (const target of GHOST_SPAWN_TARGET_DISTANCES_METERS.slice(0, count)) {
    const id = pickClosestToDistance(pool, target, used)
      ?? pickClosestToDistance(
        fallback.filter((entry) => entry.distance <= maxRadiusMeters),
        target,
        used,
      )
    if (id) {
      used.add(id)
      picks.push(id)
    }
  }

  for (const entry of pool) {
    if (picks.length >= count) {
      break
    }
    if (!used.has(entry.node.id)) {
      used.add(entry.node.id)
      picks.push(entry.node.id)
    }
  }

  return picks.slice(0, count)
}
