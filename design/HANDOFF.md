# Empty Homes: dev handoff

Open `handoff/screens.html` in a browser. The buttons bottom right jump to each screen (remove that nav in the game).

## What's here

| Path | What |
|---|---|
| `handoff/screens.html` | All 7 screens in UI style A (Night bus): landing, character, story, rules, borough, play, plus clear / game over / lost life overlays. Colours and fonts are CSS variables at the top. |
| `handoff/pixel-map-style.js` | MapLibre style: OpenStreetMap streets, buildings, parks, water in our palette, no labels. |
| `assets/characters/*.png` | 6 sprite sheets: `player_1..3`, `politician`, `landlord`, `nimby`. |
| `assets/characters/sprites.json` | Sheet layout. |
| `assets/compose_characters.py` | Rebuilds the sheets from the MetroCity layers (swap hair/outfit rows there). |
| `assets/metrocity/` | Original MetroCity layers. |
| `review.html` | Map palette / pixel size tester and the sprite pack shortlist. |

## Map in the fork (paclondon)

1. Copy `handoff/pixel-map-style.js` into `src/map/`.
2. In `src/map/mapController.ts`, in `new maplibregl.Map({...})`, replace `style: TILE_STYLE` with:
   ```ts
   style: makePixelMapStyle('night'),
   pixelRatio: 0.33,
   ```
3. In `src/style.css`: `.maplibregl-canvas { image-rendering: pixelated; }`

This also replaces tile.openstreetmap.org, which blocks requests without a proper referrer (it blocked our local test). Tiles now come from OpenFreeMap: free, no key, no request limits.

The game's own canvas (sprites, dots) is separate and unaffected.

## Sprites

- Each sheet is 768x32: 24 frames of 32x32.
- Frames 0-5 walk down, 6-11 right, 12-17 up, 18-23 left. 6 frames per direction.
- Draw with image smoothing off (`ctx.imageSmoothingEnabled = false`), scale 2x or 3x.

## Credits (must stay visible in game or credits screen)

- Map: "© OpenMapTiles, Data from OpenStreetMap"
- Characters: MetroCity Free Top Down Character Pack by JIK-A-4, CC0 (credit not required, appreciated). https://jik-a-4.itch.io/metrocity-free-topdown-character-pack
- Game base: pacman-on-map by Bear Huang, MIT. Keep its LICENSE.
- Fonts: Press Start 2P and VT323, Google Fonts, OFL.
- Remove `level-intro.mid` from the fork: it is Pac-Man music from Khinsider with no licence.

## Placeholders to wire

- Borough empty-home counts (borough screen) and the 2010 / now stats (clear screen) come from the vacancy dataset.
- Score, time, lives on the play HUD are static.
