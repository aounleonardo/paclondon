import type { VacantProperty } from '../types'
import { CHASER_SPRITES, type PlayerSpriteId } from '../render/spriteAtlas'
import {
  expandRoads,
  loadBoroughData,
  simplifyPlayableRoads,
  type BoroughData,
  type RoadSegment,
} from './boroughData'
import { latLngToTinyWorld, worldDeltaToMeters } from './projection'

const TOTAL_HOMES = 20
const EDGE = 26
const PLAYER_SPEED = 2.4
const CHASER_SPEED = 1.25
const NEAR = 46
const HOLD_MS = 1000
const CATCH = 22
const DIRV: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]]
/** Road east of Emirates Stadium (Hornsey Rd / plaza side), tiny.london world px. */
const EMIRATES_EAST_SPAWN: [number, number] = [113900, 45141]

export interface TinyPlayOptions {
  root: HTMLElement
  boroughDataUrl: string
  startPostcode: string
  player: PlayerSpriteId
  vacantHouses: VacantProperty[]
}

interface Actor {
  el: HTMLDivElement
  x: number
  y: number
  dir: number
  frame: number
  t: number
  sheet: string
}

interface HouseMarker {
  wx: number
  wy: number
  x: number
  y: number
  hold: number
  done: boolean
  el: HTMLDivElement
  id: string
}

export class TinyLondonPlay {
  private readonly root: HTMLElement
  private readonly options: TinyPlayOptions
  private data: BoroughData | null = null
  private roads: RoadSegment[] = []
  private scale = 0.482
  private cam: [number, number] | null = null
  private camPc: string | null = null
  private iframe: HTMLIFrameElement | null = null
  private world: HTMLDivElement | null = null
  private overlay: HTMLCanvasElement | null = null
  private mask: Uint8ClampedArray | null = null
  private maskW = 0
  private maskH = 0
  private showRoads = true
  private loading = false
  private running = false
  private me: Actor | null = null
  private chasers: Actor[] = []
  private houses: HouseMarker[] = []
  private filled = 0
  private lives = 3
  private keys = new Set<string>()
  private lastT = 0
  private raf = 0
  private edgeRaf = 0
  private compassRaf = 0
  private destroyed = false

  public constructor(options: TinyPlayOptions) {
    this.options = options
    this.root = options.root
  }

  public async start(): Promise<void> {
    this.data = await loadBoroughData(this.options.boroughDataUrl)
    this.scale = this.data.S
    // Full dump is ~21k OSM strokes including alleys; keep main streets only.
    this.roads = simplifyPlayableRoads(expandRoads(this.data.roads), 10)
    this.mountDom()
    this.bindInput()
    await this.loadAt(this.options.startPostcode)
    this.newGame()
    this.loop(performance.now())
    this.edgeLoop()
    this.compassLoop()
  }

