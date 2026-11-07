import type { GeoPoint, RoadGraphNode } from '../types'

/** Ghosts start within this radius of the player spawn (1 statute mile). */
export const GHOST_SPAWN_RADIUS_METERS = 1609.34

const MIN_GHOST_SPAWN_DISTANCE_METERS = 45

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

/**
 * Pick distinct road nodes for ghost homes near the player, spread between min and max radius.
 */
export function chooseGhostHomesNear(
  nodes: RoadGraphNode[],
  anchor: GeoPoint,
  count = 4,
  maxRadiusMeters = GHOST_SPAWN_RADIUS_METERS,
): string[] {
  const traversable = nodes.filter((node) => node.neighbors.length > 0)
  const withinRadius = traversable
    .map((node) => ({ node, distance: distanceMeters(node, anchor) }))
    .filter((entry) => entry.distance <= maxRadiusMeters && entry.distance >= MIN_GHOST_SPAWN_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance)

  const pool = withinRadius.length >= count
    ? withinRadius
    : traversable
      .map((node) => ({ node, distance: distanceMeters(node, anchor) }))
      .filter((entry) => entry.distance >= MIN_GHOST_SPAWN_DISTANCE_METERS)
      .sort((a, b) => a.distance - b.distance)

  if (pool.length === 0) {
    return traversable.slice(0, count).map((node) => node.id)
  }

  const picks: string[] = []
  const spreadSteps = count
  for (let index = 0; index < spreadSteps; index += 1) {
    const slot = Math.min(
      pool.length - 1,
      Math.floor(((index + 1) / (spreadSteps + 1)) * pool.length),
    )
    const candidate = pool[slot]?.node.id
    if (!candidate || picks.includes(candidate)) {
      continue
    }
    picks.push(candidate)
  }

  for (const entry of pool) {
    if (picks.length >= count) {
      break
    }
    if (!picks.includes(entry.node.id)) {
      picks.push(entry.node.id)
    }
  }

  return picks.slice(0, count)
}
