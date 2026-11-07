import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { SynthAudio } from './audio/synthAudio'
import { fetchRoadData, loadAddressPresets, searchPlaces } from './data/overpass'
import { attachVacantHouses, defaultBoroughId, loadBoroughMaze, loadBoroughVacantHouses } from './data/boroughData'
import { loadVacantHouses, selectVacantHousesForPlay } from './data/vacantHouses'
import { GameEngine } from './game/gameEngine'
import { generatePlayableMap } from './generator/generatePlayableMap'
import { loadLocale, localeOptions, modeLabel, saveLocale, translate, type Locale } from './i18n'
import { MapController } from './map/mapController'
import { CanvasRenderer } from './render/canvasRenderer'
import { tryShowEndGameCta } from './ui/endGameCta'
import { mountIntroFlow, type BoroughChoice } from './ui/introFlow'
import type { AddressPreset, Direction, PlayableMap, VacantProperty } from './types'

const RECOMMENDED_ZOOM_MIN = 17
const RECOMMENDED_ZOOM_MAX = 18
const RECOMMENDED_ZOOM_RANGE = '17-18'
const DEFAULT_SPEED = 1.5

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found')
}

app.innerHTML = `
  <div id="intro-root"></div>
  <div class="shell">
    <main class="stage">
      <div id="map"></div>
      <div class="overlay">
        <canvas id="game-canvas"></canvas>
        <div id="loading-indicator" class="loading-indicator hidden">
          <div class="loading-spinner" aria-hidden="true"></div>
          <div id="loading-text"></div>
        </div>
        <div id="message" class="message hidden"></div>
      </div>
    </main>

    <section id="start-screen" class="start-screen" aria-label="Start screen">
      <div class="start-screen-frame">
        <div class="start-screen-scroll">
          <div class="start-screen-inner">
            <header class="start-hero">
              <p class="start-kicker" id="start-kicker"></p>
              <p class="start-brand" id="start-brand"></p>
              <h1 class="start-headline" id="start-headline"></h1>
              <p class="start-lede" id="start-lede"></p>
              <div class="start-legend start-legend-hero" aria-hidden="true">
                <span class="start-chip"><span class="start-dot is-vacant"></span><span id="start-chip-vacant"></span></span>
                <span class="start-chip"><span class="start-dot is-reported"></span><span id="start-chip-reported"></span></span>
                <span class="start-chip"><span class="start-dot is-ghost"></span><span id="start-chip-ghost"></span></span>
              </div>
            </header>

            <div class="start-sections">
              <article class="start-section">
                <h2 id="start-problem-title"></h2>
                <p id="start-problem-body"></p>
                <p id="start-problem-why"></p>
              </article>

              <article class="start-section">
                <h2 id="start-idea-title"></h2>
                <p id="start-idea-body"></p>
                <ul id="start-idea-list"></ul>
              </article>

              <article class="start-section">
                <h2 id="start-play-title"></h2>
                <ul id="start-play-list"></ul>
              </article>

              <article class="start-section">
                <h2 id="start-context-title"></h2>
                <div class="start-meta">
                  <div class="start-meta-item">
                    <span id="start-meta-event-label"></span>
                    <strong id="start-meta-event"></strong>
                  </div>
                  <div class="start-meta-item">
                    <span id="start-meta-brief-label"></span>
                    <strong id="start-meta-brief"></strong>
                  </div>
                  <div class="start-meta-item">
                    <span id="start-meta-place-label"></span>
                    <strong id="start-meta-place"></strong>
                  </div>
                  <div class="start-meta-item">
                    <span id="start-meta-data-label"></span>
                    <strong id="start-meta-data"></strong>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>

        <footer class="start-dock">
          <div class="start-dock-inner">
            <p class="start-cta-note" id="start-cta-note"></p>
            <button id="start-button" class="start-cta" type="button"></button>
          </div>
        </footer>
      </div>
    </section>

    <div class="hud hidden" id="game-hud">
      <div class="hud-left">
        <div class="hud-brand">
          <p class="hud-eyebrow" id="eyebrow"></p>
          <p class="hud-title" id="title"></p>
        </div>
        <div class="hud-stats">
          <div class="hud-stat">
            <span id="vacant-label"></span>
            <strong id="vacant-value">0 / 0</strong>
          </div>
          <div class="hud-stat">
            <span id="lives-label"></span>
            <div id="lives-value" class="life-icons"></div>
          </div>
        </div>
      </div>
      <div class="hud-right">
        <button id="shortcuts-button" class="hud-button" type="button"></button>
      </div>
    </div>

    <aside id="shortcuts-panel" class="shortcuts-panel hidden" aria-label="Shortcuts">
      <h2 id="shortcuts-heading"></h2>
      <ul class="shortcuts-list">
        <li><span id="shortcut-move-label"></span><kbd>Arrows / WASD</kbd></li>
        <li><span id="shortcut-play-label"></span><kbd>P</kbd></li>
        <li><span id="shortcut-pause-label"></span><kbd>Space</kbd></li>
        <li><span id="shortcut-restart-label"></span><kbd>R</kbd></li>
        <li><span id="shortcut-generate-label"></span><kbd>G</kbd></li>
        <li><span id="shortcut-speed-label"></span><kbd>[ / ]</kbd></li>
        <li><span id="shortcut-menu-label"></span><kbd>?</kbd></li>
      </ul>

      <div class="shortcuts-controls">
        <label>
          <span id="locale-label"></span>
          <select id="locale-select"></select>
        </label>
        <label id="preset-control" class="hidden">
          <span id="preset-label"></span>
          <select id="preset-select"></select>
        </label>
        <label>
          <span id="search-label"></span>
          <div class="search-row">
            <input id="search-input" type="text" />
            <button id="search-button" type="button"></button>
          </div>
        </label>
        <div id="search-results" class="search-results"></div>
        <div class="button-row">
          <button id="generate-button" type="button" class="primary"></button>
          <button id="play-button" type="button"></button>
          <button id="pause-button" type="button"></button>
          <button id="restart-button" type="button"></button>
        </div>
        <label class="inline-control">
          <span id="speed-label"></span>
          <input id="speed-input" type="range" min="0.8" max="2.4" step="0.1" value="${DEFAULT_SPEED}" />
          <strong id="speed-value">${DEFAULT_SPEED.toFixed(1)}x</strong>
        </label>
        <p id="tip-controls" class="intro"></p>
      </div>
    </aside>
  </div>
`

