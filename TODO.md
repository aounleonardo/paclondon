# Pac London — design agreements

Things we want to agree on before (or while) reshaping the Pac-Man prototype into a vacant-property reporting game.

---

## Locked decisions (MVP)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Borough / spawn | Start in **Tower Hamlets**, spawn near **Newspeak House, 133 Bethnal Grn Rd, London E2 7DG** |
| 2 | Vacant house data | **Mock 4 addresses** for now (below); real list ingested before publish |
| 3 | “Close enough” | Within **15 m** of the house (not “must be on nearest edge”) |
| 4 | Fail / win | Keep **lives, ghosts, death**. Win if you report all vacant houses before running out of lives |
| 5 | Tone | **Playful Pac-Man remix** is fine |
| 6 | Basemap | Keep **OSM / MapLibre** for v1; swap when designer delivers Illustrator looks |
| 7 | Reset | **Full reset only on Restart**. Between lives, reported (green) houses **stay reported** — three lives to clear the level |
| 8 | Progress UI | **Yes** — show a **1s fill ring** while holding near a vacant house |

### Spawn centre

- **Newspeak House** — `51.525134, -0.071273` (133 Bethnal Grn Rd, London E2 7DG)

### Mock vacant houses (within ~1 mile of Newspeak House)

Placeholder points only — swap for real data before publish.

| id | label | lat | lng | ~distance |
| --- | --- | --- | --- | --- |
| mock-1 | Columbia Road (mock) | 51.53050 | -0.07130 | ~0.4 mi N |
| mock-2 | Bethnal Green Rd east (mock) | 51.52510 | -0.06000 | ~0.5 mi E |
| mock-3 | Whitechapel north (mock) | 51.51900 | -0.06950 | ~0.4 mi S |
| mock-4 | Shoreditch High St (mock) | 51.52780 | -0.08100 | ~0.5 mi W |

---

## Game flow

1. **Spawn** — Player starts near Newspeak House (or random street node in Tower Hamlets around that point).
2. **Explore** — Run on real streets; find vacant houses.
3. **Vacant houses** — **Purple** markers (replace pellet collectibles as the main objective).
4. **Report** — Stay within **15 m** for **1 second** (fill ring) → report to council → house turns **green**.
5. **Lives** — Ghosts can still kill you; lose a life; reported houses remain green.
6. **Win** — All vacant houses reported before lives are gone.

---

## Components we need

- [ ] **Remove street pellets** (and power pellets) — win is reporting vacant houses only; no yellow dots along roads
- [ ] Ingest a list of vacant houses (mock 4 for MVP); render **purple**
- [ ] Proximity hold: within **15 m** for 1s → report → **green** + fill-ring UI
- [ ] Win when all houses reported
- [ ] Keep lives / ghosts / death; preserve reported state across lives
- [ ] Spawn near Newspeak House / Tower Hamlets play area
- [ ] Data shape: `{ id, address?, lat, lng, status: 'vacant' | 'reported' }`
- [ ] HUD: remaining vacant / reported count (not pellet count)
- [ ] Win / game-over copy in playful Pac-Man tone

### Nice-to-have / later

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

**Recommendation for playful Pac-Man:** **(1) + (3)** — filter to main highways, then abstract to a coarser junction graph so navigation is a few turns per block, not dozens. Vacant houses stay at real lat/lng; player only needs to get “within X m” on the simplified street.

- [ ] Agree target feel: **real dense streets** vs **simplified Pac-Man blocks**?
- [ ] If simplified: how aggressive? (e.g. min block edge ~40–60 m, drop alleys, merge parallels under ~12 m)
- [ ] Vacant houses off the simplified path are OK as long as proximity still works? (assumed yes)

---

## Custom map visuals (tiny.london, etc.)

Keep OSM for now. When Illustrator assets arrive, replace the MapLibre basemap; keep lat/lng + road graph for play. tiny.london = mood board, not a dependency.

**Designer handoff:** see **Custom basemap (designer brief)** in `README.md` — what to deliver (raster tiles / style JSON / georeferenced image), zoom/projection specs, and what stays in the game canvas vs the map art.

---

## Suggested MVP cut

1. Tower Hamlets map centered on Newspeak House  
2. Mock 4 purple vacant houses nearby  
3. 1s dwell + fill ring → green; keep greens across lives  
4. Win when all 4 reported; ghosts/lives still active  
5. Road graph simplification so streets look/play cleaner  
6. Defer real vacant data + custom basemap until those pipelines are ready  
