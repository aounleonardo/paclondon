import { describe, expect, it } from 'vitest'
import { attachVacantHouses } from './boroughData'
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
