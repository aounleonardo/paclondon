import type { Bounds, GeoPoint, House, Pellet, PlayableMap, RoadData, RoadGraphEdge, RoadGraphNode, SourceMode, Viewport } from '../types'

interface GenerateOptions {
  pelletDensity?: number
}

interface RawHouseSeed {
  id: string
  lat: number
  lng: number
  isVacant: boolean
  address?: string
}

/** Hard-coded test houses around central London. Filtered by map bounds at generate time. */
const TEST_HOUSES: RawHouseSeed[] = [
  { id: 'H1', lat: 51.5074, lng: -0.1278, isVacant: true, address: '123 High Street' },
  { id: 'H2', lat: 51.5081, lng: -0.1282, isVacant: false, address: '45 Occupied Road' },
  { id: 'H3', lat: 51.5069, lng: -0.1290, isVacant: true, address: '7 Vacant Lane' },
  { id: 'H4', lat: 51.5078, lng: -0.1265, isVacant: true, address: '18 Empty Court' },
  { id: 'H5', lat: 51.5065, lng: -0.1272, isVacant: false, address: '9 Lived-In Mews' },
  { id: 'H6', lat: 51.5085, lng: -0.1270, isVacant: true, address: '2 Quiet Place' },
  { id: 'H7', lat: 51.5070, lng: -0.1260, isVacant: false, address: '55 Busy Avenue' },
  { id: 'H8', lat: 51.5088, lng: -0.1295, isVacant: true, address: '11 Dark Alley' },
  { id: 'H9', lat: 51.5062, lng: -0.1288, isVacant: true, address: '30 Forsaken Row' },
  { id: 'H10', lat: 51.5076, lng: -0.1300, isVacant: false, address: '8 Full House Way' },
  { id: 'H11', lat: 51.5090, lng: -0.1268, isVacant: true, address: '4 Silent Terrace' },
  { id: 'H12', lat: 51.5060, lng: -0.1262, isVacant: false, address: '21 Neighbour Street' },
]

const MIN_NODE_COUNT = 12
const MIN_EDGE_COUNT = 14
const CONNECTOR_LIMIT = 10
const PELLET_STEP_METERS = 6
const MIN_SPAWN_DISTANCE_METERS = 120
const MIN_POWER_DISTANCE_FROM_SPAWN_METERS = 90
const MIN_POWER_PELLET_SPACING_METERS = 80
const TARGET_POWER_PELLETS = 6
const BLOCKED_EDGE_PROGRESS = 0.35
const INTERSECTION_CLEARANCE_METERS = 18
const TURN_CLEARANCE_METERS = 5
const TERMINAL_CLEARANCE_METERS = 2
const QUADRANTS: Array<'nw' | 'ne' | 'sw' | 'se'> = ['nw', 'ne', 'sw', 'se']

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

function interpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  }
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

