import { describe, expect, it } from 'vitest'
import { parsePrecomputedMaze } from './precomputedMaze'
import type { PlayableMap, Viewport } from '../types'

const viewport: Viewport = {
  center: { lng: -0.071273, lat: 51.525134 },
  zoom: 17,
  bounds: {
    north: 51.527,
    south: 51.523,
    east: -0.068,
    west: -0.075,
  },
}

const map: PlayableMap = {
  bounds: viewport.bounds,
  center: viewport.center,
  nodes: [
    { id: '1', lng: -0.071, lat: 51.525, neighbors: ['2'] },
    { id: '2', lng: -0.0705, lat: 51.525, neighbors: ['1'] },
  ],
  edges: [{ id: 'e1', from: '1', to: '2', kind: 'residential', length: 40 }],
  pellets: [],
  powerPellets: [],
  vacantHouses: [{ id: 'mock-1', lat: 51.52505, lng: -0.07075, status: 'vacant' }],
  spawnNodeId: '1',
  ghostHomeNodeIds: ['1'],
  sourceMode: 'road',
}

describe('parsePrecomputedMaze', () => {
  it('accepts a valid precomputed maze payload', () => {
    const parsed = parsePrecomputedMaze({
      id: 'newspeak-house',
      label: 'Newspeak House, Tower Hamlets',
      generatedAt: '2026-11-07T00:00:00.000Z',
      viewport,
      map,
    })

    expect(parsed?.id).toBe('newspeak-house')
    expect(parsed?.map.vacantHouses).toHaveLength(1)
    expect(parsed?.map.spawnNodeId).toBe('1')
  })

  it('resets vacant house status to vacant on load', () => {
    const parsed = parsePrecomputedMaze({
      id: 'newspeak-house',
      label: 'Newspeak House',
      viewport,
      map: {
        ...map,
        vacantHouses: [{ id: 'mock-1', lat: 51.52505, lng: -0.07075, status: 'reported' }],
      },
    })

    expect(parsed?.map.vacantHouses[0]?.status).toBe('vacant')
  })

  it('drops houses farther than the report radius from playable roads', () => {
    const parsed = parsePrecomputedMaze({
      id: 'newspeak-house',
      label: 'Newspeak House',
      viewport,
      map: {
        ...map,
        vacantHouses: [
          { id: 'near', lat: 51.52505, lng: -0.07075, status: 'vacant' },
          { id: 'far', lat: 51.5265, lng: -0.071, status: 'vacant' },
        ],
      },
    })

    expect(parsed?.map.vacantHouses.map((house) => house.id)).toEqual(['near'])
  })

  it('rejects malformed payloads', () => {
    expect(parsePrecomputedMaze(null)).toBeNull()
    expect(parsePrecomputedMaze({ id: 'x', label: 'y' })).toBeNull()
    expect(parsePrecomputedMaze({
      id: 'x',
      label: 'y',
      viewport,
      map: { ...map, spawnNodeId: 123 },
    })).toBeNull()
  })
})
