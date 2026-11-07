import type { Bounds, GeoPoint } from '../../src/types'

export interface BoroughPolygon {
  id: string
  name: string
  ring: GeoPoint[]
  bounds: Bounds
}

interface GeoJsonPolygon {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

interface GeoJsonFeature {
  type: 'Feature'
  properties?: Record<string, unknown>
  geometry: GeoJsonPolygon
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

function ringToPoints(ring: number[][]): GeoPoint[] {
  return ring.map(([lng, lat]) => ({ lng, lat }))
}

function boundsForPoints(points: GeoPoint[]): Bounds {
  let north = -Infinity
  let south = Infinity
  let east = -Infinity
  let west = Infinity
  for (const point of points) {
    north = Math.max(north, point.lat)
    south = Math.min(south, point.lat)
    east = Math.max(east, point.lng)
    west = Math.min(west, point.lng)
  }
  return { north, south, east, west }
}

/** Ray-cast point-in-polygon for a single closed ring (lng/lat). */
export function pointInRing(point: GeoPoint, ring: GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i]
    const pj = ring[j]
    const intersects = ((pi.lat > point.lat) !== (pj.lat > point.lat))
      && (point.lng < ((pj.lng - pi.lng) * (point.lat - pi.lat)) / ((pj.lat - pi.lat) || Number.EPSILON) + pi.lng)
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

export function loadBoroughPolygon(payload: GeoJsonFeatureCollection): BoroughPolygon {
  const feature = payload.features[0]
  if (!feature) {
    throw new Error('Borough GeoJSON has no features')
  }

  const geometry = feature.geometry
  let ringCoords: number[][]
  if (geometry.type === 'Polygon') {
    ringCoords = geometry.coordinates[0] as number[][]
  } else {
    // Use the largest outer ring for MultiPolygon boroughs.
    const polys = geometry.coordinates as number[][][][]
    ringCoords = polys
      .map((poly) => poly[0])
      .sort((a, b) => b.length - a.length)[0]
  }

  const ring = ringToPoints(ringCoords)
  const id = String(feature.properties?.id ?? 'islington')
  const name = String(feature.properties?.name ?? 'Islington')
  return {
    id,
    name,
    ring,
    bounds: boundsForPoints(ring),
  }
}

export function splitBounds(bounds: Bounds, rows: number, cols: number, overlapFraction = 0.05): Bounds[] {
  const latSpan = bounds.north - bounds.south
  const lngSpan = bounds.east - bounds.west
  const latStep = latSpan / rows
  const lngStep = lngSpan / cols
  const latOverlap = latStep * overlapFraction
  const lngOverlap = lngStep * overlapFraction
  const tiles: Bounds[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      tiles.push({
        south: bounds.south + row * latStep - (row === 0 ? 0 : latOverlap),
        north: bounds.south + (row + 1) * latStep + (row === rows - 1 ? 0 : latOverlap),
        west: bounds.west + col * lngStep - (col === 0 ? 0 : lngOverlap),
        east: bounds.west + (col + 1) * lngStep + (col === cols - 1 ? 0 : lngOverlap),
      })
    }
  }

  return tiles
}