const eyebrow = requireElement<HTMLElement>('#eyebrow')
const title = requireElement<HTMLElement>('#title')
const gameHud = requireElement<HTMLElement>('#game-hud')
const startScreen = requireElement<HTMLElement>('#start-screen')
const startKicker = requireElement<HTMLElement>('#start-kicker')
const startBrand = requireElement<HTMLElement>('#start-brand')
const startHeadline = requireElement<HTMLElement>('#start-headline')
const startLede = requireElement<HTMLElement>('#start-lede')
const startButton = requireElement<HTMLButtonElement>('#start-button')
const startCtaNote = requireElement<HTMLElement>('#start-cta-note')
const startProblemTitle = requireElement<HTMLElement>('#start-problem-title')
const startProblemBody = requireElement<HTMLElement>('#start-problem-body')
const startProblemWhy = requireElement<HTMLElement>('#start-problem-why')
const startIdeaTitle = requireElement<HTMLElement>('#start-idea-title')
const startIdeaBody = requireElement<HTMLElement>('#start-idea-body')
const startIdeaList = requireElement<HTMLUListElement>('#start-idea-list')
const startPlayTitle = requireElement<HTMLElement>('#start-play-title')
const startPlayList = requireElement<HTMLUListElement>('#start-play-list')
const startChipVacant = requireElement<HTMLElement>('#start-chip-vacant')
const startChipReported = requireElement<HTMLElement>('#start-chip-reported')
const startChipGhost = requireElement<HTMLElement>('#start-chip-ghost')
const startContextTitle = requireElement<HTMLElement>('#start-context-title')
const startMetaEventLabel = requireElement<HTMLElement>('#start-meta-event-label')
const startMetaEvent = requireElement<HTMLElement>('#start-meta-event')
const startMetaBriefLabel = requireElement<HTMLElement>('#start-meta-brief-label')
const startMetaBrief = requireElement<HTMLElement>('#start-meta-brief')
const startMetaPlaceLabel = requireElement<HTMLElement>('#start-meta-place-label')
const startMetaPlace = requireElement<HTMLElement>('#start-meta-place')
const startMetaDataLabel = requireElement<HTMLElement>('#start-meta-data-label')
const startMetaData = requireElement<HTMLElement>('#start-meta-data')
const localeSelect = requireElement<HTMLSelectElement>('#locale-select')
const localeLabel = requireElement<HTMLElement>('#locale-label')
const presetControl = requireElement<HTMLElement>('#preset-control')
const presetLabel = requireElement<HTMLElement>('#preset-label')
const presetSelect = requireElement<HTMLSelectElement>('#preset-select')
const searchInput = requireElement<HTMLInputElement>('#search-input')
const searchLabel = requireElement<HTMLElement>('#search-label')
const searchButton = requireElement<HTMLButtonElement>('#search-button')
const searchResults = requireElement<HTMLDivElement>('#search-results')
const generateButton = requireElement<HTMLButtonElement>('#generate-button')
const playButton = requireElement<HTMLButtonElement>('#play-button')
const pauseButton = requireElement<HTMLButtonElement>('#pause-button')
const restartButton = requireElement<HTMLButtonElement>('#restart-button')
const speedInput = requireElement<HTMLInputElement>('#speed-input')
const speedLabel = requireElement<HTMLElement>('#speed-label')
const speedValue = requireElement<HTMLElement>('#speed-value')
const vacantValue = requireElement<HTMLElement>('#vacant-value')
const vacantLabelNode = requireElement<HTMLElement>('#vacant-label')
const livesValue = requireElement<HTMLElement>('#lives-value')
const livesLabelNode = requireElement<HTMLElement>('#lives-label')
const tipControls = requireElement<HTMLElement>('#tip-controls')
const loadingIndicator = requireElement<HTMLDivElement>('#loading-indicator')
const loadingText = requireElement<HTMLDivElement>('#loading-text')
const message = requireElement<HTMLDivElement>('#message')
const introRoot = requireElement<HTMLDivElement>('#intro-root')
const mapRoot = requireElement<HTMLDivElement>('#map')
const canvas = requireElement<HTMLCanvasElement>('#game-canvas')
const shortcutsButton = requireElement<HTMLButtonElement>('#shortcuts-button')
const shortcutsPanel = requireElement<HTMLElement>('#shortcuts-panel')
const shortcutsHeading = requireElement<HTMLElement>('#shortcuts-heading')
const shortcutMoveLabel = requireElement<HTMLElement>('#shortcut-move-label')
const shortcutPlayLabel = requireElement<HTMLElement>('#shortcut-play-label')
const shortcutPauseLabel = requireElement<HTMLElement>('#shortcut-pause-label')
const shortcutRestartLabel = requireElement<HTMLElement>('#shortcut-restart-label')
const shortcutGenerateLabel = requireElement<HTMLElement>('#shortcut-generate-label')
const shortcutSpeedLabel = requireElement<HTMLElement>('#shortcut-speed-label')
const shortcutMenuLabel = requireElement<HTMLElement>('#shortcut-menu-label')

