# Vacant House Investigator — Complete Implementation Document
## From Repo to Live Game

**Base repo:** https://github.com/bear0330/pacman-on-map  
**Live demo of base:** https://bear0330.github.io/pacman-on-map/  
**Goal:** Turn real UK streets into a playable Pac-Man-style game where the player investigates suspicious houses, checks which ones are truly vacant, and turns only the real vacant ones green while surviving ghosts.

This document contains everything needed to implement the full feature set requested.

---

## 1. Final Game Concept

### Core Fantasy
Houses are **not** clearly labelled as vacant. Pac-Man only has a suspicion. The player must risk time near them to check, then claim the real vacant ones. Ghosts hunt the entire time.

### Win Condition
Turn **all real vacant houses** green.

### Key Mechanics
1. Choose any area on the map (or search a place).
2. Generate a playable road maze from real OpenStreetMap data for that area.
3. Suspicious houses appear on the roads (grey / “?” markers).
4. **Quick Check** (≈3 seconds): Stay near a house to reveal if it is vacant or occupied.
   - Vacant → turns yellow.
   - Occupied / Fake → turns red + penalty.
5. **Long Claim** (≈10 seconds): Only on yellow (vacant) houses. Stay to turn it fully green.
6. Leaving the radius or being hit by a ghost resets the current action.
7. No traditional pellets. Houses are the only collectibles.
8. Maze is generated from real roads that cover the chosen area (and therefore the houses inside it).

### Optional Later Polish
- Power pellet makes checks instant or claims faster.
- Clue system (bins out, lights off, mail piled up).
- Different basemaps (including experiments with Tiny London).

---

## 2. House Data Format

Prepare houses as CSV or JSON. The game must know which ones are truly vacant; the player does not until they check.

```csv
id,lat,lng,isVacant,address
H001,51.5074,-0.1278,true,"123 High Street"
H002,51.5080,-0.1285,false,"45 Occupied Road"
H003,51.5068,-0.1291,true,"7 Vacant Lane"
```

- `isVacant`: only the game logic knows this.
- For the first working version, hard-code a small array of 8–15 houses around a test area (e.g. central London).
- Later replace with your real UK vacant-property dataset.

---

## 3. Architecture Overview

The existing project already gives you:
- Real road graph from Overpass API
- Pac-Man and ghost movement along the graph
- Collision detection
- Lives, scoring, win/loss flow
- MapLibre GL JS + OpenStreetMap tiles
- Static frontend (Vite + TypeScript)

**What changes:**

| Area | File(s) | What to do |
|------|---------|------------|
| Types | `src/types.ts` | Add `House` and related state |
| Map generation | `src/generator/generatePlayableMap.ts` | Snap houses to roads |
| Game logic | `src/game/gameEngine.ts` | Check / Claim timers, penalties, new win condition |
| Rendering | `src/render/*` + `src/main.ts` | Colour-coded house markers + progress |
| UI | `src/main.ts` + `style.css` | Vacant houses remaining |
| Basemap (optional) | Map style in `src/main.ts` or map setup | Swap tile sources |

Pellets can be disabled or left as a secondary system. Houses become the primary objective.

---

## 4. Detailed Implementation Steps

### Step 1 – Setup

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/pacman-on-map.git
cd pacman-on-map
npm install
npm run dev
```

Create branch: `feature/vacant-houses`

Confirm the original game works before changing anything.

---

### Step 2 – Update Types (`src/types.ts`)

Add:

```ts
export interface House extends GeoPoint {
  id: string
  isVacant: boolean
  checked: boolean
  claimed: boolean
  state: 'unknown' | 'vacant' | 'occupied'
  edgeId?: string
  progress: number          // 0 to 1
}

