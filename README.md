# Pac-Man on Map

🟡 A tribute remake inspired by **Ms. PAC-Maps**, Google's April Fools' Pac-Man on Google Maps.  
I built this project for my 5-year-old son to enjoy.

🎮 Play it here: **https://bear0330.github.io/pacman-on-map/**

This project turns real streets into a playable Pac-Man board. Pick a neighborhood, generate a road maze, and play directly on top of the map.

My son recently got into Pac-Man, spotted the old Google Maps version on YouTube, and asked me to find it for him. I found out it was a 2015 April Fools' thing and no longer playable, so I made this to give him something close enough to enjoy.

This whole project was largely vibe-coded with AI. I did not treat it like a serious production system. I am a senior engineer, but this one was mainly for fun, for my kid, and because the idea was too charming to ignore. It is not perfect, and I was not obsessing over every engineering detail. Still, it works, it made him happy, and that was the point.

## What It Does

- 🗺️ Generates a playable Pac-Man layout from real road data
- 👻 Spawns ghosts, pellets, power pellets, scoring, and lives
- 🌏 Supports **English** and **Traditional Chinese**
- 📍 Lets you search places or load optional preset addresses
- 🎵 Uses built-in synthesized arcade-style audio in the browser

## Demo Flow

1. Move the map to an area you want to play.
2. Click `Generate Road Maze`.
3. Press `Play`.
4. Use `Arrow Keys` or `WASD`.

## Tech Stack

- `Vite`
- `TypeScript`
- `MapLibre GL JS`
- `OpenStreetMap` raster tiles
- `Overpass API` + `Nominatim`
- `Vitest`

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

Production files are generated into `dist/`.

## Deployment

This is a **static frontend app**. No custom backend server is required.

### Netlify

Repo includes `netlify.toml`. In the Netlify UI (or CLI):

1. **New site from Git** → connect `aounleonardo/paclondon`, branch `main`
2. Build settings (filled from `netlify.toml` if detected):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Node version:** 22 (set in `netlify.toml`)
3. Deploy

No env vars are required for the MVP. The app calls Overpass / Nominatim from the browser.

For a GitHub Pages-style subpath instead, set `VITE_BASE_PATH=/your-repo-name/` in the host’s env and rebuild.

### Other hosts

You can also deploy `dist/` to GitHub Pages, Vercel, Cloudflare Pages, or any static CDN.

Note: the app fetches road and geocoding data directly from public services in the browser, so client-side network access is required.

## Optional Preset Addresses

If `public/addresses.txt` exists, the app will load preset places into a dropdown.  
If the file is missing, the UI simply hides that option.

Supported formats:

```text
Label
Label|Search Query
Label|lat|lng
```

## Custom basemap (designer brief)

The game draws **two layers**:

1. **Basemap** — MapLibre GL, currently OpenStreetMap raster tiles (`src/map/mapController.ts`).
2. **Game overlay** — a canvas on top (roads path, player, ghosts, vacant houses). Designers do **not** need to draw Pac-Man, ghosts, or house markers in the map art; those stay in code.

To replace the look when Illustrator / custom art is ready, keep **real lat/lng** (Web Mercator / EPSG:3857). Gameplay roads still come from OpenStreetMap Overpass data.

### What to deliver

Pick **one** of these (simplest first):

| Option | Deliverable | Notes |
| --- | --- | --- |
| **A. Raster tile set** | `{z}/{x}/{y}.png` (or WebP) pyramid | Drop-in swap for the current OSM URL. Preferred for v1. |
| **B. MapLibre style JSON** | `style.json` + hosted glyphs/sprites/sources | Full control (vector or raster). We point MapLibre at that style URL. |
| **C. Single borough image** | One large georeferenced image + bounds | Fine for Tower Hamlets demo only; needs north/south/east/west corners in lat/lng. |

### Specs for Option A (recommended)

- **Projection:** Web Mercator (same as Google Maps / Mapbox / OSM).
- **Tile size:** 256×256 or 512×512 px.
- **Zoom range for play:** at least **z15–z18** (gameplay sits around 17–18). Lower zooms (z12–14) nice for browsing but optional.
- **Coverage for MVP:** Tower Hamlets / Bethnal Green area is enough to start. Wider London can come later.
- **Anchor:** include the area around **Newspeak House** (`51.525134, -0.071273`).
- **Content:** streets, blocks, landmarks as desired. Prefer a relatively calm background so blue paths and purple/green houses stay readable.
- **Attribution:** tell us the credit line (e.g. “Map © Studio Name”) so we can show it in the map corner.

### How engineering swaps it in

Today the style is a small inline object in `src/map/mapController.ts`:

```ts
tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']
```

Replace that URL with your tile endpoint (or load a hosted MapLibre `style.json`). No change to vacant-house or road graph logic is required for a visual-only swap.

### What not to bake into the map art

- Player / ghost sprites  
- Vacant (purple) / reported (green) house markers  
- The thick blue playable path  

Those are drawn by the game canvas so they can animate and update during play.

### Reference mood

[tiny.london](https://tiny.london) is a useful **mood board** (illustrated / pixel city). We are not embedding that project; we only want a similar custom look if you produce our own tiles.

Design decisions for vacant-house gameplay live in `TODO.md`.

## Testing

```bash
npm run test
```

Current tests cover road clipping, map generation, collisions, scoring chains, and win/loss flow.

## Notes

- This is a fan-made tribute project.
- It is not affiliated with or endorsed by Google, Namco, or Bandai Namco.
- The project avoids bundling original Pac-Man commercial assets.
- The bundled `level-intro.mid` was sourced from Khinsider: https://www.khinsider.com/midi/arcade/pac-man
- If you want to fork it and improve it, please do. Just do not come in expecting polished enterprise-grade code from every corner of the repo.

If this little remake makes one kid smile on a random street corner somewhere in the world, it did its job.
