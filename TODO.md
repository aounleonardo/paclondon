# Pac London — design agreements

Things we want to agree on before (or while) reshaping the Pac-Man prototype into a vacant-property reporting game.

---

## Locked decisions (MVP)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Borough / spawn | Start in **Tower Hamlets**, spawn near **Newspeak House, 133 Bethnal Grn Rd, London E2 7DG** |
| 2 | Vacant house data | **Mock 4 addresses** for now (below); real list ingested before publish |
| 3 | “Close enough” | Within **15 m** of the house — **auto-report on pass-by** (no hold / no Space) |
| 4 | Fail / win | Keep **lives, ghosts, death**. Win if you report all vacant houses before running out of lives |
| 5 | Tone | **Playful Pac-Man remix** is fine |
| 6 | Basemap | Keep **OSM / MapLibre** for v1; swap when designer delivers Illustrator looks |
| 7 | Reset | **Full reset only on Restart**. Between lives, reported (green) houses **stay reported** — three lives to clear the level |
| 8 | Report feedback | Floating **“Reported!”** notice above the player when a house is reported |

### Spawn centre

- **Newspeak House** — `51.525134, -0.071273` (133 Bethnal Grn Rd, London E2 7DG)

### Mock vacant houses (within ~1 mile of Newspeak House)

Placeholder points only — swap for real data before publish.

| id | label | lat | lng | ~distance |
| --- | --- | --- | --- | --- |
| mock-1 | Bethnal Green Road north (mock) | 51.52765 | -0.07127 | ~280 m N |
| mock-2 | Bethnal Green Road east (mock) | 51.52513 | -0.06780 | ~240 m E |
| mock-3 | Brick Lane south (mock) | 51.52235 | -0.07127 | ~310 m S |
| mock-4 | Shoreditch High St edge (mock) | 51.52660 | -0.07450 | ~250 m NW |

Mock points sit close enough to appear in a zoom 17–18 Newspeak House maze.

---

## Game flow

1. **Spawn** — Player starts near Newspeak House (or random street node in Tower Hamlets around that point).
2. **Explore** — Run on real streets; find vacant houses.
3. **Vacant houses** — **Purple** markers (replace pellet collectibles as the main objective).
4. **Report** — Pass within **15 m** → auto-report to council → house turns **green** + “Reported!” popup.
5. **Lives** — Ghosts can still kill you; lose a life; reported houses remain green.
6. **Win** — All vacant houses reported before lives are gone.

---

## Components we need

- [x] **Remove street pellets** (and power pellets) — win is reporting vacant houses only; no yellow dots along roads
- [x] Ingest a list of vacant houses (mock 4 for MVP); render **purple**
- [x] Auto-report within **15 m** → **green** + floating “Reported!” notice
- [x] Win when all houses reported
- [x] Keep lives / ghosts / death; preserve reported state across lives
- [x] Spawn near Newspeak House / Tower Hamlets play area
- [x] Data shape: `{ id, address?, lat, lng, status: 'vacant' | 'reported' }`
- [x] HUD: remaining vacant / reported count (not pellet count)
- [x] Win / game-over copy in playful Pac-Man tone

### Nice-to-have / later

- [x] **First screen / loading scene** that explains the objectives (find purple vacant houses, report them, avoid ghosts, clear the borough)
- [ ] Real vacant GeoJSON/CSV ingest before publish
- [ ] Custom Illustrator basemap when designer delivers
- [ ] Score still tracking reports / chains
- [ ] Colour accessibility (icon + purple/green, not colour alone)

---

## Road complexity / simplification

**Real problem (corrected):** too many **interlocking streets**, not just bubbly drawing.

Dense London OSM includes parallel sidewalks/lanes, alleys, footways, service roads, and tiny courtyards. That turns one city block into a micro-maze — lots of short turns instead of Pac-Man-style long corridors and simple 4-way junctions.

There are **two** separate issues:

| Issue | Symptom | Fix layer |
| --- | --- | --- |
| **Topology too dense** | Parallel paths, alleys inside blocks, constant turning | Fewer playable edges / junctions |
| **Drawing looks bubbly** | Round caps on every tiny OSM segment | Render + bend collapse |

### Approaches (pick a target feel)

1. **Filter harder** — Drop `footway`, `cycleway`, `service`, `track`, maybe `pedestrian`. Keep main streets only. Fast, still “real London,” but some areas stay busy.
2. **Merge parallels** — Collapse dual carriageways / sidewalk pairs within ~N metres into one centerline. Fixes the “ladder” look on one street.
3. **Block-grid abstraction** (Pac-Man feel) — Keep major junctions only; turn each city block into something closer to a **rectangle with 4 corners**. Player runs the perimeter, not every alley. Closest to “one square with four corners.”
4. **Bend collapse** — Still useful after any of the above: remove degree-2 wiggle nodes so remaining roads are long clean edges.