const mapController = new MapController(mapRoot)
const renderer = new CanvasRenderer(canvas)
const audio = new SynthAudio()

let playableMap: PlayableMap | null = null
let engine: GameEngine | null = null
let animationFrame = 0
let currentLocale: Locale = loadLocale()
let currentMessage: { key: string; params?: Record<string, string | number> } = { key: 'message.initial' }
let addressPresets: AddressPreset[] = []
let vacantCatalog: VacantProperty[] = []
let movedMessageTimer: number | null = null
let isGenerating = false
let startScreenOpen = false
let defaultMazeLabel = 'Islington'
startScreen.classList.add('hidden')

function fillList(node: HTMLUListElement, items: string[]): void {
  node.innerHTML = items.map((item) => `<li>${item}</li>`).join('')
}

function renderStartScreenCopy(): void {
  setText(startKicker, t('start.kicker'))
  setText(startBrand, t('start.brand'))
  setText(startHeadline, t('start.headline'))
  setText(startLede, t('start.lede'))
  setText(startButton, t('start.cta'))
  setText(startCtaNote, t('start.ctaNote'))
  setText(startProblemTitle, t('start.problem.title'))
  setText(startProblemBody, t('start.problem.body'))
  setText(startProblemWhy, t('start.problem.why'))
  setText(startIdeaTitle, t('start.idea.title'))
  setText(startIdeaBody, t('start.idea.body'))
  fillList(startIdeaList, [
    t('start.idea.1'),
    t('start.idea.2'),
    t('start.idea.3'),
    t('start.idea.4'),
  ])
  setText(startPlayTitle, t('start.play.title'))
  fillList(startPlayList, [
    t('start.play.1'),
    t('start.play.2'),
    t('start.play.3'),
    t('start.play.4'),
    t('start.play.5'),
  ])
  setText(startChipVacant, t('start.chip.vacant'))
  setText(startChipReported, t('start.chip.reported'))
  setText(startChipGhost, t('start.chip.ghost'))
  setText(startContextTitle, t('start.context.title'))
  setText(startMetaEventLabel, t('start.meta.eventLabel'))
  setText(startMetaEvent, t('start.meta.event'))
  setText(startMetaBriefLabel, t('start.meta.briefLabel'))
  setText(startMetaBrief, t('start.meta.brief'))
  setText(startMetaPlaceLabel, t('start.meta.placeLabel'))
  setText(startMetaPlace, t('start.meta.place'))
  setText(startMetaDataLabel, t('start.meta.dataLabel'))
  setText(startMetaData, t('start.meta.data'))
}

