/** Demo threshold; swap to total vacant houses for full win flow. */
export const END_GAME_CTA_REPORTS_DEMO = 15

const END_GAME_CTA_URL = `${import.meta.env.BASE_URL}end-game-cta.png`

let overlay: HTMLElement | null = null
let shownThisSession = false
let dismissCallback: (() => void) | null = null

function ensureOverlay(): HTMLElement {
  if (overlay) {
    return overlay
  }
  overlay = document.createElement('div')
  overlay.id = 'end-game-cta'
  overlay.className = 'end-game-cta hidden'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Report empty homes in Islington')
  overlay.innerHTML = `
    <div class="end-game-cta-scrim"></div>
    <div class="end-game-cta-panel">
      <button type="button" class="end-game-cta-close" aria-label="Close">×</button>
      <img class="end-game-cta-img" src="${END_GAME_CTA_URL}" alt="Islington: Empty for 6+ months? Report it." />
      <button type="button" class="end-game-cta-continue">Keep playing</button>
    </div>
  `
  document.body.append(overlay)

  const close = (): void => {
    overlay?.classList.add('hidden')
    document.body.classList.remove('end-game-cta-open')
    dismissCallback?.()
    dismissCallback = null
  }
  overlay.querySelector('.end-game-cta-close')?.addEventListener('click', close)
  overlay.querySelector('.end-game-cta-continue')?.addEventListener('click', close)
  overlay.querySelector('.end-game-cta-scrim')?.addEventListener('click', close)

  return overlay
}

/** Show the Islington reporting CTA once when the demo report quota is met. */
export function tryShowEndGameCta(reportedCount: number, onDismiss?: () => void): boolean {
  if (shownThisSession || reportedCount < END_GAME_CTA_REPORTS_DEMO) {
    return false
  }
  shownThisSession = true
  dismissCallback = onDismiss ?? null
  const el = ensureOverlay()
  el.classList.remove('hidden')
  document.body.classList.add('end-game-cta-open')
  return true
}

export function resetEndGameCtaForNewRun(): void {
  shownThisSession = false
  overlay?.classList.add('hidden')
  document.body.classList.remove('end-game-cta-open')
}
