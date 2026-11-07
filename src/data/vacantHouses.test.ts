import { describe, expect, it } from 'vitest'
import { parseVacantHouses, vacantHousesInBounds } from './vacantHouses'

describe('vacantHouses', () => {
  it('parses mock vacant house records into vacant properties', () => {
    const houses = parseVacantHouses({
      houses: [
        { id: 'mock-1', label: 'Columbia Road (mock)', lat: 51.5305, lng: -0.0713 },
        { id: 'bad', label: 'missing coords' },
      ],
    })

    expect(houses).toEqual([
      {
        id: 'mock-1',
        label: 'Columbia Road (mock)',
        lat: 51.5305,
        lng: -0.0713,
        status: 'vacant',
      },
    ])
  })

  it('filters houses to the active map bounds', () => {
    const houses = parseVacantHouses({
      houses: [
        { id: 'inside', lat: 51.525, lng: -0.071 },
        { id: 'outside', lat: 51.54, lng: -0.071 },
      ],
    })

    const visible = vacantHousesInBounds(houses, {
      north: 51.53,
      south: 51.52,
      east: -0.06,
      west: -0.08,
    })

    expect(visible.map((house) => house.id)).toEqual(['inside'])
  })
})
