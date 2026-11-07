import type { RoadData, RoadGraphEdge, RoadGraphNode } from '../types'

/** Connect endpoints separated by tiny OSM gaps so junctions stay walkable. */
export const DEFAULT_BRIDGE_GAP_METERS = 1

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function edgeKey(fromId: string, toId: string): string {
  return fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`
}

function cloneRoadData(roadData: RoadData): RoadData {
  return {
    nodes: roadData.nodes.map((node) => ({ ...node, neighbors: [...node.neighbors] })),
    edges: roadData.edges.map((edge) => ({ ...edge })),
  }
}

function rebuildNeighbors(nodes: RoadGraphNode[], edges: RoadGraphEdge[]): void {
  for (const node of nodes) {
    node.neighbors = []
  }
  for (const edge of edges) {
    const from = nodes.find((node) => node.id === edge.from)
    const to = nodes.find((node) => node.id === edge.to)
    if (!from || !to) {
      continue
    }
    if (!from.neighbors.includes(to.id)) {
      from.neighbors.push(to.id)
    }
    if (!to.neighbors.includes(from.id)) {
      to.neighbors.push(from.id)
    }
  }
}

/**
 * Add short synthetic edges between nearby nodes that OSM left slightly disconnected.
 * Fixes sub-metre gaps at T-junctions without letting the player hop large distances.
 */
export function bridgeRoadGraphGaps(
  roadData: RoadData,
  maxGapMeters = DEFAULT_BRIDGE_GAP_METERS,
): RoadData {
  const cloned = cloneRoadData(roadData)
  if (cloned.nodes.length < 2) {
    return cloned
  }

  const existing = new Set(cloned.edges.map((edge) => edgeKey(edge.from, edge.to)))
  const cellMeters = Math.max(maxGapMeters * 2, maxGapMeters + 0.5)
  const midLat = cloned.nodes.reduce((sum, node) => sum + node.lat, 0) / cloned.nodes.length
  const latDegPerMeter = 1 / 111_320
  const lngDegPerMeter = 1 / (Math.cos(midLat * Math.PI / 180) * 111_320)
  const cellLat = cellMeters * latDegPerMeter
  const cellLng = cellMeters * lngDegPerMeter

  const grid = new Map<string, RoadGraphNode[]>()
  for (const node of cloned.nodes) {
    const key = `${Math.floor(node.lng / cellLng)}:${Math.floor(node.lat / cellLat)}`
    const bucket = grid.get(key)
    if (bucket) {
      bucket.push(node)
    } else {
      grid.set(key, [node])
    }
  }

  const newEdges: RoadGraphEdge[] = []
  let bridgeCounter = 0

  for (const node of cloned.nodes) {
    const cx = Math.floor(node.lng / cellLng)
    const cy = Math.floor(node.lat / cellLat)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`)
        if (!bucket) {
          continue
        }
        for (const other of bucket) {
          if (other.id <= node.id) {
            continue
          }
          const key = edgeKey(node.id, other.id)
          if (existing.has(key)) {
            continue
          }
          const gap = distanceMeters(node, other)
          if (gap > maxGapMeters) {
            continue
          }
          bridgeCounter += 1
          existing.add(key)
          newEdges.push({
            id: `bridge:${node.id}:${other.id}`,
            from: node.id,
            to: other.id,
            kind: 'road',
            length: gap,
            synthetic: true,
          })
        }
      }
    }
  }

  if (newEdges.length === 0) {
    return cloned
  }

  cloned.edges.push(...newEdges)
  rebuildNeighbors(cloned.nodes, cloned.edges)
  return cloned
}
