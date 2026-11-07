import {
  CHASER_LABELS,
  CHASER_SPRITES,
  PLAYER_SPRITES,
  type PlayerSpriteId,
} from '../render/spriteAtlas'

export interface BoroughChoice {
  name: string
  lng: number
  lat: number
  /** Prefer the bundled Newspeak House maze when true. */
  usePrecomputed?: boolean
  /** Play on embedded tiny.london with OSM street mask. */
  useTinyLondon?: boolean
  startPostcode?: string
  vacantHousesUrl?: string
  boroughDataUrl?: string
  hint: string
}

export interface IntroResult {
  player: PlayerSpriteId
  borough: BoroughChoice
}

/** Emirates Stadium, Hornsey Road / Holloway — in the London Borough of Islington. */
export const EMIRATES_STADIUM = {
  lng: -0.10833,
  lat: 51.555,
  postcode: 'N7 7AJ',
} as const

const BOROUGHS: BoroughChoice[] = [
  {
    name: 'Islington',
    lng: EMIRATES_STADIUM.lng,
    lat: EMIRATES_STADIUM.lat,
    usePrecomputed: true,
    hint: 'Emirates',
  },
  {
    name: 'Tower Hamlets',
    lng: -0.071273,
    lat: 51.525134,
    usePrecomputed: true,
    hint: 'Newspeak',
  },
  { name: 'Hackney', lng: -0.0553, lat: 51.5465, hint: 'Generate' },
  { name: 'Camden', lng: -0.1426, lat: 51.539, hint: 'Generate' },
  { name: 'Kensington and Chelsea', lng: -0.1925, lat: 51.5009, hint: 'Generate' },
  { name: 'Westminster', lng: -0.1248, lat: 51.4995, hint: 'Generate' },
]

function showScreen(root: HTMLElement, id: string): void {
  root.querySelectorAll<HTMLElement>('.intro-screen').forEach((screen) => {
    screen.classList.toggle('on', screen.id === id)
  })
}

export function mountIntroFlow(root: HTMLElement): Promise<IntroResult> {
  let player: PlayerSpriteId = 'player_1'
  let boroughIndex = 0

  root.innerHTML = `
    <section class="intro-screen on" id="intro-landing">
      <h1>Empty<br>Homes</h1>
      <p class="intro-ok">Thousands of London homes sit empty.<br>Find them. Fill them. Don't get caught.</p>
      <div class="intro-btns">
        <button type="button" data-go="intro-character">Play</button>
        <button type="button" class="ghost" data-go="intro-rules">How it works</button>
      </div>
      <p class="intro-muted">Made for the Newhouse hackathon</p>
      <div class="intro-sky" aria-hidden="true"></div>
    </section>

    <section class="intro-screen" id="intro-character">
      <h2>Choose your player</h2>
      <div class="intro-row" id="intro-players"></div>
      <div class="intro-btns"><button type="button" data-go="intro-story">Next</button></div>
    </section>

    <section class="intro-screen" id="intro-story">
      <div class="intro-panel">
        <h2>The story</h2>
        <p>Across your borough, homes have stood empty for six months or more. Nobody lives in them. Nobody is selling them.</p>
        <p>The council can step in, but only if someone reports them.</p>
        <p class="intro-ok">That someone is you.</p>
      </div>
      <div class="intro-btns"><button type="button" data-go="intro-rules">Next</button></div>
    </section>

    <section class="intro-screen" id="intro-rules">
      <div class="intro-panel">
        <h2>How to play</h2>
        <div class="intro-keys">
          <span class="intro-key">Arrows / WASD</span><span>Run the streets</span>
          <span class="intro-key">Stand still 1s</span><span>Report the empty home next to you</span>
          <span class="intro-key">O</span><span>Toggle walkable street overlay</span>
        </div>
        <p><span class="intro-dot vacant"></span>Purple = empty. It blinks when you get close.</p>
        <p><span class="intro-dot filled"></span>Green = reported and filled.</p>
        <p>Fill every empty home to clear the borough. You have 3 lives.</p>
        <h2>Who's chasing you</h2>
        <div class="intro-chasers" id="intro-chasers"></div>
      </div>
      <div class="intro-btns"><button type="button" data-go="intro-borough">Got it</button></div>
    </section>

    <section class="intro-screen" id="intro-borough">
      <h2>Pick a borough</h2>
      <div class="intro-boroughs" id="intro-boroughs"></div>
      <p class="intro-muted">Islington plays on tiny.london around Emirates Stadium. Tower Hamlets opens the Newspeak House maze.</p>
      <div class="intro-btns"><button type="button" id="intro-start">Start</button></div>
    </section>
  `

  const playersRoot = root.querySelector('#intro-players')
  const chasersRoot = root.querySelector('#intro-chasers')
  const boroughsRoot = root.querySelector('#intro-boroughs')
  if (!playersRoot || !chasersRoot || !boroughsRoot) {
    throw new Error('Intro markup failed to mount')
  }

  PLAYER_SPRITES.forEach((id, index) => {
    const pick = document.createElement('button')
    pick.type = 'button'
    pick.className = 'intro-pick'
    pick.setAttribute('aria-pressed', id === player ? 'true' : 'false')
    pick.innerHTML = `
      <div class="intro-sprite" style="background-image:url(/sprites/characters/${id}.png)"></div>
      <span>Player ${index + 1}</span>
    `
    pick.addEventListener('click', () => {
      player = id
      playersRoot.querySelectorAll('.intro-pick').forEach((node) => {
        node.setAttribute('aria-pressed', node === pick ? 'true' : 'false')
      })
    })
    playersRoot.append(pick)
  })

  CHASER_SPRITES.forEach((id, index) => {
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="intro-sprite sm" style="background-image:url(/sprites/characters/${id}.png)"></div>
      <span>${CHASER_LABELS[index]}</span>
    `
    chasersRoot.append(wrap)
  })

  BOROUGHS.forEach((borough, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-pressed', index === boroughIndex ? 'true' : 'false')
    button.innerHTML = `<span>${borough.name}</span><span>${borough.hint}</span>`
    button.addEventListener('click', () => {
      boroughIndex = index
      boroughsRoot.querySelectorAll('button').forEach((node) => {
        node.setAttribute('aria-pressed', node === button ? 'true' : 'false')
      })
    })
    boroughsRoot.append(button)
  })

  return new Promise((resolve) => {
    root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-go], #intro-start')
      if (!target || !root.contains(target)) {
        return
      }
      if (target.id === 'intro-start') {
        resolve({ player, borough: BOROUGHS[boroughIndex] ?? BOROUGHS[0] })
        return
      }
      const next = target.dataset.go
      if (next) {
        showScreen(root, next)
      }
    })
  })
}