  public destroy(): void {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.edgeRaf)
    cancelAnimationFrame(this.compassRaf)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.root.innerHTML = ''
  }

  private mountDom(): void {
    this.root.innerHTML = `
      <div class="tiny-stage">
        <div class="tiny-map" id="tiny-map"></div>
        <div class="tiny-hud">
          <span class="tiny-hearts" id="tiny-hearts">♥♥♥</span>
          <div class="tiny-meter" title="Homes filled"><i id="tiny-meter-fill"></i></div>
          <span id="tiny-count">0 / ${TOTAL_HOMES}</span>
        </div>
        <div class="tiny-compass" id="tiny-compass" hidden>
          <span id="tiny-compass-arrow">➤</span>
          <span id="tiny-compass-text">Nearest empty home</span>
        </div>
        <div class="tiny-world" id="tiny-world"></div>
        <div class="tiny-toast" id="tiny-toast" hidden>Reporting... hold still</div>
        <div class="tiny-travel" id="tiny-travel" hidden>
          <p>Walking on...</p>
          <p id="tiny-travel-to"></p>
        </div>
        <canvas class="tiny-road-overlay" id="tiny-road-overlay"></canvas>
        <div class="tiny-credit">Map: tiny.london · Walkable maze: simplified OSM from /borough-data/islington.json · O toggles overlay</div>
      </div>
    `
    const map = this.root.querySelector('#tiny-map')
    this.world = this.root.querySelector('#tiny-world')
    this.overlay = this.root.querySelector('#tiny-road-overlay')
    if (!map || !this.world || !this.overlay) {
      throw new Error('TinyLondonPlay DOM failed')
    }
    this.iframe = document.createElement('iframe')
    this.iframe.title = 'tiny.london map'
    this.iframe.className = 'tiny-frame'
    map.append(this.iframe)
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()
    if (key === 'o') {
      event.preventDefault()
      this.showRoads = !this.showRoads
      this.redrawOverlay()
      return
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
      this.keys.add(key)
      event.preventDefault()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase())
  }

  private width(): number {
    return this.root.clientWidth || window.innerWidth
  }

  private height(): number {
    return this.root.clientHeight || window.innerHeight
  }

  private toScreen(x: number, y: number): [number, number] {
    if (!this.cam) {
      return [0, 0]
    }
    return [
      (x - this.cam[0]) * this.scale + this.width() / 2,
      (y - this.cam[1]) * this.scale + this.height() / 2,
    ]
  }

  private toWorld(x: number, y: number): [number, number] {
    if (!this.cam) {
      return [0, 0]
    }
    return [
      (x - this.width() / 2) / this.scale + this.cam[0],
      (y - this.height() / 2) / this.scale + this.cam[1],
    ]
  }

  private strokeRoads(
    context: CanvasRenderingContext2D,
    style: { color: string; widthScale: number; minWidth: number },
  ): void {
    if (!this.cam) {
      return
    }
    const w = this.width()
    const h = this.height()
    context.strokeStyle = style.color
    context.lineCap = 'round'
    context.lineJoin = 'round'
    const [ax, ay] = this.toWorld(-40, -40)
    const [bx, by] = this.toWorld(w + 40, h + 40)
    for (const road of this.roads) {
      if (road.x1 < ax || road.x0 > bx || road.y1 < ay || road.y0 > by) {
        continue
      }
      context.lineWidth = Math.max(style.minWidth, road.width * style.widthScale)
      context.beginPath()
      road.pts.forEach(([x, y], index) => {
        const [sx, sy] = this.toScreen(x, y)
        if (index === 0) {
          context.moveTo(sx, sy)
        } else {
          context.lineTo(sx, sy)
        }
      })
      context.stroke()
    }
  }

  private buildMask(): void {
    const w = this.width()
    const h = this.height()
    this.maskW = w
    this.maskH = h
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const context = canvas.getContext('2d')
    if (!context || !this.cam) {
      return
    }
    // Slightly fatter than source stroke so simplified streets stay grabby.
    this.strokeRoads(context, { color: '#fff', widthScale: 1.35, minWidth: 10 })
    this.mask = context.getImageData(0, 0, w, h).data
    this.redrawOverlay()
  }

  private redrawOverlay(): void {
    if (!this.overlay) {
      return
    }
    const w = this.width()
    const h = this.height()
    this.overlay.width = w
    this.overlay.height = h
    const context = this.overlay.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, w, h)
    if (!this.showRoads || !this.cam) {
      this.overlay.classList.add('hidden')
      return
    }
    this.overlay.classList.remove('hidden')
    this.strokeRoads(context, { color: 'rgba(72, 180, 220, 0.42)', widthScale: 1.2, minWidth: 8 })
    this.strokeRoads(context, { color: 'rgba(144, 224, 239, 0.55)', widthScale: 0.55, minWidth: 3 })
  }

  private onRoad(x: number, y: number): boolean {
    if (x < 4 || y < 64 || x > this.width() - 4 || y > this.height() - 4 || !this.cam) {
      return false
    }
    if (!this.mask || this.maskW !== this.width() || this.maskH !== this.height()) {
      this.buildMask()
    }
    if (!this.mask) {
      return false
    }
    const index = ((y | 0) * this.maskW + (x | 0)) * 4 + 3
    return this.mask[index]! > 0
  }

  private nearestRoad(x: number, y: number): [number, number] {
    for (let radius = 0; radius < 400; radius += 6) {
      for (let angle = 0; angle < 16; angle += 1) {
        const px = x + Math.cos((angle / 16) * Math.PI * 2) * radius
        const py = y + Math.sin((angle / 16) * Math.PI * 2) * radius
        if (this.onRoad(px, py)) {
          return [px, py]
        }
      }
    }
    return [x, y]
  }

  /** Snap a tiny.london world point to the closest OSM road sample. */
  private nearestRoadWorld(wx: number, wy: number): [number, number] {
    let best: [number, number] = [wx, wy]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const road of this.roads) {
      for (let index = 1; index < road.pts.length; index += 1) {
        const a = road.pts[index - 1]!
        const b = road.pts[index]!
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 24))
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps
          const x = a[0] + (b[0] - a[0]) * t
          const y = a[1] + (b[1] - a[1]) * t
          const distance = (x - wx) ** 2 + (y - wy) ** 2
          if (distance < bestDistance) {
            bestDistance = distance
            best = [x, y]
          }
        }
      }
    }
    return best
  }

  private spawnScreenFromWorld(wx: number, wy: number): [number, number] {
    const [roadX, roadY] = this.nearestRoadWorld(wx, wy)
    const [sx, sy] = this.toScreen(roadX, roadY)
    if (this.onRoad(sx, sy)) {
      return [sx, sy]
    }
    return this.nearestRoad(sx, sy)
  }

  private loadAt(postcode: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.iframe || !this.data) {
        resolve()
        return
      }
      this.loading = true
      this.running = false
      const travel = this.root.querySelector<HTMLElement>('#tiny-travel')
      const travelTo = this.root.querySelector<HTMLElement>('#tiny-travel-to')
      if (travel && travelTo) {
        travel.hidden = false
        travelTo.textContent = postcode
      }
      this.iframe.onload = () => {
        window.setTimeout(() => {
          this.cam = this.data!.postcodes[postcode] ?? this.cam
          this.camPc = postcode
          this.mask = null
          this.buildMask()
          this.loading = false
          if (travel) {
            travel.hidden = true
          }
          resolve()
        }, 1800)
      }
      this.iframe.src = `https://tiny.london/?q=${encodeURIComponent(postcode)}`
    })
  }

  private makeActor(sheet: string): Actor {
    const el = document.createElement('div')
    el.className = 'tiny-actor'
    el.style.backgroundImage = `url(/sprites/characters/${sheet}.png)`
    this.world?.append(el)
    return { el, x: 0, y: 0, dir: 0, frame: 0, t: 0, sheet }
  }

  private drawActor(actor: Actor, moving: boolean, dt: number): void {
    if (moving) {
      actor.t += dt
      if (actor.t >= 6) {
        actor.t = 0
      }
      if (actor.t < dt) {
        actor.frame = (actor.frame + 1) % 6
      }
    } else {
      actor.frame = 0
    }
    actor.el.style.left = `${actor.x}px`
    actor.el.style.top = `${actor.y}px`
    actor.el.style.backgroundPosition = `${-(actor.dir * 6 + actor.frame) * 64}px 0`
  }

  private step(actor: Actor, dx: number, dy: number, speed: number, dt: number): boolean {
    const nx = actor.x + dx * speed * dt
    const ny = actor.y + dy * speed * dt
    if (!this.onRoad(nx, ny)) {
      return false
    }
    actor.x = nx
    actor.y = ny
    if (dx || dy) {
      if (Math.abs(dx) > Math.abs(dy)) {
        actor.dir = dx > 0 ? 1 : 3
      } else {
        actor.dir = dy > 0 ? 0 : 2
      }
    }
    return true
  }

  private placeHouses(): HouseMarker[] {
    const projected = this.options.vacantHouses.map((house) => {
      const [wx, wy] = latLngToTinyWorld(house.lat, house.lng)
      return { house, wx, wy }
    })
    const picked: HouseMarker[] = []
    for (const item of projected) {
      if (picked.length >= TOTAL_HOMES) {
        break
      }
      if (picked.some((other) => Math.hypot(other.wx - item.wx, other.wy - item.wy) < 1400)) {
        continue
      }
      const [sx, sy] = this.toScreen(item.wx, item.wy)
      const el = document.createElement('div')
      el.className = 'tiny-house'
      this.world?.append(el)
      picked.push({
        wx: item.wx,
        wy: item.wy,
        x: sx,
        y: sy,
        hold: 0,
        done: false,
        el,
        id: item.house.id,
      })
    }
    // Fallback: use borough residential footprints if JSON houses didn't project near roads.
    if (picked.length < 8 && this.data) {
      const homes = this.data.homes.slice()
      for (let index = homes.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1))
        ;[homes[index], homes[swap]] = [homes[swap]!, homes[index]!]
      }
      for (const [wx, wy] of homes) {
        if (picked.length >= TOTAL_HOMES) {
          break
        }
        if (picked.some((other) => Math.hypot(other.wx - wx, other.wy - wy) < 1400)) {
          continue
        }
        const el = document.createElement('div')
        el.className = 'tiny-house'
        this.world?.append(el)
        const [sx, sy] = this.toScreen(wx, wy)
        picked.push({ wx, wy, x: sx, y: sy, hold: 0, done: false, el, id: `home-${picked.length}` })
      }
    }
    this.syncHouses(picked)
    return picked
  }

  private syncHouses(houses = this.houses): void {
    for (const house of houses) {
      ;[house.x, house.y] = this.toScreen(house.wx, house.wy)
      const visible = house.x > -60 && house.x < this.width() + 60 && house.y > -60 && house.y < this.height() + 60
      house.el.style.left = `${house.x}px`
      house.el.style.top = `${house.y}px`
      house.el.style.display = visible ? '' : 'none'
      house.el.classList.toggle('done', house.done)
      house.el.classList.toggle('near', !house.done && this.me !== null
        && Math.hypot(house.x - this.me.x, house.y - this.me.y) < 230)
    }
  }

  private updateHud(): void {
    const hearts = this.root.querySelector('#tiny-hearts')
    const count = this.root.querySelector('#tiny-count')
    const fill = this.root.querySelector<HTMLElement>('#tiny-meter-fill')
    if (hearts) {
      hearts.textContent = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives))
    }
    if (count) {
      count.textContent = `${this.filled} / ${TOTAL_HOMES}`
    }
    if (fill) {
      fill.style.width = `${(this.filled / TOTAL_HOMES) * 100}%`
    }
  }

  private newGame(): void {
    if (this.world) {
      this.world.innerHTML = ''
    }
    this.filled = 0
    this.lives = 3
    this.me = this.makeActor(this.options.player)
    this.chasers = CHASER_SPRITES.map((sheet) => this.makeActor(sheet))
    const spawn = this.spawnScreenFromWorld(EMIRATES_EAST_SPAWN[0], EMIRATES_EAST_SPAWN[1])
    this.me.x = spawn[0]
    this.me.y = spawn[1]
    this.drawActor(this.me, false, 1)
    this.chasers.forEach((chaser, index) => {
      const offset = (index + 1) * 180
      const [x, y] = this.spawnScreenFromWorld(
        EMIRATES_EAST_SPAWN[0] + offset,
        EMIRATES_EAST_SPAWN[1] + (index % 2 === 0 ? 120 : -120),
      )
      chaser.x = x
      chaser.y = y
      this.drawActor(chaser, false, 1)
    })
    this.houses = this.placeHouses()
    this.updateHud()
    this.running = true
  }

  private loop = (timestamp: number): void => {
    if (this.destroyed) {
      return
    }
    const dt = Math.min(2.5, (timestamp - (this.lastT || timestamp)) / 16.67)
    this.lastT = timestamp
    if (this.running && this.me && !this.loading) {
      let dx = 0
      let dy = 0
      if (this.keys.has('arrowleft') || this.keys.has('a')) {
        dx -= 1
      }
      if (this.keys.has('arrowright') || this.keys.has('d')) {
        dx += 1
      }
      if (this.keys.has('arrowup') || this.keys.has('w')) {
        dy -= 1
      }
      if (this.keys.has('arrowdown') || this.keys.has('s')) {
        dy += 1
      }
      const moving = dx !== 0 || dy !== 0
      if (moving) {
        const length = Math.hypot(dx, dy) || 1
        this.step(this.me, dx / length, dy / length, PLAYER_SPEED, dt)
      }
      this.drawActor(this.me, moving, dt)

      const toast = this.root.querySelector<HTMLElement>('#tiny-toast')
      let holding = false
      for (const house of this.houses) {
        if (house.done) {
          continue
        }
        const distance = Math.hypot(house.x - this.me.x, house.y - this.me.y)
        if (distance < NEAR && !moving) {
          house.hold += 16.67 * dt
          holding = true
          if (house.hold >= HOLD_MS) {
            house.done = true
            house.hold = 0
            this.filled += 1
            this.updateHud()
          }
        } else {
          house.hold = 0
        }
      }
      if (toast) {
        toast.hidden = !holding
      }
      this.syncHouses()

      for (const chaser of this.chasers) {
        const toX = this.me.x - chaser.x
        const toY = this.me.y - chaser.y
        const length = Math.hypot(toX, toY) || 1
        const moved = this.step(chaser, toX / length, toY / length, CHASER_SPEED, dt)
        if (!moved) {
          for (const [vx, vy] of DIRV) {
            if (this.step(chaser, vx, vy, CHASER_SPEED, dt)) {
              break
            }
          }
        }
        this.drawActor(chaser, true, dt)
        if (Math.hypot(chaser.x - this.me.x, chaser.y - this.me.y) < CATCH) {
          this.lives -= 1
          this.updateHud()
          if (this.lives <= 0) {
            this.running = false
          } else {
            const [sx, sy] = this.spawnScreenFromWorld(EMIRATES_EAST_SPAWN[0], EMIRATES_EAST_SPAWN[1])
            this.me.x = sx
            this.me.y = sy
          }
        }
      }
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  private edgeLoop = (): void => {
    if (this.destroyed) {
      return
    }
    this.edgeRaf = requestAnimationFrame(this.edgeLoop)
    if (!this.running || this.loading || !this.me || !this.data || !this.cam || !this.camPc) {
      return
    }
    let dx = 0
    let dy = 0
    if (this.me.x < EDGE) {
      dx = -1
    } else if (this.me.x > this.width() - EDGE) {
      dx = 1
    }
    if (this.me.y < 70 + EDGE) {
      dy = -1
    } else if (this.me.y > this.height() - EDGE) {
      dy = 1
    }
    if (!dx && !dy) {
      return
    }
    const [mx, my] = this.toWorld(this.me.x, this.me.y)
    const targetWx = mx + dx * this.width() * 0.42 / this.scale
    const targetWy = my + dy * this.height() * 0.42 / this.scale
    const nextPc = this.nearestPostcode(targetWx, targetWy, this.camPc)
    const target = this.data.postcodes[nextPc]
    if (!target) {
      return
    }
    if ((dx && Math.sign(target[0] - this.cam[0]) !== dx) || (dy && Math.sign(target[1] - this.cam[1]) !== dy)) {
      return
    }
    const worldMe: [number, number] = [mx, my]
    const worldChasers = this.chasers.map((chaser) => this.toWorld(chaser.x, chaser.y))
    void this.loadAt(nextPc).then(() => {
      if (!this.me) {
        return
      }
      let [sx, sy] = this.toScreen(...worldMe)
      ;[sx, sy] = this.nearestRoad(
        Math.min(Math.max(sx, EDGE + 12), this.width() - EDGE - 12),
        Math.min(Math.max(sy, 70 + EDGE + 12), this.height() - EDGE - 12),
      )
      this.me.x = sx
      this.me.y = sy
      this.chasers.forEach((chaser, index) => {
        let [cx, cy] = this.toScreen(...worldChasers[index]!)
        if (cx < 0 || cy < 70 || cx > this.width() || cy > this.height() || Math.hypot(cx - this.me!.x, cy - this.me!.y) < 250) {
          cx = this.me!.x < this.width() / 2 ? this.width() - 80 : 80
          cy = this.me!.y < this.height() / 2 ? this.height() - 80 : 140
        }
        ;[chaser.x, chaser.y] = this.nearestRoad(cx, cy)
        this.drawActor(chaser, false, 1)
      })
      this.drawActor(this.me, false, 1)
      this.syncHouses()
      this.running = true
    })
  }

  private nearestPostcode(wx: number, wy: number, exclude: string): string {
    let best = exclude
    let bestDistance = Number.POSITIVE_INFINITY
    for (const [postcode, point] of Object.entries(this.data?.postcodes ?? {})) {
      if (postcode === exclude) {
        continue
      }
      const distance = (point[0] - wx) ** 2 + (point[1] - wy) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = postcode
      }
    }
    return best
  }

  private compassLoop = (): void => {
    if (this.destroyed) {
      return
    }
    this.compassRaf = requestAnimationFrame(this.compassLoop)
    const el = this.root.querySelector<HTMLElement>('#tiny-compass')
    const arrow = this.root.querySelector<HTMLElement>('#tiny-compass-arrow')
    const text = this.root.querySelector<HTMLElement>('#tiny-compass-text')
    if (!el || !arrow || !text || !this.me || !this.cam) {
      return
    }
    const [mx, my] = this.toWorld(this.me.x, this.me.y)
    let best: HouseMarker | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const house of this.houses) {
      if (house.done) {
        continue
      }
      const distance = Math.hypot(house.wx - mx, house.wy - my)
      if (distance < bestDistance) {
        bestDistance = distance
        best = house
      }
    }
    if (!best) {
      el.hidden = true
      return
    }
    el.hidden = false
    const angle = Math.atan2(best.wy - my, best.wx - mx) * 180 / Math.PI
    arrow.style.transform = `rotate(${angle}deg)`
    const metres = Math.round(worldDeltaToMeters(bestDistance) / 10) * 10
    text.textContent = `Nearest empty home: about ${metres} m`
  }
}