export interface HouseAction {
  houseId: string
  type: 'check' | 'claim'
  progress: number
  startedAt: number
}
```

Update `PlayableMap`:
- Add `houses: House[]`

Update `GameState`:
- Add `remainingVacantHouses: number`
- Add `currentHouseAction: HouseAction | null`

---

### Step 3 – Place Houses on the Road Graph

**Location:** `src/generator/generatePlayableMap.ts` (or a new helper)

After the road network is finalised:

1. Take the list of houses that fall inside the current map bounds.
2. For each house, snap it to the nearest edge (or nearest node) so it sits on a playable road.
3. Create `House` objects with:
   - `state: 'unknown'`
   - `checked: false`
   - `claimed: false`
   - `progress: 0`
4. Attach the array to the returned `PlayableMap`.

Reuse existing helpers: `distanceMeters`, `interpolate`, `nearestNode`.

**Hard-coded test data example** (put near the generator for the first version):

```ts
const TEST_HOUSES = [
  { id: 'H1', lat: 51.5074, lng: -0.1278, isVacant: true },
  { id: 'H2', lat: 51.5081, lng: -0.1282, isVacant: false },
  { id: 'H3', lat: 51.5069, lng: -0.1290, isVacant: true },
  // add more around your test area
]
```

---

### Step 4 – Core Mechanic in Game Engine (`src/game/gameEngine.ts`)

#### Constants

```ts
const CHECK_DURATION_MS = 3000
const CLAIM_DURATION_MS = 10000
const HOUSE_RADIUS_METERS = 18
const OCCUPIED_SLOW_DURATION_MS = 6000
const OCCUPIED_SPEED_MULTIPLIER = 0.55
```

#### New private fields
- `occupiedSlowUntil: number = 0`

#### Main update
Call a new method every frame: `updateHouseInteraction(deltaMs)`

#### Logic of `updateHouseInteraction`
1. Find the closest house within `HOUSE_RADIUS_METERS`.
2. If no house in range → cancel any active action and return.
3. If there is an active action on a different house → cancel it.
4. Desired action:
   - `state === 'unknown'` → start **check**
   - `state === 'vacant' && !claimed` → start **claim**
   - otherwise do nothing
5. While action is running and still in range → increase progress.
6. When progress reaches 1 → complete the action.
7. On ghost collision (existing path) → cancel current house action.

#### Completion handlers

**completeCheck(house)**
- `house.checked = true`
- If `house.isVacant`:
  - `house.state = 'vacant'`
  - Floating text: "Empty!"
- Else:
  - `house.state = 'occupied'`
  - `this.occupiedSlowUntil = now + OCCUPIED_SLOW_DURATION_MS`
  - Floating text: "Occupied!"

**completeClaim(house)**
- `house.claimed = true`
- Decrease `this.state.remainingVacantHouses`
- Floating text: "Freed!"
- If `remainingVacantHouses <= 0` → set status to `'win'`

#### Speed modification
In Pac-Man movement, if `now < occupiedSlowUntil` apply the slow multiplier.

#### Win condition
Replace or supplement the existing pellet win check:

```ts
if (this.state.remainingVacantHouses <= 0) {
  this.state.status = 'win'
  this.pushEvent('win')
}
```

---

### Step 5 – Rendering

**Goal:** Colour-coded markers + progress feedback.

Recommended approach with MapLibre:

1. Create a GeoJSON source of houses.
2. Circle layer with data-driven colour:
   - `unknown` → `#888888` (or pulsing)
   - `vacant` → `#ffca3a` (yellow)
   - `occupied` → `#ff595e` (red)
   - `claimed` → `#90be6d` (green)
3. Optional symbol layer for “?” on unknown houses.
4. Progress ring: second circle layer with growing stroke, or a simple canvas overlay that draws an arc around the active house.

Reuse the existing floating text system for “Checking…”, “Empty!”, “Occupied!”, “Freed!”.

---

### Step 6 – UI Updates

In the side panel (`src/main.ts`):

- Show “Vacant left: X” (count of houses where `isVacant && !claimed`).
- Short help text:
  > Stay near a house to check it.  
  > Yellow houses can be freed by staying longer.

Optional: button to hide red (occupied) houses after they have been checked.

---

### Step 7 – Disable or Reduce Pellets (Optional)

In `generatePlayableMap.ts`, either:
- Skip pellet generation entirely, or
- Keep a few power pellets if you want the classic power-up moment later.

Houses are the primary objective.

---

## 5. Basemap Options (Including Tiny London)