function dismissStartScreen(): void {
  if (!startScreenOpen) {
    return
  }
  startScreenOpen = false
  document.body.classList.remove('is-start-open')
  startScreen.classList.add('hidden')
  gameHud.classList.remove('hidden')
  message.classList.remove('hidden')
  if (engine) {
    setMessageKey('message.precomputedReady', { label: defaultMazeLabel })
  }
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text
  }
}

function setHtml(node: HTMLElement, html: string): void {
  if (node.innerHTML !== html) {
    node.innerHTML = html
  }
}

function t(key: string, params?: Record<string, string | number>): string {
  return translate(currentLocale, key, params)
}

function setMessageKey(key: string, params?: Record<string, string | number>): void {
  currentMessage = { key, params }
  setText(message, t(key, params))
}

function isShortcutsOpen(): boolean {
  return !shortcutsPanel.classList.contains('hidden')
}

function setShortcutsOpen(open: boolean): void {
  shortcutsPanel.classList.toggle('hidden', !open)
  shortcutsButton.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function toggleShortcuts(): void {
  setShortcutsOpen(!isShortcutsOpen())
}

function setGenerating(active: boolean): void {
  isGenerating = active
  loadingIndicator.classList.toggle('hidden', !active)
  generateButton.disabled = active
  loadingText.textContent = t('loading.overlay')
  updateGenerateButtonHint()
}

function setMovedMessage(label: string, zoom: number): void {
  setMessageKey('message.moved', {
    label,
    zoom: zoom.toFixed(1),
    range: RECOMMENDED_ZOOM_RANGE,
  })
}

function setViewportGuidanceMessage(): void {
  const zoom = mapController.getViewport().zoom
  const params = {
    zoom: zoom.toFixed(1),
    range: RECOMMENDED_ZOOM_RANGE,
  }

  if (zoom < RECOMMENDED_ZOOM_MIN) {
    setMessageKey('message.viewportWide', params)
    return
  }

  if (zoom > RECOMMENDED_ZOOM_MAX) {
    setMessageKey('message.viewportTight', params)
    return
  }

  setMessageKey('message.viewportGood', params)
}

function refreshViewportMessage(): void {
  if (currentMessage.key === 'message.moved' && typeof currentMessage.params?.label === 'string') {
    setMovedMessage(currentMessage.params.label, mapController.getViewport().zoom)
    return
  }

  if (currentMessage.key === 'message.initial' || currentMessage.key.startsWith('message.viewport')) {
    setViewportGuidanceMessage()
  }
}

function scheduleMovedMessage(label: string): void {
  if (movedMessageTimer !== null) {
    window.clearTimeout(movedMessageTimer)
  }
  movedMessageTimer = window.setTimeout(() => {
    setMovedMessage(label, mapController.getViewport().zoom)
    movedMessageTimer = null
  }, 650)
}

function updateGenerateButtonHint(): void {
  if (isGenerating) {
    setText(generateButton, `⏳ ${t('buttons.generate')}`)
    generateButton.title = t('message.loading')
    return
  }

  const zoom = mapController.getViewport().zoom
  const zoomText = zoom.toFixed(1)

  if (zoom < RECOMMENDED_ZOOM_MIN) {
    setText(generateButton, `⚠️ ${t('buttons.generate')}`)
    generateButton.title = t('buttons.generateWideHint', { zoom: zoomText })
    return
  }

  if (zoom > RECOMMENDED_ZOOM_MAX) {
    setText(generateButton, `🔎 ${t('buttons.generate')}`)
    generateButton.title = t('buttons.generateTightHint', { zoom: zoomText })
    return
  }

  setText(generateButton, t('buttons.generate'))
  generateButton.title = t('buttons.generateGoodHint', { zoom: zoomText })
}

function renderLocale(): void {
  document.documentElement.lang = currentLocale
  renderStartScreenCopy()
  localeSelect.innerHTML = ''
  for (const option of localeOptions) {
    const element = document.createElement('option')
    element.value = option.value
    element.textContent = option.label
    localeSelect.append(element)
  }
  localeSelect.value = currentLocale

  setText(eyebrow, t('app.eyebrow'))
  setText(title, t('app.title'))
  setText(localeLabel, t('controls.language'))
  localeSelect.title = t('controls.language')
  setText(presetLabel, t('controls.presets'))
  setText(searchLabel, t('controls.search'))
  searchInput.placeholder = t('search.placeholder')
  setText(searchButton, t('buttons.search'))
  setText(playButton, t('buttons.play'))
  setText(pauseButton, t('buttons.pause'))
  setText(restartButton, t('buttons.restart'))
  setText(speedLabel, t('controls.speed'))
  setText(vacantLabelNode, t('stats.vacant'))
  setText(livesLabelNode, t('stats.lives'))
  setText(tipControls, t('tips.controls'))
  setText(shortcutsButton, t('buttons.shortcuts'))
  setText(shortcutsHeading, t('shortcuts.heading'))
  setText(shortcutMoveLabel, t('shortcuts.move'))
  setText(shortcutPlayLabel, t('shortcuts.play'))
  setText(shortcutPauseLabel, t('shortcuts.pause'))
  setText(shortcutRestartLabel, t('shortcuts.restart'))
  setText(shortcutGenerateLabel, t('shortcuts.generate'))
  setText(shortcutSpeedLabel, t('shortcuts.speed'))
  setText(shortcutMenuLabel, t('shortcuts.menu'))
  updateGenerateButtonHint()
  if (currentMessage.key === 'message.initial' || currentMessage.key.startsWith('message.viewport') || currentMessage.key === 'message.moved') {
    refreshViewportMessage()
  } else {
    setText(message, t(currentMessage.key, currentMessage.params))
  }
  renderPresetOptions()
  syncHud()
}

function renderPresetOptions(): void {
  if (addressPresets.length === 0) {
    presetControl.classList.add('hidden')
    return
  }

  presetControl.classList.remove('hidden')
  presetSelect.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = t('presets.placeholder')
  presetSelect.append(placeholder)

  addressPresets.forEach((preset, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = preset.label
    presetSelect.append(option)
  })
  presetSelect.value = ''
}

function applySpeed(): void {
  const value = Number(speedInput.value)
  speedValue.textContent = `${value.toFixed(1)}x`
  engine?.setSpeedMultiplier(value)
}

function nudgeSpeed(delta: number): void {
  const next = Math.min(2.4, Math.max(0.8, Number(speedInput.value) + delta))
  speedInput.value = next.toFixed(1)
  applySpeed()
}

function renderLives(count: number): void {
  const icons = Array.from({ length: Math.max(0, count) }, (_, index) =>
    `<span class="life-icon" aria-hidden="true" style="animation-delay:${index * 0.06}s"></span>`)
  setHtml(livesValue, icons.join(''))
}

function formatVacantCount(reported: number, total: number): string {
  return `${reported} / ${total}`
}

function syncHud(): void {
  if (!engine) {
    const previewTotal = playableMap?.vacantHouses.length ?? 0
    setText(vacantValue, formatVacantCount(0, previewTotal))
    renderLives(3)
    return
  }

  const totalVacant = engine.state.remainingVacant + engine.state.reportedVacant
  setText(vacantValue, formatVacantCount(engine.state.reportedVacant, totalVacant))
  renderLives(engine.state.lives)

  if (tryShowEndGameCta(engine.state.reportedVacant, () => {
    if (engine && engine.state.status === 'paused' && engine.state.remainingVacant > 0) {
      void play()
    }
  })) {
    pause()
  }

  if (engine.state.status === 'win') {
    setMessageKey('message.win')
  } else if (engine.state.status === 'gameover') {
    setMessageKey('message.gameover')
  } else if (engine.state.status === 'dying') {
    setMessageKey('message.dying')
  } else if (engine.state.status === 'paused') {
    setMessageKey('message.paused')
  } else if (engine.state.status === 'preview') {
    setMessageKey('message.preview')
  } else {
    setMessageKey('message.playing')
  }
}

function stopLoop(): void {
  cancelAnimationFrame(animationFrame)
}

function drawCurrentFrame(): void {
  if (!engine && playableMap) {
    renderer.renderPreview(playableMap, (point) => mapController.project(point))
    return
  }
  if (engine) {
    renderer.renderGame(engine, (point) => mapController.project(point))
  }
}

function processEngineEvents(): void {
  if (!engine) {
    return
  }
  for (const event of engine.drainEvents()) {
    audio.playEvent(event)
    if (event.type === 'gameover' || event.type === 'win' || event.type === 'lose-life') {
      audio.setAmbience(false)
    }
  }
}

function syncCameraFollow(): void {
  if (!engine) {
    return
  }
  if (engine.state.status !== 'playing' && engine.state.status !== 'dying') {
    return
  }
  mapController.follow(engine.state.pacman.position)
}

function loop(timestamp: number): void {
  if (!engine) {
    return
  }
  engine.tick(timestamp)
  processEngineEvents()
  syncCameraFollow()
  drawCurrentFrame()
  syncHud()
  animationFrame = requestAnimationFrame(loop)
}

function startLoop(): void {
  stopLoop()
  animationFrame = requestAnimationFrame(loop)
}

async function handleSearch(): Promise<void> {
  const query = searchInput.value.trim()
  if (!query) {
    setMessageKey('message.noQuery')
    return
  }

  setMessageKey('message.searching')
  searchResults.innerHTML = ''
  try {
    const results = await searchPlaces(query)
    if (results.length === 0) {
      setMessageKey('message.noResults')
      return
    }

    for (const result of results) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'result'
      button.textContent = result.label
      button.addEventListener('click', () => {
        mapController.flyTo(result.lng, result.lat)
        scheduleMovedMessage(result.label)
      })
      searchResults.append(button)
    }
  } catch {
    setMessageKey('message.searchFailed')
  }
}

