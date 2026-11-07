import type { GeoPoint, PlayableMap, RoadData, RoadGraphEdge, RoadGraphNode, SourceMode, VacantProperty, Viewport } from '../types'
import { filterReachableVacantHouses } from './filterReachableVacantHouses'
import { bridgeRoadGraphGaps } from './bridgeRoadGraphGaps'
import { simplifyRoadGraph } from './simplifyRoadGraph'

interface GenerateOptions {
  vacantHouses?: VacantProperty[]
}

const MIN_NODE_COUNT = 12
const MIN_EDGE_COUNT = 14
const CONNECTOR_LIMIT = 10
const MIN_SPAWN_DISTANCE_METERS = 120

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function buildComponent(nodeMap: Map<string, RoadGraphNode>, startId: string): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) {
      continue
    }
    const node = nodeMap.get(currentId)
    if (!node) {
      continue
    }
    visited.add(currentId)
    for (const neighbor of node.neighbors) {
      if (!visited.has(neighbor) && nodeMap.has(neighbor)) {
        queue.push(neighbor)
      }
    }
  }

  return visited
}

function largestComponent(roadData: RoadData): RoadData {
  const nodeMap = new Map(roadData.nodes.map((node) => [node.id, { ...node, neighbors: [...node.neighbors] }]))
  let best = new Set<string>()

  for (const node of nodeMap.values()) {
    if (best.has(node.id)) {
      continue
    }
    const component = buildComponent(nodeMap, node.id)
    if (component.size > best.size) {
      best = component
    }
  }

  const nodes = [...nodeMap.values()].filter((node) => best.has(node.id))
  const allowed = new Set(nodes.map((node) => node.id))
  const edges = roadData.edges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to))
  for (const node of nodes) {
    node.neighbors = node.neighbors.filter((neighbor) => allowed.has(neighbor))
  }
  return { nodes, edges }
}

function cloneRoadData(roadData: RoadData): RoadData {
  return {
    nodes: roadData.nodes.map((node) => ({ ...node, neighbors: [...node.neighbors] })),
    edges: roadData.edges.map((edge) => ({ ...edge })),
  }
}

function ensureNeighbor(nodeMap: Map<string, RoadGraphNode>, fromId: string, toId: string): void {
  const from = nodeMap.get(fromId)
  const to = nodeMap.get(toId)
  if (!from || !to) {
    return
  }
  if (!from.neighbors.includes(toId)) {
    from.neighbors.push(toId)
  }
  if (!to.neighbors.includes(fromId)) {
    to.neighbors.push(fromId)
  }
}

function connectDeadEnds(roadData: RoadData): { roadData: RoadData; added: number } {
  const cloned = cloneRoadData(roadData)
  const nodeMap = new Map(cloned.nodes.map((node) => [node.id, node]))
  const deadEnds = cloned.nodes.filter((node) => node.neighbors.length <= 1)
  let added = 0

  for (const node of deadEnds) {
    if (added >= CONNECTOR_LIMIT) {
      break
    }

    let bestCandidate: RoadGraphNode | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of cloned.nodes) {
      if (candidate.id === node.id || node.neighbors.includes(candidate.id) || candidate.neighbors.includes(node.id)) {
        continue
      }
      const gap = distanceMeters(node, candidate)
      if (gap < 35 || gap > 180 || gap >= bestDistance) {
        continue
      }
      bestDistance = gap
      bestCandidate = candidate
    }

    if (!bestCandidate) {
      continue
    }

    const edgeId = `synthetic:${node.id}:${bestCandidate.id}`
    if (cloned.edges.some((edge) => edge.id === edgeId || (edge.from === bestCandidate.id && edge.to === node.id))) {
      continue
    }

    cloned.edges.push({
      id: edgeId,
      from: node.id,
      to: bestCandidate.id,
      kind: 'connector',
      length: bestDistance,
      synthetic: true,
    })
    ensureNeighbor(nodeMap, node.id, bestCandidate.id)
    added += 1
  }

  return { roadData: cloned, added }
}