The visual basemap and the gameplay graph are separate. The road graph always comes from OpenStreetMap / Overpass. You can change what the player sees underneath.

### Easy swaps (recommended first)
In the MapLibre style (usually in `src/main.ts` or map setup):

- Default OpenStreetMap (current)
- Carto Positron / Dark Matter
- Satellite imagery
- Any standard XYZ raster tiles

These keep perfect alignment with the road graph.

### Tiny London (https://tiny.london)
Beautiful isometric pixel-art map of Greater London.

**Caveats:**
- Uses a custom isometric projection (not Web Mercator).
- Viewer is OpenSeadragon + Deep Zoom tiles, not a standard XYZ source.
- Alignment with real OSM roads requires custom coordinate transforms.
- Tile URLs are not publicly documented as MapLibre-compatible.

**Recommendation:** Get the game working with a standard basemap first. Treat Tiny London as a later visual experiment if you want the pixel-art look.

Other custom maps (isometric.nyc style, satellite, Ordnance Survey, etc.) can be swapped the same way once you have a tile URL template.

---

## 6. Recommended Implementation Order

1. Types + hard-coded houses appear on the map (static colours).
2. Snap logic so they sit on roads.
3. Check timer only (unknown → vacant/occupied).
4. Claim timer only (vacant → green).
5. Penalties + win condition.
6. Progress ring + floating text.
7. UI counter.
8. Optional: nicer basemap.
9. Replace hard-coded data with real CSV/GeoJSON loader.
10. Deploy.

---

## 7. Testing Checklist

- [ ] Generate maze → houses appear on roads
- [ ] Stay near unknown house → check progress fills
- [ ] Complete check on vacant → turns yellow
- [ ] Complete check on fake → turns red + slow applied
- [ ] Stay on yellow house → claim progress fills → turns green
- [ ] Leave radius mid-check or mid-claim → progress resets
- [ ] Get hit by ghost mid-action → progress resets + lose life
- [ ] Claim all real vacant houses → win screen appears
- [ ] Occupied houses do not count toward win
- [ ] Area selection still works
- [ ] Ghosts and movement still feel good

---

## 8. Deployment

The project is a static frontend.

```bash
npm run build
```

Deploy the `dist/` folder to:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Any static host

No backend is required. The app fetches road data directly from Overpass in the browser.

---

## 9. Optional Future Enhancements

- Clue system before the check
- Power pellet that speeds up claims
- Ghosts more likely to patrol near unchecked houses
- Difficulty settings (check/claim times, % of fake houses)
- Real UK vacant property data feed
- Sound design (doorbell, “anyone home?”, success chime)
- Tiny London or other custom basemap experiment
- Postcode search focused on UK

---

## 10. Notes for the Implementing AI

- Preserve all existing movement, ghost AI, and road-graph code.
- Do not remove pellets until the house system is fully working (or keep both if desired).
- Prefer small, focused changes. The original project was vibe-coded; keep a similar style.
- Use the existing `distanceMeters`, collision, and floating-text systems wherever possible.
- Test frequently in the browser after each major step.
- Compare behaviour against the original live demo: https://bear0330.github.io/pacman-on-map/

---

## 11. Summary of Requested Features — Status

| Requested feature | How it is covered |
|-------------------|-------------------|
| Choose an area | Existing map movement + generate |
| Point out empty houses | House markers snapped to roads |
| Reach house before ghosts | Existing collision + radius check |
| House turns green | Claim completion sets green |
| All houses green to win | New win condition on remaining vacant |
| Maze auto-created around houses | Existing road graph for the viewport |
| No pellets | Optional disable; houses are primary |
| Suspicion (not clearly vacant) | Start as unknown / “?” |
| Stay / do something to confirm | Check then Claim timers |
| Real and fake houses | `isVacant` flag + different outcomes |
| Fun while surviving | Timers + penalties + ghosts |
| Overlay other maps / Tiny London | Basemap swap section |

---

**End of Document**

This is a complete plan from the existing repo to a live game that implements every change requested.  
Start with Step 1 (setup) and Step 2 (types), then proceed in the order listed in Section 6.