async function handlePresetSelect(): Promise<void> {
  const selected = presetSelect.value
  if (!selected) {
    return
  }
  const preset = addressPresets[Number(selected)]
  if (!preset) {
    return
  }

  setMessageKey('message.loadingPreset', { label: preset.label })
  if (typeof preset.lat === 'number' && typeof preset.lng === 'number') {
    mapController.flyTo(preset.lng, preset.lat)
    scheduleMovedMessage(preset.label)
    presetSelect.value = ''
    return
  }

  if (!preset.query) {
    presetSelect.value = ''
    return
  }

  try {
    const results = await searchPlaces(preset.query)
    const target = results[0]
    if (!target) {
      setMessageKey('message.noResults')
      return
    }
    mapController.flyTo(target.lng, target.lat)
    scheduleMovedMessage(preset.label)
  } catch {
    setMessageKey('message.searchFailed')
  } finally {
    presetSelect.value = ''
  }
}

function applyPlayableMap(map: PlayableMap): void {
  playableMap = map
  mapController.fitToPoints([
    ...map.nodes,
    ...map.vacantHouses,
  ])
  engine = new GameEngine(map)
  applySpeed()
  drawCurrentFrame()
  syncHud()
}

function boroughIdForChoice(borough: BoroughChoice): string {
  if (borough.name === 'Tower Hamlets') {
    return 'newspeak-house'
  }
  return defaultBoroughId()
}

