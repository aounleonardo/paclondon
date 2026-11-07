# Back London: dev handoff

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

## tiny.london version (Islington, also Tower Hamlets)

Open `handoff/screens-tinylondon.html`. Play goes into **Islington**, starting at Angel (EC1V 1NY): `handoff/islington-data.js` (~21k road segments, ~10k homes, 239 postcodes). Add `?borough=tower-hamlets` to the URL for Tower Hamlets (starts at Whitechapel). Same data format, so another borough is one more data file.

- The map is tiny.london's own page in an iframe (their UI and credits stay). It states no licence: OK for the hackathon demo, ask the author (Boris Starkov) before publishing publicly.
- Characters can only walk on roads: `handoff/tower-hamlets-data.js` holds ~29k OpenStreetMap road segments, ~12.7k homes and 341 postcodes for the whole borough, projected into tiny.london map pixels with the projection the site publishes at https://tiny.london/map.json. Measured zoom for `?q=<postcode>` views: 0.482 screen px per map px (same at any window size).
- The page can only be pointed somewhere by loading `?q=<postcode>`, so the borough is explored screen by screen: walking off an edge reloads the map on the nearest postcode in that direction ("Walking on..." screen for a few seconds).
- 20 empty homes spread across the borough (`TOTAL_HOMES` in the script), placed on real residential buildings next to a road. A bar at the top points to the nearest one.
- Dark map is on by default (a CSS filter on the iframe), toggle bottom right.

## Houses

- `house-options.html`: pick the empty/filled style. Chosen: B, whole house.
- `assets/houses/house_N_empty_tint.png` and `house_N_filled_tint.png` (N = 1..7). Also `_roof` and `_glow` variants.
- Source: MetroCity Environment by JIK-A-4, CC0, https://jik-a-4.itch.io/metro. `assets/make_houses.py` regenerates them.
- `houses.html`: the pack shortlist (MetroCity Environment, Kenney RPG Urban Kit, Kenney Pico-8 City, all CC0).

## Data credits

- Roads and homes: © OpenStreetMap contributors (ODbL). Postcodes: postcodes.io (Open Government Licence).

## Reference

- `reference/islington-demo.png`: target look for the play screen (Islington, dark map). Map in the image: tiny.london by Boris Starkov.

## Deck

- `deck/back-london-deck.pdf`: 7-slide pitch (open, problem, solution, what it is, how it works, demo, stay in touch). Live app: https://paclondon.netlify.app
- `deck/index.html`: the same deck as a web page, with the animated sprites. Open it in a browser: arrow keys or click to move, F for full screen.