function fallbackGrid(viewport: Viewport): RoadData {
  const cols = 5
  const rows = 6
  const nodes: RoadGraphNode[] = []
  const edges: RoadGraphEdge[] = []
  const nodeMap = new Map<string, RoadGraphNode>()

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lng = viewport.bounds.west + ((col + 0.5) / cols) * (viewport.bounds.east - viewport.bounds.west)
      const lat = viewport.bounds.north - ((row + 0.5) / rows) * (viewport.bounds.north - viewport.bounds.south)
      const node: RoadGraphNode = {
        id: `grid-${col}-${row}`,
        lng,
        lat,
        neighbors: [],
      }
      nodes.push(node)
      nodeMap.set(node.id, node)
    }
  }

  const connect = (fromCol: number, fromRow: number, toCol: number, toRow: number): void => {
    const fromId = `grid-${fromCol}-${fromRow}`
    const toId = `grid-${toCol}-${toRow}`
    const from = nodeMap.get(fromId)
    const to = nodeMap.get(toId)
    if (!from || !to) {
      return
    }
    ensureNeighbor(nodeMap, fromId, toId)
    edges.push({
      id: `grid-edge:${fromId}:${toId}`,
      from: fromId,
      to: toId,
      kind: 'generated',
      length: distanceMeters(from, to),
      synthetic: true,
    })
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (col < cols - 1) {
        connect(col, row, col + 1, row)
      }
      if (row < rows - 1) {
        connect(col, row, col, row + 1)
      }
    }
  }

  return { nodes, edges }
}

function nearestNode(nodes: RoadGraphNode[], target: GeoPoint): RoadGraphNode {
  let best = nodes[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const node of nodes) {
    const gap = distanceMeters(node, target)
    if (gap < bestDistance) {
      bestDistance = gap
      best = node
    }
  }
  return best
}

function chooseGhostHomes(nodes: RoadGraphNode[], center: GeoPoint): string[] {
  const byDistance = [...nodes]
    .filter((node) => node.neighbors.length > 0)
    .sort((a, b) => distanceMeters(a, center) - distanceMeters(b, center))
  return byDistance.slice(0, 4).map((node) => node.id)
}

function chooseSpawnNode(nodes: RoadGraphNode[], center: GeoPoint, ghostHomeIds: string[]): RoadGraphNode {
  const ghostHomes = nodes.filter((node) => ghostHomeIds.includes(node.id))
  const candidates = [...nodes]
    .filter((node) => !ghostHomeIds.includes(node.id) && node.neighbors.length > 0)
    .map((node) => {
      const minGhostDistance = ghostHomes.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...ghostHomes.map((ghost) => distanceMeters(node, ghost)))
      const centerDistance = distanceMeters(node, center)
      return {
        node,
        minGhostDistance,
        centerDistance,
      }
    })
    .sort((a, b) => {
      const aSafe = a.minGhostDistance >= MIN_SPAWN_DISTANCE_METERS
      const bSafe = b.minGhostDistance >= MIN_SPAWN_DISTANCE_METERS
      if (aSafe !== bSafe) {
        return aSafe ? -1 : 1
      }
      if (aSafe && bSafe) {
        return a.centerDistance - b.centerDistance
      }
      if (b.minGhostDistance !== a.minGhostDistance) {
        return b.minGhostDistance - a.minGhostDistance
      }
      return a.centerDistance - b.centerDistance
    })

  return candidates[0]?.node ?? nearestNode(nodes, center)
}

function prepareRoadNetwork(viewport: Viewport, roadData: RoadData): { roadData: RoadData; sourceMode: SourceMode } {
  const simplified = simplifyRoadGraph(roadData)
  const component = largestComponent(simplified)
  if (component.nodes.length < MIN_NODE_COUNT || component.edges.length < MIN_EDGE_COUNT) {
    if (component.nodes.length >= 4) {
      const hybrid = connectDeadEnds(component)
      if (hybrid.roadData.nodes.length >= 4 && hybrid.roadData.edges.length >= 6) {
        return { roadData: bridgeRoadGraphGaps(simplifyRoadGraph(hybrid.roadData)), sourceMode: 'hybrid' }
      }
    }
    return { roadData: fallbackGrid(viewport), sourceMode: 'generated' }
  }

  const hybrid = connectDeadEnds(component)
  return {
    roadData: bridgeRoadGraphGaps(simplifyRoadGraph(hybrid.roadData)),
    sourceMode: hybrid.added > 0 ? 'hybrid' : 'road',
  }
}

export function generatePlayableMap(viewport: Viewport, roadData: RoadData, options: GenerateOptions = {}): PlayableMap {
  const prepared = prepareRoadNetwork(viewport, roadData)
  const nodes = prepared.roadData.nodes
  const edges = prepared.roadData.edges
  const center = viewport.center
  const ghostHomeNodeIds = chooseGhostHomes(nodes, center)
  const spawnNode = chooseSpawnNode(nodes, center, ghostHomeNodeIds)
  const vacantCandidates = (options.vacantHouses ?? []).map((house) => ({ ...house, status: 'vacant' as const }))
  const vacantHouses = filterReachableVacantHouses(vacantCandidates, nodes, edges)
  return {
    bounds: viewport.bounds,
    center,
    nodes,
    edges,
    // Street pellets retired — vacant houses are the collectible objective.
    pellets: [],
    powerPellets: [],
    vacantHouses,
    spawnNodeId: spawnNode.id,
    ghostHomeNodeIds,
    sourceMode: prepared.sourceMode,
  }
}
