import type { Bounds, VacantProperty } from '../types'

const VACANT_HOUSES_URL = `${import.meta.env.BASE_URL}vacant-houses.json`

interface VacantHousesFile {
  houses?: Array<{
    id?: string
    label?: string
    lat?: number
    lng?: number
  }>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseVacantHouses(payload: VacantHousesFile): VacantProperty[] {
  const houses = payload.houses ?? []
  const parsed: VacantProperty[] = []

  for (const [index, house] of houses.entries()) {
    if (!isFiniteNumber(house.lat) || !isFiniteNumber(house.lng)) {
      continue
    }
    parsed.push({
      id: house.id?.trim() || `vacant-${index + 1}`,
      label: house.label?.trim() || undefined,
      lat: house.lat,
      lng: house.lng,
      status: 'vacant',
    })
  }

  return parsed
}

export function vacantHousesInBounds(houses: VacantProperty[], bounds: Bounds): VacantProperty[] {
  return houses.filter((house) =>
    house.lat >= bounds.south
    && house.lat <= bounds.north
    && house.lng >= bounds.west
    && house.lng <= bounds.east)
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const latScale = 111_320
  const lngScale = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * latScale
  const dx = (a.lng - b.lng) * lngScale
  const dy = (a.lat - b.lat) * latScale
  return Math.hypot(dx, dy)
}

/** Prefer houses in the viewport; if none, fall back to the nearest ones around the centre. */
export function selectVacantHousesForPlay(
  houses: VacantProperty[],
  bounds: Bounds,
  center: { lat: number; lng: number },
  fallbackCount = 4,
): VacantProperty[] {
  const inView = vacantHousesInBounds(houses, bounds)
  if (inView.length > 0) {
    return inView
  }

  return [...houses]
    .sort((a, b) => distanceMeters(a, center) - distanceMeters(b, center))
    .slice(0, fallbackCount)
}

export async function loadVacantHouses(): Promise<VacantProperty[]> {
  try {
    const response = await fetch(VACANT_HOUSES_URL, { cache: 'no-cache' })
    if (!response.ok) {
      return []
    }
    const payload = await response.json() as VacantHousesFile
    return parseVacantHouses(payload)
  } catch {
    return []
  }
}
