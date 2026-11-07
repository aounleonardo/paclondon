import { describe, expect, it, vi } from 'vitest'
import { attachVacantHouses, loadBoroughVacantHouses } from './boroughData'
import type { PlayableMap } from '../types'

const map: PlayableMap = {
  bounds: { north: 51.53, south: 51.52, east: -0.07, west: -0.08 },
  center: { lat: 51.525, lng: -0.071 },
  nodes: [
    { id: 'a', lat: 51.525134, lng: -0.071273, neighbors: ['b'] },
    { id: 'b', lat: 51.5252, lng: -0.071, neighbors: ['a'] },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'residential', length: 30 }],
  pellets: [],
  powerPellets: [],
  vacantHouses: [],
  spawnNodeId: 'a',
  ghostHomeNodeIds: ['b'],
  sourceMode: 'road',
}

describe('attachVacantHouses', () => {
  it('keeps houses near the road network and leaves far ones out', () => {
    const attached = attachVacantHouses(map, [
      { id: 'near', lat: 51.52514, lng: -0.07127, status: 'vacant' },
      { id: 'far', lat: 51.54, lng: -0.02, status: 'vacant' },
    ])

    expect(attached.vacantHouses.map((house) => house.id)).toEqual(['near'])
  })
})

describe('loadBoroughVacantHouses', () => {
  it('falls through an empty blob payload to the bundled borough file', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/')) {
        return new Response(JSON.stringify({ houses: [] }), { status: 200 })
      }
      if (url.includes('islington-vacant-houses.json')) {
        return new Response(JSON.stringify({
          houses: [{ id: 'isl-1', lat: 51.555, lng: -0.108, label: 'near emirates' }],
        }), { status: 200 })
      }
      return new Response('missing', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const houses = await loadBoroughVacantHouses('islington')
    expect(houses.map((house) => house.id)).toEqual(['isl-1'])

    vi.unstubAllGlobals()
  })
})