async function loadBoroughPlay(boroughId: string): Promise<boolean> {
  setMessageKey('message.loadingPrecomputed')
  setGenerating(true)
  stopLoop()
  audio.setAmbience(false)
  try {
    const precomputed = await loadBoroughMaze(boroughId)
    if (!precomputed) {
      return false
    }
    defaultMazeLabel = precomputed.label
    const houses = await loadBoroughVacantHouses(boroughId === 'newspeak-house' ? 'tower-hamlets' : boroughId)
    vacantCatalog = houses.length > 0 ? houses : vacantCatalog
    const map = attachVacantHouses(precomputed.map, vacantCatalog)
    applyPlayableMap(map)
    if (!startScreenOpen) {
      setMessageKey('message.precomputedReady', { label: precomputed.label })
    }
    return true
  } catch {
    return false
  } finally {
    setGenerating(false)
  }
}

async function openStartScreenAfterIntro(borough: BoroughChoice): Promise<void> {
  mapController.flyTo(borough.lng, borough.lat, 17)
  if (borough.usePrecomputed) {
    const loaded = await loadBoroughPlay(boroughIdForChoice(borough))
    if (!loaded) {
      setViewportGuidanceMessage()
    }
  } else {
    await generateMaze()
  }
  startScreenOpen = true
  document.body.classList.add('is-start-open')
  startScreen.classList.remove('hidden')
  renderStartScreenCopy()
  syncHud()
}