function chooseQuadrant(point: GeoPoint, center: GeoPoint): 'nw' | 'ne' | 'sw' | 'se' {
  if (point.lat >= center.lat && point.lng <= center.lng) {
    return 'nw'
  }
  if (point.lat >= center.lat && point.lng > center.lng) {
    return 'ne'
  }
  if (point.lat < center.lat && point.lng <= center.lng) {
    return 'sw'
  }
  return 'se'
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

function normalizeVector(from: GeoPoint, to: GeoPoint): { x: number; y: number } {
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function pelletClearanceForEdgeEnd(
  node: RoadGraphNode,
  oppositeNode: RoadGraphNode,
  nodeMap: Map<string, RoadGraphNode>,
): number {
  const degree = node.neighbors.length
  if (degree >= 3) {
    return INTERSECTION_CLEARANCE_METERS
  }
  if (degree <= 1) {
    return TERMINAL_CLEARANCE_METERS
  }

  const otherNeighborId = node.neighbors.find((neighborId) => neighborId !== oppositeNode.id)
  if (!otherNeighborId) {
    return TERMINAL_CLEARANCE_METERS
  }
  const otherNeighbor = nodeMap.get(otherNeighborId)
  if (!otherNeighbor) {
    return TURN_CLEARANCE_METERS
  }

  const toOpposite = normalizeVector(node, oppositeNode)
  const toOther = normalizeVector(node, otherNeighbor)
  const dot = toOpposite.x * toOther.x + toOpposite.y * toOther.y

  if (dot <= -0.92) {
    return 0
  }
  return TURN_CLEARANCE_METERS
}

function buildPellets(
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
  spawnId: string,
  homeIds: string[],
  center: GeoPoint,
  pelletDensity = 1,
): { pellets: Pellet[]; powerPellets: Pellet[] } {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const blockedNodes = new Set([spawnId, ...homeIds])
  const spawnNode = nodeMap.get(spawnId)
  const pellets: Pellet[] = []
  const pelletStep = PELLET_STEP_METERS / Math.max(0.5, pelletDensity)

  for (const edge of edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to) {
      continue
    }
    const fromClearance = pelletClearanceForEdgeEnd(from, to, nodeMap)
    const toClearance = pelletClearanceForEdgeEnd(to, from, nodeMap)
    if (edge.length <= fromClearance + toClearance) {
      continue
    }

    const minProgress = Math.max(
      blockedNodes.has(from.id) ? BLOCKED_EDGE_PROGRESS : 0,
      fromClearance / edge.length,
    )
    const maxProgress = Math.min(
      blockedNodes.has(to.id) ? 1 - BLOCKED_EDGE_PROGRESS : 1,
      1 - toClearance / edge.length,
    )
    if (maxProgress <= minProgress) {
      continue
    }

    const playableLength = edge.length * (maxProgress - minProgress)
    const sampleCount = Math.max(1, Math.floor(playableLength / pelletStep))
    for (let step = 1; step <= sampleCount; step += 1) {
      const progress = minProgress + ((maxProgress - minProgress) * step) / (sampleCount + 1)
      const point = interpolate(from, to, progress)
      pellets.push({
        id: `${edge.id}:${step}`,
        edgeId: edge.id,
        progress,
        lng: point.lng,
        lat: point.lat,
        power: false,
      })
    }
  }

  const powerPellets: Pellet[] = []
  const usedPellets = new Set<string>()
  for (const quadrant of QUADRANTS) {
    const candidate = [...pellets]
      .filter((pellet) =>
        !usedPellets.has(pellet.id)
        && chooseQuadrant(pellet, center) === quadrant
        && (!spawnNode || distanceMeters(pellet, spawnNode) >= MIN_POWER_DISTANCE_FROM_SPAWN_METERS))
      .sort((a, b) => distanceMeters(b, center) - distanceMeters(a, center))[0]

    if (candidate) {
      usedPellets.add(candidate.id)
      powerPellets.push({
        ...candidate,
        id: `power:${candidate.id}`,
        power: true,
      })
    }
  }

  const extraCandidates = [...pellets]
    .filter((pellet) =>
      !usedPellets.has(pellet.id)
      && (!spawnNode || distanceMeters(pellet, spawnNode) >= MIN_POWER_DISTANCE_FROM_SPAWN_METERS))
    .sort((a, b) => distanceMeters(b, center) - distanceMeters(a, center))

  for (const candidate of extraCandidates) {
    if (powerPellets.length >= TARGET_POWER_PELLETS) {
      break
    }
    const farEnough = powerPellets.every((existing) => distanceMeters(existing, candidate) >= MIN_POWER_PELLET_SPACING_METERS)
    if (!farEnough) {
      continue
    }
    usedPellets.add(candidate.id)
    powerPellets.push({
      ...candidate,
      id: `power:${candidate.id}`,
      power: true,
    })
  }

  const remainingPellets = pellets.filter((pellet) => !usedPellets.has(pellet.id))

  return {
    pellets: remainingPellets,
    powerPellets,
  }
}

function pointInBounds(point: GeoPoint, bounds: Bounds): boolean {
  return point.lat <= bounds.north
    && point.lat >= bounds.south
    && point.lng <= bounds.east
    && point.lng >= bounds.west
}

function closestPointOnEdge(
  point: GeoPoint,
  from: RoadGraphNode,
  to: RoadGraphNode,
): { point: GeoPoint; progress: number; distance: number } {
  const latScale = 111_320
  const lngScale = Math.cos(((from.lat + to.lat) / 2) * Math.PI / 180) * latScale
  const ax = from.lng * lngScale
  const ay = from.lat * latScale
  const bx = to.lng * lngScale
  const by = to.lat * latScale
  const px = point.lng * lngScale
  const py = point.lat * latScale
  const abx = bx - ax
  const aby = by - ay
  const lengthSq = abx * abx + aby * aby
  const progress = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq))
  const snapped = interpolate(from, to, progress)
  return {
    point: snapped,
    progress,
    distance: distanceMeters(point, snapped),
  }
}

