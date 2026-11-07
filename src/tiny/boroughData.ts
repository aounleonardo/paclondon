export interface BoroughData {
  name: string
  start: string
  S: number
  postcodes: Record<string, [number, number]>
  roads: number[][]
  homes: [number, number][]
}

export interface RoadSegment {
  width: number
  pts: [number, number][]
  x0: number
  y0: number
  x1: number
  y1: number
}

export async function loadBoroughData(url: string): Promise<BoroughData> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load borough data: ${url}`)
  }
  return await response.json() as BoroughData
}

export function expandRoads(roads: number[][]): RoadSegment[] {
  return roads.map((road) => {
    const pts: [number, number][] = [[road[1]!, road[2]!]]
    for (let index = 3; index < road.length; index += 2) {
      const previous = pts[pts.length - 1]!
      pts.push([previous[0] + road[index]!, previous[1] + road[index + 1]!])
    }
    let x0 = Number.POSITIVE_INFINITY
    let y0 = Number.POSITIVE_INFINITY
    let x1 = Number.NEGATIVE_INFINITY
    let y1 = Number.NEGATIVE_INFINITY
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    return { width: road[0]!, pts, x0, y0, x1, y1 }
  })
}

/**
 * Drop thin alley/footpath strokes (width 5–7 dominate the dump) so play
 * matches the earlier “main streets only” maze feel.
 */
export function simplifyPlayableRoads(
  roads: RoadSegment[],
  minWidth = 10,
  joinDistance = 48,
): RoadSegment[] {
  const candidates = roads.filter((road) => road.width >= minWidth)
  if (candidates.length === 0) {
    return roads
  }

  const endpoints: Array<{ roadIndex: number; x: number; y: number }> = []
  candidates.forEach((road, roadIndex) => {
    const start = road.pts[0]
    const end = road.pts[road.pts.length - 1]
    if (start) {
      endpoints.push({ roadIndex, x: start[0], y: start[1] })
    }
    if (end) {
      endpoints.push({ roadIndex, x: end[0], y: end[1] })
    }
  })

  const parent = candidates.map((_, index) => index)
  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]!)
    }
    return parent[index]!
  }
  const unite = (a: number, b: number): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent[rootB] = rootA
    }
  }

  const cellSize = joinDistance
  const grid = new Map<string, number[]>()

  for (let index = 0; index < endpoints.length; index += 1) {
    const point = endpoints[index]!
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
    const bucket = grid.get(key)
    if (bucket) {
      bucket.push(index)
    } else {
      grid.set(key, [index])
    }
  }

  for (let index = 0; index < endpoints.length; index += 1) {
    const point = endpoints[index]!
    const cx = Math.floor(point.x / cellSize)
    const cy = Math.floor(point.y / cellSize)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(`${cx + dx}:${cy + dy}`)
        if (!bucket) {
          continue
        }
        for (const otherIndex of bucket) {
          if (otherIndex <= index) {
            continue
          }
          const other = endpoints[otherIndex]!
          if (Math.hypot(point.x - other.x, point.y - other.y) <= joinDistance) {
            unite(point.roadIndex, other.roadIndex)
          }
        }
      }
    }
  }

  const sizes = new Map<number, number>()
  for (let index = 0; index < candidates.length; index += 1) {
    const root = find(index)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  let bestRoot = 0
  let bestSize = 0
  for (const [root, size] of sizes) {
    if (size > bestSize) {
      bestRoot = root
      bestSize = size
    }
  }

  return candidates.filter((_, index) => find(index) === bestRoot)
}