async function generateMaze(): Promise<void> {
  setMessageKey('message.loading')
  setGenerating(true)
  stopLoop()
  audio.setAmbience(false)
  try {
    const viewport = mapController.getViewport()
    const roadData = await fetchRoadData(viewport.bounds)
    const vacantHouses = selectVacantHousesForPlay(vacantCatalog, viewport.bounds, viewport.center)
    const map = generatePlayableMap(viewport, roadData, { vacantHouses })
    applyPlayableMap(map)
    if (viewport.zoom < RECOMMENDED_ZOOM_MIN) {
      setMessageKey('message.generatedWide', {
        mode: modeLabel(currentLocale, map.sourceMode).toLowerCase(),
        zoom: viewport.zoom.toFixed(1),
      })
    } else {
      setMessageKey('message.generated', { mode: modeLabel(currentLocale, map.sourceMode).toLowerCase() })
    }
  } catch {
    setMessageKey('message.generateFailed')
  } finally {
    setGenerating(false)
  }
}

async function play(): Promise<void> {
  if (!engine) {
    setMessageKey('message.generateFirst')
    return
  }
  await audio.unlock()
  engine.start()
  mapController.setInteractive(false)
  mapController.follow(engine.state.pacman.position)
  audio.setAmbience(true)
  startLoop()
  processEngineEvents()
  syncHud()
}

