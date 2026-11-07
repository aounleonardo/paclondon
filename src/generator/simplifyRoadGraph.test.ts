import { describe, expect, it } from 'vitest'
import { simplifyRoadGraph } from './simplifyRoadGraph'

describe('simplifyRoadGraph', () => {
  it('collapses nearly-straight bend nodes into a single edge', () => {
    const simplified = simplifyRoadGraph({
      nodes: [
        { id: 'a', lng: 0, lat: 0, neighbors: ['b'] },
        { id: 'b', lng: 0.0001, lat: 0, neighbors: ['a', 'c'] },
        { id: 'c', lng: 0.0002, lat: 0, neighbors: ['b'] },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', kind: 'road', length: 11 },
        { id: 'bc', from: 'b', to: 'c', kind: 'road', length: 11 },
      ],
    })

    expect(simplified.nodes.map((node) => node.id).sort()).toEqual(['a', 'c'])
    expect(simplified.edges).toHaveLength(1)
    expect(simplified.edges[0]?.from === 'a' || simplified.edges[0]?.to === 'a').toBe(true)
    expect(simplified.edges[0]?.from === 'c' || simplified.edges[0]?.to === 'c').toBe(true)
  })

  it('keeps sharp corners so junctions stay playable', () => {
    const simplified = simplifyRoadGraph({
      nodes: [
        { id: 'a', lng: 0, lat: 0, neighbors: ['corner'] },
        { id: 'corner', lng: 0.0002, lat: 0, neighbors: ['a', 'c'] },
        { id: 'c', lng: 0.0002, lat: 0.0002, neighbors: ['corner'] },
      ],
      edges: [
        { id: 'a-corner', from: 'a', to: 'corner', kind: 'road', length: 22 },
        { id: 'corner-c', from: 'corner', to: 'c', kind: 'road', length: 22 },
      ],
    }, {
      minEdgeLengthMeters: 5,
      maxBendKeepDegrees: 28,
    })

    expect(simplified.nodes.map((node) => node.id).sort()).toEqual(['a', 'c', 'corner'])
    expect(simplified.edges).toHaveLength(2)
  })
})
