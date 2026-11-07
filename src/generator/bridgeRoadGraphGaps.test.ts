import { describe, expect, it } from 'vitest'
import { bridgeRoadGraphGaps } from './bridgeRoadGraphGaps'

describe('bridgeRoadGraphGaps', () => {
  it('connects unlinked nodes within one metre', () => {
    const lat = 51.53
    const lng = -0.1
    const offset = 0.8 / 111_320

    const bridged = bridgeRoadGraphGaps({
      nodes: [
        { id: 'a', lng, lat, neighbors: [] },
        { id: 'b', lng, lat: lat + offset, neighbors: [] },
      ],
      edges: [],
    })

    expect(bridged.edges).toHaveLength(1)
    expect(bridged.edges[0]?.synthetic).toBe(true)
    expect(bridged.edges[0]?.length).toBeLessThanOrEqual(1)
    const nodeA = bridged.nodes.find((node) => node.id === 'a')
    const nodeB = bridged.nodes.find((node) => node.id === 'b')
    expect(nodeA?.neighbors).toContain('b')
    expect(nodeB?.neighbors).toContain('a')
  })

  it('does not add an edge when the gap is wider than one metre', () => {
    const lat = 51.53
    const lng = -0.1
    const offset = 2 / 111_320

    const bridged = bridgeRoadGraphGaps({
      nodes: [
        { id: 'a', lng, lat, neighbors: [] },
        { id: 'b', lng, lat: lat + offset, neighbors: [] },
      ],
      edges: [],
    })

    expect(bridged.edges).toHaveLength(0)
  })
})
