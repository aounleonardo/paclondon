import { describe, expect, it } from 'vitest'
import { GameEngine } from './gameEngine'
import type { PlayableMap } from '../types'

const roadMap: PlayableMap = {
  bounds: {
    north: 1,
    south: 0,
    east: 1,
    west: 0,
  },
  center: {
    lng: 0.5,
    lat: 0.5,
  },
  nodes: [
    { id: 'west', lng: 0.01, lat: 0.5, neighbors: ['mid'] },
    { id: 'mid', lng: 0.5, lat: 0.5, neighbors: ['west', 'east'] },
    { id: 'east', lng: 0.99, lat: 0.5, neighbors: ['mid'] },
    { id: 'ghost-a', lng: 0.45, lat: 0.55, neighbors: ['mid'] },
    { id: 'ghost-b', lng: 0.55, lat: 0.55, neighbors: ['mid'] },
    { id: 'ghost-c', lng: 0.45, lat: 0.45, neighbors: ['mid'] },
    { id: 'ghost-d', lng: 0.55, lat: 0.45, neighbors: ['mid'] },
  ],
  edges: [
    { id: 'mid-west', from: 'mid', to: 'west', kind: 'road', length: 40 },
    { id: 'mid-east', from: 'mid', to: 'east', kind: 'road', length: 40 },
    { id: 'ghost-a-mid', from: 'ghost-a', to: 'mid', kind: 'road', length: 20 },
    { id: 'ghost-b-mid', from: 'ghost-b', to: 'mid', kind: 'road', length: 20 },
    { id: 'ghost-c-mid', from: 'ghost-c', to: 'mid', kind: 'road', length: 20 },
    { id: 'ghost-d-mid', from: 'ghost-d', to: 'mid', kind: 'road', length: 20 },
  ],
  pellets: [],
  powerPellets: [],
  houses: [],
  spawnNodeId: 'east',
  ghostHomeNodeIds: ['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d'],
  sourceMode: 'road',
}