**Recommendation for playful Pac-Man:** **(1) + (3)** — filter to main highways, then abstract to a coarser junction graph so navigation is a few turns per block, not dozens.

**Reachability filter (implemented):** after maze generation, vacant houses farther than **~20 m** from any playable road edge are dropped so purple markers only appear where the player can report them.

- [ ] Agree target feel: **real dense streets** vs **simplified Pac-Man blocks**?
- [ ] If simplified: how aggressive? (e.g. min block edge ~40–60 m, drop alleys, merge parallels under ~12 m)

---

## Custom map visuals (tiny.london, etc.)

Keep OSM for now. When Illustrator assets arrive, replace the MapLibre basemap; keep lat/lng + road graph for play. tiny.london = mood board, not a dependency.

**Designer handoff:** see **Custom basemap (designer brief)** in `README.md` — what to deliver (raster tiles / style JSON / georeferenced image), zoom/projection specs, and what stays in the game canvas vs the map art.

---

## Replacing player & ghost sprites

Sprites are drawn in code today (`src/render/canvasRenderer.ts`: `drawPacman`, `drawGhost`), not loaded from image files.

### What to give engineering

| Asset | Suggested deliverable | Notes |
| --- | --- | --- |
| Player | PNG/WebP (or sprite sheet) | Transparent background. Prefer square frames, e.g. **64×64** or **128×128**. |
| Ghosts | One sheet or 4 separate images | Optional: separate frames for chase / frightened / eyes. |
| Directions | 4 facings **or** one art we rotate | Up / down / left / right if the character has a facing. |

### Optional extras

- Mouth-open / mouth-closed frames for a chomp cycle  
- Death animation frames  
- Frightened (blue/flash) ghost variant  
- “Eyes only” ghost variant when eaten  

### How we plug them in

1. Drop files under e.g. `public/sprites/` (`player.png`, `ghost-red.png`, …).  
2. Load with `new Image()` / `fetch` in the renderer.  
3. Replace the canvas path-drawing in `drawPacman` / `drawGhost` with `drawImage(...)`, still using the same lat/lng → screen projection.  
4. Keep hitboxes / sizes close to current radii (~20 px player, ~16 px ghost head) so collisions still feel right, or tell us the intended on-screen size in metres/pixels.

Until custom art arrives, the procedural Pac-Man / ghost drawings stay as the default.

---

## Borough boundaries — how to pass limits

We want play constrained to **one borough** (MVP: Tower Hamlets). Best handoff formats, simplest first:

### Option A — GeoJSON polygon (preferred)

One file per borough, or one FeatureCollection:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Tower Hamlets", "id": "tower-hamlets" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-0.08, 51.54],
          [-0.02, 51.54],
          [-0.02, 51.48],
          [-0.08, 51.48],
          [-0.08, 51.54]
        ]]
      }
    }
  ]
}
```

- Coordinates: **`[longitude, latitude]`** (GeoJSON order), WGS84.  
- Use an official borough outline if you have one (e.g. from London Datastore / Ordnance Survey open data), or a simplified polygon is fine for gameplay.  
- Multipolygon boroughs are OK (`MultiPolygon`).

Put files in e.g. `public/boroughs/tower-hamlets.geojson` and tell us the path + which borough is default.

### Option B — Bounding box only (quick & rough)

```text
name|south|west|north|east
Tower Hamlets|51.48|-0.08|51.55|-0.01
```

Good for a first clamp; less accurate on diagonal borough edges.

### Option C — Point + radius

Only for a throwaway demo (“everything within 1.2 km of Newspeak House”). Not ideal for real borough limits.

### What we’ll do with the data

1. Clamp map pan / generate viewport to the polygon (or bbox).  
2. Filter Overpass roads and vacant houses to inside the borough.  
3. Optionally draw a soft border / dim outside the borough.

**Please send:** GeoJSON (Option A) for Tower Hamlets first; we can add more boroughs the same way later.

---

## Controls note

- Arrow keys / WASD to move.  
- Passing within **15 m** of a purple house auto-reports it (no Space hold).  
- While playing, the camera **follows the player** (zoom stays where the player set it).

---

## Suggested MVP cut

1. Tower Hamlets map centered on Newspeak House  
2. Mock 4 purple vacant houses nearby (filtered to maze-reachable only)  
3. Pass within 15 m → auto-report + “Reported!” popup; keep greens across lives  
4. Win when all reported; ghosts/lives still active  
5. Road graph simplification so streets look/play cleaner  
6. Objectives intro / loading screen  
7. Defer real vacant data + custom basemap / sprites until those pipelines are ready  


