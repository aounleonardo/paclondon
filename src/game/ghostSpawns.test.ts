import { describe, expect, it } from 'vitest'
import { chooseGhostHomesNear, GHOST_SPAWN_RADIUS_METERS } from './ghostSpawns'
import type { RoadGraphNode } from '../types'

function ringNodes(count: number, centerLng: number, centerLat: number, radiusMeters: number): RoadGraphNode[] {
  const latScale = 111_320
  const lngScale = Math.cos(centerLat * Math.PI / 180) * latScale
  const nodes: RoadGraphNode[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    const id = `n-${index}`
    const lng = centerLng + (Math.cos(angle) * radiusMeters) / lngScale
    const lat = centerLat + (Math.sin(angle) * radiusMeters) / latScale
    nodes.push({ id, lng, lat, neighbors: [] })
  }
  for (let index = 0; index < count; index += 1) {
    const prev = (index + count - 1) % count
    const next = (index + 1) % count
    nodes[index].neighbors = [`n-${prev}`, `n-${next}`]
  }
  return nodes
}

describe('chooseGhostHomesNear', () => {
  it('places ghosts within one mile of the anchor and not on top of the player', () => {
    const anchor = { lng: 0, lat: 51.5 }
    const nodes = ringNodes(24, 0, 51.5, 400)
    const homes = chooseGhostHomesNear(nodes, anchor, 4)

    expect(homes).toHaveLength(4)
    const latScale = 111_320
    for (const id of homes) {
      const node = nodes.find((entry) => entry.id === id)
      expect(node).toBeDefined()
      const dx = (node!.lng - anchor.lng) * latScale
      const dy = (node!.lat - anchor.lat) * latScale
      const distance = Math.hypot(dx, dy)
      expect(distance).toBeLessThanOrEqual(GHOST_SPAWN_RADIUS_METERS + 1)
      expect(distance).toBeGreaterThanOrEqual(45)
    }
  })
})
