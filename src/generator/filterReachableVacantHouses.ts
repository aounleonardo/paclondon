import type { GeoPoint, RoadGraphEdge, RoadGraphNode, VacantProperty } from '../types'

/** Must match report radius — player stays on roads, so houses farther than this are unreachable. */
export const MAX_HOUSE_DISTANCE_FROM_ROAD_METERS = 15

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function projectPointOntoSegment(point: GeoPoint, from: GeoPoint, to: GeoPoint): GeoPoint {
  const latScale = 111_320
  const midLat = (from.lat + to.lat) / 2
  const lngScale = Math.cos(midLat * Math.PI / 180) * latScale
  const ax = from.lng * lngScale
  const ay = from.lat * latScale
  const bx = to.lng * lngScale
  const by = to.lat * latScale
  const px = point.lng * lngScale
  const py = point.lat * latScale
  const abx = bx - ax
  const aby = by - ay
  const lengthSq = abx * abx + aby * aby
  if (lengthSq <= 1e-9) {
    return { lng: from.lng, lat: from.lat }
  }
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / lengthSq))
  return {
    lng: from.lng + (to.lng - from.lng) * t,
    lat: from.lat + (to.lat - from.lat) * t,
  }
}

export function distanceToRoadNetworkMeters(
  point: GeoPoint,
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
): number {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  let best = Number.POSITIVE_INFINITY

  for (const node of nodes) {
    best = Math.min(best, distanceMeters(point, node))
  }

  for (const edge of edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to) {
      continue
    }
    const projected = projectPointOntoSegment(point, from, to)
    best = Math.min(best, distanceMeters(point, projected))
  }

  return best
}

/**
 * Keep only vacant houses the player can reach from the playable maze
 * (within reporting distance of a road edge/node).
 */
export function filterReachableVacantHouses(
  houses: VacantProperty[],
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
  maxDistanceMeters = MAX_HOUSE_DISTANCE_FROM_ROAD_METERS,
): VacantProperty[] {
  if (nodes.length === 0 || edges.length === 0) {
    return []
  }

  return houses.filter((house) =>
    distanceToRoadNetworkMeters(house, nodes, edges) <= maxDistanceMeters)
}