function snapToNearestEdge(
  point: GeoPoint,
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
): { point: GeoPoint; edgeId: string; progress: number } | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  let best: { point: GeoPoint; edgeId: string; progress: number; distance: number } | null = null

  for (const edge of edges) {
    const from = nodeMap.get(edge.from)
    const to = nodeMap.get(edge.to)
    if (!from || !to || edge.length < 8) {
      continue
    }
    const candidate = closestPointOnEdge(point, from, to)
    if (!best || candidate.distance < best.distance) {
      best = {
        point: candidate.point,
        edgeId: edge.id,
        progress: candidate.progress,
        distance: candidate.distance,
      }
    }
  }

  if (!best) {
    return null
  }
  return {
    point: best.point,
    edgeId: best.edgeId,
    progress: best.progress,
  }
}

function createHouseFromSeed(
  seed: RawHouseSeed,
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
): House | null {
  const snapped = snapToNearestEdge({ lat: seed.lat, lng: seed.lng }, nodes, edges)
  if (!snapped) {
    return null
  }
  return {
    id: seed.id,
    lat: snapped.point.lat,
    lng: snapped.point.lng,
    isVacant: seed.isVacant,
    checked: false,
    claimed: false,
    state: 'unknown',
    edgeId: snapped.edgeId,
    progress: 0,
    address: seed.address,
  }
}

function proceduralHouseSeeds(center: GeoPoint, count: number): RawHouseSeed[] {
  const seeds: RawHouseSeed[] = []
  // Rough ~40–90m offsets around the viewport center so any city works.
  const offsets = [
    { dLat: 0.00045, dLng: -0.00055, vacant: true },
    { dLat: 0.00070, dLng: 0.00035, vacant: false },
    { dLat: -0.00055, dLng: -0.00040, vacant: true },
    { dLat: -0.00025, dLng: 0.00075, vacant: true },
    { dLat: 0.00020, dLng: 0.00090, vacant: false },
    { dLat: -0.00080, dLng: 0.00020, vacant: true },
    { dLat: 0.00090, dLng: -0.00020, vacant: false },
    { dLat: -0.00010, dLng: -0.00095, vacant: true },
    { dLat: 0.00055, dLng: 0.00060, vacant: true },
    { dLat: -0.00065, dLng: -0.00070, vacant: false },
    { dLat: 0.00015, dLng: -0.00030, vacant: true },
    { dLat: -0.00040, dLng: 0.00045, vacant: false },
  ]

  for (let index = 0; index < Math.min(count, offsets.length); index += 1) {
    const offset = offsets[index]
    seeds.push({
      id: `P${index + 1}`,
      lat: center.lat + offset.dLat,
      lng: center.lng + offset.dLng,
      isVacant: offset.vacant,
      address: `Suspicious house #${index + 1}`,
    })
  }
  return seeds
}

