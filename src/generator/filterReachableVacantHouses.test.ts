import { describe, expect, it } from 'vitest'
import { filterReachableVacantHouses } from './filterReachableVacantHouses'

describe('filterReachableVacantHouses', () => {
  const nodes = [
    { id: 'a', lng: -0.0713, lat: 51.5251, neighbors: ['b'] },
    { id: 'b', lng: -0.0705, lat: 51.5251, neighbors: ['a'] },
  ]
  const edges = [
    { id: 'a-b', from: 'a', to: 'b', kind: 'road', length: 55 },
  ]

  it('keeps houses close to the playable road graph', () => {
    const kept = filterReachableVacantHouses(
      [
        { id: 'near', lat: 51.52512, lng: -0.0709, status: 'vacant' },
        { id: 'far', lat: 51.5265, lng: -0.0713, status: 'vacant' },
      ],
      nodes,
      edges,
      15,
    )

    expect(kept.map((house) => house.id)).toEqual(['near'])
  })

  it('drops all houses when the maze has no roads', () => {
    const kept = filterReachableVacantHouses(
      [{ id: 'near', lat: 51.52512, lng: -0.0709, status: 'vacant' }],
      [],
      [],
    )
    expect(kept).toEqual([])
  })
})