function pause(): void {
  if (!engine) {
    return
  }
  engine.pause()
  mapController.setInteractive(engine.state.status !== 'playing')
  audio.setAmbience(engine.state.status === 'playing')
  syncHud()
}

function restart(): void {
  if (!engine) {
    return
  }
  engine.restart()
  mapController.setInteractive(true)
  audio.setAmbience(false)
  drawCurrentFrame()
  syncHud()
}

async function handleDirection(direction: Direction): Promise<void> {
  if (!engine) {
    return
  }
  await audio.unlock()
  engine.setDirection(direction)
  if (engine.state.status === 'playing') {
    mapController.setInteractive(false)
    audio.setAmbience(true)
  }
  startLoop()
  processEngineEvents()
  syncHud()
}

searchButton.addEventListener('click', () => {
  void handleSearch()
})

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    void handleSearch()
  }
})

generateButton.addEventListener('click', () => {
  void generateMaze()
})
playButton.addEventListener('click', () => {
  void play()
})
pauseButton.addEventListener('click', pause)
restartButton.addEventListener('click', restart)
startButton.addEventListener('click', () => {
  dismissStartScreen()
  void play()
})
speedInput.addEventListener('input', applySpeed)
presetSelect.addEventListener('change', () => {
  void handlePresetSelect()
})
localeSelect.addEventListener('change', () => {
  currentLocale = localeSelect.value === 'zh-TW' ? 'zh-TW' : 'en'
  saveLocale(currentLocale)
  renderLocale()
})
shortcutsButton.addEventListener('click', toggleShortcuts)

window.addEventListener('keydown', (event) => {
  const target = event.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable) {
      return
    }
  }

  if (startScreenOpen) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      dismissStartScreen()
      void play()
    }
    return
  }

  if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
    event.preventDefault()
    toggleShortcuts()
    return
  }

  if (event.key === 'Escape') {
    if (isShortcutsOpen()) {
      event.preventDefault()
      setShortcutsOpen(false)
    }
    return
  }

  if (event.key === 'p' || event.key === 'P') {
    event.preventDefault()
    void play()
    return
  }

  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault()
    pause()
    return
  }

  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    restart()
    return
  }

  if (event.key === 'g' || event.key === 'G') {
    event.preventDefault()
    void generateMaze()
    return
  }

  if (event.key === '[') {
    event.preventDefault()
    nudgeSpeed(-0.1)
    return
  }

  if (event.key === ']') {
    event.preventDefault()
    nudgeSpeed(0.1)
    return
  }

  const mapKey: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    W: 'up',
    s: 'down',
    S: 'down',
    a: 'left',
    A: 'left',
    d: 'right',
    D: 'right',
  }

  const direction = mapKey[event.key]
  if (!direction) {
    return
  }

  event.preventDefault()
  void handleDirection(direction)
})

window.addEventListener('resize', () => {
  drawCurrentFrame()
})

await mapController.ready()
addressPresets = await loadAddressPresets()
vacantCatalog = await loadVacantHouses()
await renderer.loadSprites().catch(() => undefined)
applySpeed()
renderLocale()
renderStartScreenCopy()
mapController.onViewChange(() => {
  updateGenerateButtonHint()
  if (!engine) {
    refreshViewportMessage()
  }
  drawCurrentFrame()
})

const introChoice = await mountIntroFlow(introRoot)
renderer.setPlayerSprite(introChoice.player)
introRoot.classList.add('hidden')
await openStartScreenAfterIntro(introChoice.borough)
