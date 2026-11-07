import { describe, expect, it } from 'vitest'
import { bridgeRoadGraphGaps } from './bridgeRoadGraphGaps'

describe('bridgeRoadGraphGaps', () => {
  it('connects unlinked nodes within five metres', () => {
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
    expect(bridged.edges[0]?.length).toBeLessThanOrEqual(5)
    const nodeA = bridged.nodes.find((node) => node.id === 'a')
    const nodeB = bridged.nodes.find((node) => node.id === 'b')
    expect(nodeA?.neighbors).toContain('b')
    expect(nodeB?.neighbors).toContain('a')
  })

  it('bridges parallel junction spurs that share neighbors within ten metres', () => {
    const lat = 51.548758
    const lng = -0.0964
    const latScale = 111_320
    const lngScale = Math.cos(lat * Math.PI / 180) * latScale
    const spurLng = 5.421 / lngScale

    const bridged = bridgeRoadGraphGaps({
      nodes: [
        { id: 'hub-a', lng: lng - 0.0001, lat, neighbors: ['spur-a', 'spur-b'] },
        { id: 'hub-b', lng: lng + 0.0001, lat: lat - 0.00001, neighbors: ['spur-a', 'spur-b'] },
        {
          id: 'spur-a',
          lng,
          lat: lat + 0.00001,
          neighbors: ['hub-a', 'hub-b'],
        },
        {
          id: 'spur-b',
          lng: lng + spurLng,
          lat: lat + 0.00001,
          neighbors: ['hub-a', 'hub-b'],
        },
      ],
      edges: [
        { id: 'e1', from: 'hub-a', to: 'spur-a', kind: 'road', length: 20 },
        { id: 'e2', from: 'hub-b', to: 'spur-a', kind: 'road', length: 20 },
        { id: 'e3', from: 'hub-a', to: 'spur-b', kind: 'road', length: 20 },
        { id: 'e4', from: 'hub-b', to: 'spur-b', kind: 'road', length: 20 },
      ],
    })

    const spurBridge = bridged.edges.find((edge) =>
      (edge.from === 'spur-a' && edge.to === 'spur-b')
      || (edge.from === 'spur-b' && edge.to === 'spur-a'))
    expect(spurBridge?.synthetic).toBe(true)
    expect(spurBridge?.length).toBeGreaterThan(5)
    expect(spurBridge?.length).toBeLessThanOrEqual(10)
  })

  it('does not add an edge when the gap is wider than five metres', () => {
    const lat = 51.53
    const lng = -0.1
    const offset = 6 / 111_320

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
