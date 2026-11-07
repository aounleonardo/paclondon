import { describe, expect, it } from 'vitest'
import { generatePlayableMap } from './generatePlayableMap'
import type { RoadData, Viewport } from '../types'

const viewport: Viewport = {
  center: { lng: 121.5, lat: 25.04 },
  zoom: 14,
  bounds: {
    north: 25.06,
    south: 25.02,
    east: 121.54,
    west: 121.48,
  },
}

describe('generatePlayableMap', () => {
  it('falls back to generated mode when there is no road data', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    expect(map.sourceMode).toBe('generated')
    expect(map.nodes.length).toBeGreaterThan(20)
    expect(map.pellets).toEqual([])
    expect(map.powerPellets).toEqual([])
  })

  it('keeps real road geometry when a decent graph exists', () => {
    const roadData: RoadData = {
      nodes: [
        { id: '1', lng: 121.49, lat: 25.05, neighbors: ['2', '4'] },
        { id: '2', lng: 121.50, lat: 25.05, neighbors: ['1', '3', '5'] },
        { id: '3', lng: 121.51, lat: 25.05, neighbors: ['2', '6'] },
        { id: '4', lng: 121.49, lat: 25.04, neighbors: ['1', '5', '7'] },
        { id: '5', lng: 121.50, lat: 25.04, neighbors: ['2', '4', '6', '8'] },
        { id: '6', lng: 121.51, lat: 25.04, neighbors: ['3', '5', '9'] },
        { id: '7', lng: 121.49, lat: 25.03, neighbors: ['4', '8'] },
        { id: '8', lng: 121.50, lat: 25.03, neighbors: ['5', '7', '9'] },
        { id: '9', lng: 121.51, lat: 25.03, neighbors: ['6', '8', '10'] },
        { id: '10', lng: 121.52, lat: 25.03, neighbors: ['9', '11'] },
        { id: '11', lng: 121.52, lat: 25.04, neighbors: ['10', '12'] },
        { id: '12', lng: 121.52, lat: 25.05, neighbors: ['11'] },
      ],
      edges: [
        { id: 'e1', from: '1', to: '2', kind: 'residential', length: 100 },
        { id: 'e2', from: '2', to: '3', kind: 'residential', length: 100 },
        { id: 'e3', from: '1', to: '4', kind: 'residential', length: 100 },
        { id: 'e4', from: '2', to: '5', kind: 'residential', length: 100 },
        { id: 'e5', from: '3', to: '6', kind: 'residential', length: 100 },
        { id: 'e6', from: '4', to: '5', kind: 'residential', length: 100 },
        { id: 'e7', from: '5', to: '6', kind: 'residential', length: 100 },
        { id: 'e8', from: '4', to: '7', kind: 'residential', length: 100 },
        { id: 'e9', from: '5', to: '8', kind: 'residential', length: 100 },
        { id: 'e10', from: '6', to: '9', kind: 'residential', length: 100 },
        { id: 'e11', from: '7', to: '8', kind: 'residential', length: 100 },
        { id: 'e12', from: '8', to: '9', kind: 'residential', length: 100 },
        { id: 'e13', from: '9', to: '10', kind: 'residential', length: 100 },
        { id: 'e14', from: '10', to: '11', kind: 'residential', length: 100 },
        { id: 'e15', from: '11', to: '12', kind: 'residential', length: 100 },
      ],
    }

    const map = generatePlayableMap(viewport, roadData)
    expect(['road', 'hybrid']).toContain(map.sourceMode)
    expect(map.edges.length).toBeGreaterThan(0)
    expect(map.nodes.length).toBeLessThanOrEqual(roadData.nodes.length)
    expect(map.pellets).toEqual([])
    expect(map.powerPellets).toEqual([])
  })

  it('assigns four ghost home nodes when enough nodes exist', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    expect(map.ghostHomeNodeIds.length).toBe(4)
    expect(new Set(map.ghostHomeNodeIds).size).toBe(4)
  })

  it('keeps spawn away from ghost home nodes', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    const nodeById = new Map(map.nodes.map((node) => [node.id, node]))
    const spawn = nodeById.get(map.spawnNodeId)
    const homes = map.ghostHomeNodeIds.map((id) => nodeById.get(id)).filter(Boolean)

    expect(map.ghostHomeNodeIds).not.toContain(map.spawnNodeId)
    expect(spawn).toBeDefined()
    expect(homes.length).toBe(4)

    const minDistance = Math.min(
      ...homes.map((home) => {
        const dx = (spawn!.lng - home!.lng) * 111_320
        const dy = (spawn!.lat - home!.lat) * 111_320
        return Math.hypot(dx, dy)
      }),
    )
    expect(minDistance).toBeGreaterThan(100)
  })

  it('does not inject artificial portal edges into the road graph', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] })
    const portalEdges = map.edges.filter((edge) => edge.kind === 'portal')
    expect(portalEdges.length).toBe(0)
  })

  it('avoids placing pellets right on complex intersections', () => {
    const roadData: RoadData = {
      nodes: [
        { id: 'n', lng: 121.5, lat: 25.055, neighbors: ['c'] },
        { id: 's', lng: 121.5, lat: 25.025, neighbors: ['c'] },
        { id: 'w', lng: 121.485, lat: 25.04, neighbors: ['c'] },
        { id: 'e', lng: 121.515, lat: 25.04, neighbors: ['c'] },
        { id: 'c', lng: 121.5, lat: 25.04, neighbors: ['n', 's', 'w', 'e'] },
        { id: 'x', lng: 121.525, lat: 25.04, neighbors: ['e'] },
        { id: 'y', lng: 121.535, lat: 25.04, neighbors: ['x'] },
        { id: 'u', lng: 121.48, lat: 25.03, neighbors: ['v'] },
        { id: 'v', lng: 121.49, lat: 25.03, neighbors: ['u', 'w2'] },
        { id: 'w2', lng: 121.5, lat: 25.03, neighbors: ['v', 'z'] },
        { id: 'z', lng: 121.51, lat: 25.03, neighbors: ['w2', 'q'] },
        { id: 'q', lng: 121.52, lat: 25.03, neighbors: ['z'] },
      ],
      edges: [
        { id: 'n-c', from: 'n', to: 'c', kind: 'road', length: 80 },
        { id: 's-c', from: 's', to: 'c', kind: 'road', length: 80 },
        { id: 'w-c', from: 'w', to: 'c', kind: 'road', length: 80 },
        { id: 'e-c', from: 'e', to: 'c', kind: 'road', length: 80 },
        { id: 'e-x', from: 'e', to: 'x', kind: 'road', length: 80 },
        { id: 'x-y', from: 'x', to: 'y', kind: 'road', length: 80 },
        { id: 'u-v', from: 'u', to: 'v', kind: 'road', length: 80 },
        { id: 'v-w2', from: 'v', to: 'w2', kind: 'road', length: 80 },
        { id: 'w2-z', from: 'w2', to: 'z', kind: 'road', length: 80 },
        { id: 'z-q', from: 'z', to: 'q', kind: 'road', length: 80 },
      ],
    }

    const map = generatePlayableMap(viewport, roadData)
    expect(map.pellets).toEqual([])
    expect(map.powerPellets).toEqual([])
  })

  it('attaches vacant houses supplied by the caller', () => {
    const map = generatePlayableMap(viewport, { nodes: [], edges: [] }, {
      vacantHouses: [
        { id: 'mock-1', lat: 25.04, lng: 121.5, status: 'vacant' },
      ],
    })

    expect(map.vacantHouses).toEqual([
      { id: 'mock-1', lat: 25.04, lng: 121.5, status: 'vacant' },
    ])
  })
})
