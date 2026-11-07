import type { GeoPoint, RoadData, RoadGraphEdge, RoadGraphNode } from '../types'

const DEFAULT_MIN_EDGE_LENGTH_METERS = 10
const DEFAULT_MAX_BEND_KEEP_DEGREES = 28

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function turnAngleDegrees(prev: GeoPoint, node: GeoPoint, next: GeoPoint): number {
  const abx = node.lng - prev.lng
  const aby = node.lat - prev.lat
  const bcx = next.lng - node.lng
  const bcy = next.lat - node.lat
  const abLen = Math.hypot(abx, aby)
  const bcLen = Math.hypot(bcx, bcy)
  if (abLen < 1e-12 || bcLen < 1e-12) {
    return 0
  }
  const dot = (abx * bcx + aby * bcy) / (abLen * bcLen)
  const clamped = Math.min(1, Math.max(-1, dot))
  return (Math.acos(clamped) * 180) / Math.PI
}

function cloneRoadData(roadData: RoadData): RoadData {
  return {
    nodes: roadData.nodes.map((node) => ({ ...node, neighbors: [...node.neighbors] })),
    edges: roadData.edges.map((edge) => ({ ...edge })),
  }
}

function rebuildNeighbors(nodes: RoadGraphNode[], edges: RoadGraphEdge[]): void {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    node.neighbors = []
  }
  for (const edge of edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
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

function edgeKey(fromId: string, toId: string): string {
  return fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`
}

interface SimplifyOptions {
  minEdgeLengthMeters?: number
  maxBendKeepDegrees?: number
}

/**
 * Collapse gentle bend-only nodes and drop ultra-short edges so the playable
 * graph is closer to Pac-Man corridors than raw OSM polylines.
 */
export function simplifyRoadGraph(roadData: RoadData, options: SimplifyOptions = {}): RoadData {
  const minEdgeLength = options.minEdgeLengthMeters ?? DEFAULT_MIN_EDGE_LENGTH_METERS
  const maxBendKeepDegrees = options.maxBendKeepDegrees ?? DEFAULT_MAX_BEND_KEEP_DEGREES
  const cloned = cloneRoadData(roadData)
  let nodes = cloned.nodes
  let edges = cloned.edges
  let changed = true
  let guard = 0

  while (changed && guard < 10_000) {
    guard += 1
    changed = false
    rebuildNeighbors(nodes, edges)
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))

    const bendNode = nodes.find((node) => {
      if (node.neighbors.length !== 2) {
        return false
      }
      const [leftId, rightId] = node.neighbors
      const left = nodeMap.get(leftId)
      const right = nodeMap.get(rightId)
      if (!left || !right) {
        return false
      }
      return turnAngleDegrees(left, node, right) <= maxBendKeepDegrees
    })

    if (bendNode) {
      const [leftId, rightId] = bendNode.neighbors
      const left = nodeMap.get(leftId)
      const right = nodeMap.get(rightId)
      if (left && right) {
        edges = edges.filter((edge) => edge.from !== bendNode.id && edge.to !== bendNode.id)
        const exists = edges.some((edge) => edgeKey(edge.from, edge.to) === edgeKey(leftId, rightId))
        if (!exists) {
          edges.push({
            id: `simplified:${leftId}:${rightId}`,
            from: leftId,
            to: rightId,
            kind: 'road',
            length: distanceMeters(left, right),
          })
        }
        nodes = nodes.filter((node) => node.id !== bendNode.id)
        changed = true
        continue
      }
    }

    const shortEdge = edges.find((edge) => edge.length < minEdgeLength)
    if (!shortEdge) {
      break
    }

    const keepId = shortEdge.from
    const dropId = shortEdge.to
    const keepNode = nodeMap.get(keepId)
    const dropNode = nodeMap.get(dropId)
    if (!keepNode || !dropNode) {
      edges = edges.filter((edge) => edge.id !== shortEdge.id)
      changed = true
      continue
    }

    // Prefer dropping a degree-2 endpoint; otherwise collapse into keepId.
    const removeId = dropNode.neighbors.length <= 2 ? dropId : (keepNode.neighbors.length <= 2 ? keepId : dropId)
    const retainId = removeId === dropId ? keepId : dropId
    const retainNode = nodeMap.get(retainId)
    if (!retainNode) {
      edges = edges.filter((edge) => edge.id !== shortEdge.id)
      changed = true
      continue
    }

    const rewritten: RoadGraphEdge[] = []
    const seen = new Set<string>()
    for (const edge of edges) {
      if (edge.from === removeId && edge.to === removeId) {
        continue
      }
      const from = edge.from === removeId ? retainId : edge.from
      const to = edge.to === removeId ? retainId : edge.to
      if (from === to) {
        continue
      }
      const key = edgeKey(from, to)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      const fromNode = nodeMap.get(from) ?? retainNode
      const toNode = nodeMap.get(to) ?? retainNode
      rewritten.push({
        id: from === edge.from && to === edge.to ? edge.id : `simplified:${from}:${to}`,
        from,
        to,
        kind: edge.kind,
        length: distanceMeters(fromNode, toNode),
        synthetic: edge.synthetic,
      })
    }
    edges = rewritten
    nodes = nodes.filter((node) => node.id !== removeId)
    changed = true
  }

  rebuildNeighbors(nodes, edges)
  return { nodes, edges }
}