function placeHousesOnRoads(
  bounds: Bounds,
  center: GeoPoint,
  nodes: RoadGraphNode[],
  edges: RoadGraphEdge[],
): House[] {
  const inBounds = TEST_HOUSES.filter((house) => pointInBounds(house, bounds))
  const seeds = inBounds.length >= 4
    ? inBounds
    : proceduralHouseSeeds(center, 12)

  const houses: House[] = []
  const usedEdgeSlots = new Set<string>()

  for (const seed of seeds) {
    const house = createHouseFromSeed(seed, nodes, edges)
    if (!house || !house.edgeId) {
      continue
    }
    const slotKey = `${house.edgeId}:${house.progress.toFixed(2)}`
    if (usedEdgeSlots.has(slotKey)) {
      continue
    }
    // Keep houses spaced so they are not stacked on the same spot.
    const tooClose = houses.some((existing) => distanceMeters(existing, house) < 28)
    if (tooClose) {
      continue
    }
    usedEdgeSlots.add(slotKey)
    houses.push(house)
  }

  // Fallback: drop houses mid-edge if snapping filtered everything out.
  if (houses.length < 4) {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const playableEdges = edges.filter((edge) => edge.length >= 25)
    let index = 0
    for (const edge of playableEdges) {
      if (houses.length >= 10) {
        break
      }
      const from = nodeMap.get(edge.from)
      const to = nodeMap.get(edge.to)
      if (!from || !to) {
        continue
      }
      const progress = 0.35 + ((index % 3) * 0.15)
      const point = interpolate(from, to, progress)
      if (houses.some((existing) => distanceMeters(existing, point) < 28)) {
        index += 1
        continue
      }
      houses.push({
        id: `E${index + 1}`,
        lat: point.lat,
        lng: point.lng,
        isVacant: index % 3 !== 1,
        checked: false,
        claimed: false,
        state: 'unknown',
        edgeId: edge.id,
        progress: 0,
        address: `Road house #${index + 1}`,
      })
      index += 1
    }
  }

  return houses
}

function prepareRoadNetwork(viewport: Viewport, roadData: RoadData): { roadData: RoadData; sourceMode: SourceMode } {
  const component = largestComponent(roadData)
  if (component.nodes.length < MIN_NODE_COUNT || component.edges.length < MIN_EDGE_COUNT) {
    if (component.nodes.length >= 4) {
      const hybrid = connectDeadEnds(component)
      if (hybrid.roadData.nodes.length >= 4 && hybrid.roadData.edges.length >= 6) {
        return { roadData: hybrid.roadData, sourceMode: 'hybrid' }
      }
    }
    return { roadData: fallbackGrid(viewport), sourceMode: 'generated' }
  }

  const hybrid = connectDeadEnds(component)
  return {
    roadData: hybrid.roadData,
    sourceMode: hybrid.added > 0 ? 'hybrid' : 'road',
  }
}

export function generatePlayableMap(viewport: Viewport, roadData: RoadData, options: GenerateOptions = {}): PlayableMap {
  const prepared = prepareRoadNetwork(viewport, roadData)
  const nodes = prepared.roadData.nodes
  const center = viewport.center
  const ghostHomeNodeIds = chooseGhostHomes(nodes, center)
  const spawnNode = chooseSpawnNode(nodes, center, ghostHomeNodeIds)
  // Houses are the primary objective; keep a few power pellets for classic power-ups.
  const { powerPellets } = buildPellets(
    nodes,
    prepared.roadData.edges,
    spawnNode.id,
    ghostHomeNodeIds,
    center,
    options.pelletDensity ?? 1,
  )
  const houses = placeHousesOnRoads(viewport.bounds, center, nodes, prepared.roadData.edges)

  return {
    bounds: viewport.bounds,
    center,
    nodes,
    edges: prepared.roadData.edges,
    pellets: [],
    powerPellets,
    houses,
    spawnNodeId: spawnNode.id,
    ghostHomeNodeIds,
    sourceMode: prepared.sourceMode,
  }
}
