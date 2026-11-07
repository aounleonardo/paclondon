export type PlayerSpriteId = 'player_1' | 'player_2' | 'player_3'
export type ChaserSpriteId = 'politician' | 'landlord' | 'nimby'

export const PLAYER_SPRITES: PlayerSpriteId[] = ['player_1', 'player_2', 'player_3']
export const CHASER_SPRITES: ChaserSpriteId[] = ['politician', 'landlord', 'nimby']
export const CHASER_LABELS = ['The Politician', 'The Landlord', 'The NIMBY'] as const

export const SPRITE_FRAME = 32
export const SPRITE_FRAMES_PER_DIR = 6
export const HOUSE_VARIANT_COUNT = 7

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load ${src}`))
    image.src = src
  })
}

export async function loadCharacterSheets(
  ids: string[],
): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const image = await loadImage(`/sprites/characters/${id}.png`)
      return [id, image] as const
    }),
  )
  return new Map(entries)
}

export async function loadHouseSheets(): Promise<{
  empty: HTMLImageElement[]
  filled: HTMLImageElement[]
}> {
  const empty: HTMLImageElement[] = []
  const filled: HTMLImageElement[] = []
  for (let index = 1; index <= HOUSE_VARIANT_COUNT; index += 1) {
    empty.push(await loadImage(`/sprites/houses/house_${index}_empty.png`))
    filled.push(await loadImage(`/sprites/houses/house_${index}_filled.png`))
  }
  return { empty, filled }
}

export function houseVariantIndex(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return hash % HOUSE_VARIANT_COUNT
}