describe('GameEngine portals', () => {
  function resolveNow(engine: GameEngine, timestamp: number): void {
    const anyEngine = engine as any
    const pacmanBefore = anyEngine.snapshotEntity(engine.state.pacman)
    const ghostsBefore = engine.state.ghosts.map((ghost) => anyEngine.snapshotEntity(ghost))
    anyEngine.resolveCollisions(timestamp, pacmanBefore, ghostsBefore)
  }

  it('stops at the boundary when no road continues', () => {
    const engine = new GameEngine(roadMap)
    engine.setSpeedMultiplier(1)
    engine.state.pacman.currentNodeId = 'east'
    engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
    engine.setDirection('right')
    engine.start()
    const now = performance.now() + 100
    engine.tick(now)
    engine.tick(now + 100)

    expect(engine.state.pacman.currentNodeId).toBe('east')
    expect(engine.state.pacman.travel).toBeNull()
    expect(engine.state.pacman.position.lng).toBeCloseTo(0.99, 3)
  })

  it('does not wrap on a bend when a normal road continues inside the viewport', () => {
    const bendMap: PlayableMap = {
      ...roadMap,
      nodes: [
        { id: 'edge', lng: 0.965, lat: 0.8, neighbors: ['turn', 'inside'] },
        { id: 'turn', lng: 0.9, lat: 0.8, neighbors: ['edge'] },
        { id: 'inside', lng: 0.965, lat: 0.7, neighbors: ['edge'] },
        { id: 'ghost-a', lng: 0.45, lat: 0.55, neighbors: [] },
        { id: 'ghost-b', lng: 0.55, lat: 0.55, neighbors: [] },
        { id: 'ghost-c', lng: 0.45, lat: 0.45, neighbors: [] },
        { id: 'ghost-d', lng: 0.55, lat: 0.45, neighbors: [] },
      ],
      edges: [
        { id: 'edge-turn', from: 'edge', to: 'turn', kind: 'road', length: 20 },
        { id: 'edge-inside', from: 'edge', to: 'inside', kind: 'road', length: 20 },
      ],
      spawnNodeId: 'edge',
      ghostHomeNodeIds: ['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d'],
    }

    const engine = new GameEngine(bendMap)
    engine.setDirection('down')
    engine.start()
    engine.tick(performance.now() + 100)

    expect(engine.state.pacman.travel?.toNodeId).toBe('inside')
    expect(engine.state.pacman.position.lat).toBeLessThan(0.8)
  })

  it('awards chained ghost scores and resets from 200 on the next power cycle', () => {
    const engine = new GameEngine(roadMap)
    ;(engine as any).spawnProtectedUntil = 0

    engine.state.pacman.position = { lng: 0.45, lat: 0.55 }
    engine.state.ghosts[0].mode = 'frightened'
    engine.state.ghosts[0].position = { lng: 0.45, lat: 0.55 }
    engine.state.ghosts[0].currentNodeId = null
    engine.state.ghosts[0].travel = {
      edgeId: 'ghost-a-mid',
      fromNodeId: 'ghost-a',
      toNodeId: 'mid',
      progress: 0.4,
    }
    resolveNow(engine, performance.now() + 100)

    expect(engine.state.score).toBe(200)
    expect(engine.state.floatingScores.at(-1)?.text).toBe('200')
    expect(engine.state.ghosts[0].mode).toBe('eyes')
    expect(engine.state.ghosts[0].travel).not.toBeNull()

    engine.state.pacman.position = { lng: 0.55, lat: 0.55 }
    engine.state.ghosts[1].mode = 'frightened'
    engine.state.ghosts[1].position = { lng: 0.55, lat: 0.55 }
    engine.state.ghosts[1].currentNodeId = null
    ;(engine as any).frightenedGhostChain = 1
    resolveNow(engine, performance.now() + 200)

    expect(engine.state.score).toBe(600)
    expect(engine.state.floatingScores.at(-1)?.text).toBe('400')

    ;(engine as any).frightenedGhostChain = 0
    engine.state.pacman.position = { lng: 0.45, lat: 0.45 }
    engine.state.ghosts[2].mode = 'frightened'
    engine.state.ghosts[2].position = { lng: 0.45, lat: 0.45 }
    engine.state.ghosts[2].currentNodeId = null
    resolveNow(engine, performance.now() + 400)

    expect(engine.state.score).toBe(800)
    expect(engine.state.floatingScores.at(-1)?.text).toBe('200')
  })

  it('enters a short dying state before respawn after a hit', () => {
    const engine = new GameEngine(roadMap)
    engine.state.status = 'playing'
    engine.state.pacman.position = { lng: 0.5, lat: 0.5 }
    engine.state.pacman.currentNodeId = 'mid'
    ;(engine as any).spawnProtectedUntil = 0
    engine.state.ghosts[0].mode = 'chase'
    engine.state.ghosts[0].position = { lng: 0.5, lat: 0.5 }
    engine.state.ghosts[0].currentNodeId = 'mid'

    const hitAt = performance.now() + 100
    resolveNow(engine, hitAt)

    expect(engine.state.status).toBe('dying')
    expect(engine.state.visualEffects.some((effect) => effect.type === 'death')).toBe(true)

    engine.tick(hitAt + 1200)
    expect(engine.state.status).toBe('preview')
  })

  it('detects a collision when pacman and a ghost cross each other on the same straight road', () => {
    const engine = new GameEngine(roadMap)
    engine.state.status = 'playing'
    engine.state.remainingPellets = 1
    ;(engine as any).spawnProtectedUntil = 0
    engine.state.pacman.currentNodeId = null
    engine.state.pacman.travel = {
      edgeId: 'mid-east',
      fromNodeId: 'mid',
      toNodeId: 'east',
      progress: 0.45,
    }
    engine.state.pacman.position = { lng: 0.72, lat: 0.5 }
    engine.state.ghosts[0].mode = 'chase'
    engine.state.ghosts[0].currentNodeId = null
    engine.state.ghosts[0].travel = {
      edgeId: 'mid-east',
      fromNodeId: 'east',
      toNodeId: 'mid',
      progress: 0.45,
    }
    engine.state.ghosts[0].position = { lng: 0.77, lat: 0.5 }

    const now = performance.now() + 100
    engine.tick(now)

    expect(engine.state.status).toBe('dying')
    expect(engine.state.lives).toBe(2)
  })

  it('reverses pacman immediately when the opposite direction is pressed mid-edge', () => {
    const engine = new GameEngine(roadMap)
    engine.state.status = 'playing'
    engine.state.pacman.currentNodeId = null
    engine.state.pacman.direction = 'right'
    engine.state.pacman.pendingDirection = 'right'
    engine.state.pacman.travel = {
      edgeId: 'mid-east',
      fromNodeId: 'mid',
      toNodeId: 'east',
      progress: 0.25,
    }
    engine.state.pacman.position = { lng: 0.6225, lat: 0.5 }

    engine.setDirection('left')

    expect(engine.state.pacman.direction).toBe('left')
    expect(engine.state.pacman.pendingDirection).toBe('left')
    expect(engine.state.pacman.travel).toEqual({
      edgeId: 'mid-east',
      fromNodeId: 'east',
      toNodeId: 'mid',
      progress: 0.75,
    })
    expect(engine.state.pacman.position).toEqual({ lng: 0.6225, lat: 0.5 })
  })

  it('checks a vacant house then claims it to win', () => {
    const houseMap: PlayableMap = {
      ...roadMap,
      houses: [
        {
          id: 'H-vacant',
          lng: 0.99,
          lat: 0.5,
          isVacant: true,
          checked: false,
          claimed: false,
          state: 'unknown',
          edgeId: 'mid-east',
          progress: 0,
        },
      ],
    }

    const engine = new GameEngine(houseMap)
    expect(engine.state.remainingVacantHouses).toBe(1)
    engine.start()
    ;(engine as any).ghostsReleasedAt = Number.POSITIVE_INFINITY
    engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
    engine.state.pacman.currentNodeId = 'east'
    engine.state.pacman.travel = null
    engine.state.pacman.direction = 'right'
    engine.state.pacman.pendingDirection = 'right'

    let now = performance.now() + 100
    for (let step = 0; step < 45; step += 1) {
      now += 80
      engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
      engine.state.pacman.travel = null
      engine.state.pacman.currentNodeId = 'east'
      engine.tick(now)
    }

    const house = engine.getHouses()[0]
    expect(house.state).toBe('vacant')
    expect(house.checked).toBe(true)

    for (let step = 0; step < 140; step += 1) {
      now += 80
      engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
      engine.state.pacman.travel = null
      engine.state.pacman.currentNodeId = 'east'
      engine.tick(now)
    }

    expect(engine.getHouses()[0].claimed).toBe(true)
    expect(engine.state.remainingVacantHouses).toBe(0)
    expect(engine.state.status).toBe('win')
  })

  it('marks occupied houses red and does not count them toward win', () => {
    const houseMap: PlayableMap = {
      ...roadMap,
      houses: [
        {
          id: 'H-fake',
          lng: 0.99,
          lat: 0.5,
          isVacant: false,
          checked: false,
          claimed: false,
          state: 'unknown',
          edgeId: 'mid-east',
          progress: 0,
        },
        {
          id: 'H-real',
          lng: 0.01,
          lat: 0.5,
          isVacant: true,
          checked: false,
          claimed: false,
          state: 'unknown',
          edgeId: 'mid-west',
          progress: 0,
        },
      ],
    }

    const engine = new GameEngine(houseMap)
    expect(engine.state.remainingVacantHouses).toBe(1)
    engine.start()
    engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
    engine.state.pacman.currentNodeId = 'east'
    engine.state.pacman.travel = null
    engine.state.pacman.direction = 'right'
    engine.state.pacman.pendingDirection = 'right'

    let now = performance.now() + 100
    for (let step = 0; step < 45; step += 1) {
      now += 80
      engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
      engine.state.pacman.travel = null
      engine.state.pacman.currentNodeId = 'east'
      engine.tick(now)
    }

    const fake = engine.getHouses().find((house) => house.id === 'H-fake')
    expect(fake?.state).toBe('occupied')
    expect(engine.state.remainingVacantHouses).toBe(1)
    expect(engine.state.status).toBe('playing')
  })

  it('resets house progress when leaving the radius', () => {
    const houseMap: PlayableMap = {
      ...roadMap,
      houses: [
        {
          id: 'H1',
          lng: 0.99,
          lat: 0.5,
          isVacant: true,
          checked: false,
          claimed: false,
          state: 'unknown',
          edgeId: 'mid-east',
          progress: 0,
        },
      ],
    }

    const engine = new GameEngine(houseMap)
    engine.start()
    engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
    engine.state.pacman.currentNodeId = 'east'
    engine.state.pacman.travel = null
    engine.state.pacman.direction = 'right'
    engine.state.pacman.pendingDirection = 'right'

    let now = performance.now() + 100
    engine.tick(now)
    now += 1_000
    engine.state.pacman.position = { lng: 0.99, lat: 0.5 }
    engine.state.pacman.travel = null
    engine.state.pacman.currentNodeId = 'east'
    engine.tick(now)
    expect(engine.state.currentHouseAction).not.toBeNull()
    expect(engine.getHouses()[0].progress).toBeGreaterThan(0)

    now += 80
    engine.state.pacman.position = { lng: 0.5, lat: 0.5 }
    engine.tick(now)
    expect(engine.state.currentHouseAction).toBeNull()
    expect(engine.getHouses()[0].progress).toBe(0)
  })

  it('spawns a bonus fruit after enough pellets have been eaten', () => {
    const engine = new GameEngine(roadMap)
    const anyEngine = engine as any
    anyEngine.totalPelletsAtLevelStart = 10
    anyEngine.fruitTriggerIndex = 0
    engine.state.remainingPellets = 7
    engine.state.bonusFruit = null

    anyEngine.maybeSpawnBonusFruitFromProgress(performance.now() + 100)

    expect(engine.state.bonusFruit).not.toBeNull()
  })

  it('awards an extra life for each 5000-point milestone', () => {
    const engine = new GameEngine(roadMap)
    const anyEngine = engine as any
    engine.state.score = 15_050
    engine.state.lives = 3

    anyEngine.awardExtraLifeIfEligible()
    expect(engine.state.lives).toBe(6)
    expect(engine.drainEvents().filter((event) => event.type === 'extra-life')).toHaveLength(3)

    anyEngine.awardExtraLifeIfEligible()
    expect(engine.state.lives).toBe(6)

    engine.state.score = 20_000
    anyEngine.awardExtraLifeIfEligible()
    expect(engine.state.lives).toBe(7)
    expect(engine.drainEvents().filter((event) => event.type === 'extra-life')).toHaveLength(1)
  })

  it('turns eyes back into a normal ghost after reaching home', () => {
    const engine = new GameEngine(roadMap)
    engine.state.status = 'playing'
    const ghost = engine.state.ghosts[0]
    ghost.mode = 'eyes'
    ghost.currentNodeId = ghost.homeNodeId
    ghost.travel = null

    engine.tick(performance.now() + 100)

    expect(engine.state.ghosts[0].mode).toBe('chase')
  })

  it('lets eyes ghosts path home even if recent memory would normally block that turn', () => {
    const eyesMap: PlayableMap = {
      ...roadMap,
      nodes: [
        { id: 'west', lng: 0.2, lat: 0.5, neighbors: ['mid'] },
        { id: 'mid', lng: 0.5, lat: 0.5, neighbors: ['west', 'ghost-a'] },
        { id: 'ghost-a', lng: 0.7, lat: 0.5, neighbors: ['mid'] },
        { id: 'ghost-b', lng: 0.55, lat: 0.55, neighbors: [] },
        { id: 'ghost-c', lng: 0.45, lat: 0.45, neighbors: [] },
        { id: 'ghost-d', lng: 0.55, lat: 0.45, neighbors: [] },
      ],
      edges: [
        { id: 'mid-west', from: 'mid', to: 'west', kind: 'road', length: 20 },
        { id: 'ghost-a-mid', from: 'ghost-a', to: 'mid', kind: 'road', length: 20 },
      ],
      spawnNodeId: 'west',
      ghostHomeNodeIds: ['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d'],
    }
    const engine = new GameEngine(eyesMap)
    const ghost = engine.state.ghosts[0]
    ghost.mode = 'eyes'
    ghost.currentNodeId = 'mid'
    ghost.homeNodeId = 'ghost-a'
    ghost.lastNodeId = 'east'
    ghost.recentNodeIds = ['ghost-a', 'ghost-b', 'ghost-c', 'ghost-d']

    ;(engine as any).chooseGhostEdge(ghost)

    expect(ghost.travel?.toNodeId).toBe('ghost-a')
  })
})
