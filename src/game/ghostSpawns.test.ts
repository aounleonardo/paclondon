import { describe, expect, it } from 'vitest'
import { chooseGhostHomesNear, GHOST_SPAWN_RADIUS_METERS } from './ghostSpawns'
import type { RoadGraphNode } from '../types'

function nodeAtDistance(centerLng: number, centerLat: number, radiusMeters: number, id: string): RoadGraphNode {
  const latScale = 111_320
  const lngScale = Math.cos(centerLat * Math.PI / 180) * latScale
  return {
    id,
    lng: centerLng + radiusMeters / lngScale,
    lat: centerLat,
    neighbors: [],
  }
}

describe('chooseGhostHomesNear', () => {
  it('places ghosts within the spawn radius and not on top of the player', () => {
    const anchor = { lng: 0, lat: 51.5 }
    const nodes = [80, 120, 200, 260].map((radius, index) => {
      const node = nodeAtDistance(0, 51.5, radius, `n-${index}`)
      node.neighbors = ['hub']
      return node
    })
    nodes.push({ id: 'hub', lng: 0.001, lat: 51.5, neighbors: nodes.map((node) => node.id) })
    const homes = chooseGhostHomesNear(nodes, anchor, 4)

    expect(homes).toHaveLength(4)
    const latScale = 111_320
    const lngScale = Math.cos(anchor.lat * Math.PI / 180) * latScale
    for (const id of homes) {
      const node = nodes.find((entry) => entry.id === id)
      expect(node).toBeDefined()
      const dx = (node!.lng - anchor.lng) * lngScale
      const dy = (node!.lat - anchor.lat) * latScale
      const distance = Math.hypot(dx, dy)
      expect(distance).toBeLessThanOrEqual(GHOST_SPAWN_RADIUS_METERS + 1)
      expect(distance).toBeGreaterThanOrEqual(55)
    }
  })
})
