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
