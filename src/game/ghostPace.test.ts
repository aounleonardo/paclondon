import { describe, expect, it } from 'vitest'
import { DEFAULT_GHOST_PACE_DEFICIT, GameEngine } from './gameEngine'
import type { PlayableMap, Viewport } from '../types'

const viewport: Viewport = {
  center: { lng: -0.071273, lat: 51.525134 },
  zoom: 17,
  bounds: { north: 51.527, south: 51.523, east: -0.068, west: -0.075 },
}

const map: PlayableMap = {
  bounds: viewport.bounds,
  center: viewport.center,
  nodes: [
    { id: '1', lng: -0.071, lat: 51.525, neighbors: ['2'] },
    { id: '2', lng: -0.0705, lat: 51.525, neighbors: ['1'] },
  ],
  edges: [{ id: 'e1', from: '1', to: '2', kind: 'road', length: 40 }],
  pellets: [],
  powerPellets: [],
  vacantHouses: [],
  spawnNodeId: '1',
  ghostHomeNodeIds: ['2'],
  sourceMode: 'road',
}

describe('ghost pace', () => {
  it('defaults to 5% slower than Pac-Man and can be eased via slider value', () => {
    const engine = new GameEngine(map)
    expect(engine.getGhostPaceDeficit()).toBeCloseTo(DEFAULT_GHOST_PACE_DEFICIT, 5)
    engine.setGhostPaceDeficit(0.25)
    expect(engine.getGhostPaceDeficit()).toBe(0.25)
  })
})
