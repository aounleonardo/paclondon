import { afterEach, describe, expect, it } from 'vitest'
import { END_GAME_CTA_REPORTS_DEMO, resetEndGameCtaForNewRun, tryShowEndGameCta } from './endGameCta'

describe('tryShowEndGameCta', () => {
  afterEach(() => {
    resetEndGameCtaForNewRun()
    document.getElementById('end-game-cta')?.remove()
  })

  it('shows only once at the demo report threshold', () => {
    expect(tryShowEndGameCta(END_GAME_CTA_REPORTS_DEMO - 1)).toBe(false)
    expect(tryShowEndGameCta(END_GAME_CTA_REPORTS_DEMO)).toBe(true)
    expect(document.getElementById('end-game-cta')?.classList.contains('hidden')).toBe(false)
    expect(tryShowEndGameCta(END_GAME_CTA_REPORTS_DEMO + 5)).toBe(false)
  })
})
