// Pixel map style for MapLibre GL.
// Tiles: OpenFreeMap (free, no key, no request limits) serving OpenStreetMap data.
// Required credit, keep visible: "© OpenMapTiles  Data from OpenStreetMap"
// No labels or icons on purpose: they turn to noise when pixelated.
//
// Use in the fork (src/map/mapController.ts):
//   import { makePixelMapStyle } from './pixel-map-style'
//   new maplibregl.Map({ container, style: makePixelMapStyle('night'), pixelRatio: 0.33, ... })
// and in src/style.css:
//   .maplibregl-canvas { image-rendering: pixelated; }

const PALETTES = {
  // matches UI style A (Night bus)
  night: { bg: '#14122a', land: '#1b1838', park: '#1d3b33', water: '#1c2f5e', building: '#2c2856', minor: '#4a4290', major: '#8a7fd6', main: '#d9d2ff', rail: '#3a3466' },
  paper: { bg: '#efe7d6', land: '#e8dfcb', park: '#c9d6a8', water: '#9fbfd4', building: '#d6cbb3', minor: '#ffffff', major: '#ffffff', main: '#f4d58a', rail: '#9a8f7a' },
  mono:  { bg: '#1e1e1e', land: '#232323', park: '#2b332b', water: '#1f2a33', building: '#333333', minor: '#5a5a5a', major: '#8a8a8a', main: '#c8c8c8', rail: '#444444' },
}

function makePixelMapStyle(name = 'night') {
  const c = PALETTES[name] || PALETTES.night
  const road = (id, classes, color, widths) => ({
    id, type: 'line', source: 'omt', 'source-layer': 'transportation',
    filter: ['match', ['get', 'class'], classes, true, false],
    layout: { 'line-cap': 'square', 'line-join': 'miter' },
    paint: { 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, widths[0], 18, widths[1]] },
  })
  return {
    version: 8,
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenMapTiles  Data from OpenStreetMap' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.land } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c.park, 'fill-antialias': false } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'wood'], true, false], paint: { 'fill-color': c.park, 'fill-antialias': false } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': c.water, 'fill-antialias': false } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': c.building, 'fill-antialias': false } },
      road('rail', ['rail', 'transit'], c.rail, [1, 3]),
      road('minor', ['minor', 'service'], c.minor, [1, 8]),
      road('major', ['secondary', 'tertiary'], c.major, [1.5, 12]),
      road('main', ['motorway', 'trunk', 'primary'], c.main, [2, 16]),
    ],
  }
}

if (typeof module !== 'undefined') module.exports = { makePixelMapStyle, PALETTES }
