/** tiny.london published projection (https://tiny.london/map.json). */

const CAMERA_LAT = 51.507
const CAMERA_LON = -0.106
const AZIMUTH_RAD = (15 * Math.PI) / 180
const TILT_RAD = (45 * Math.PI) / 180
const METERS_PER_PX = 0.29296875
const A = 6378137
const E2 = 0.0066943799901413165
const ORIGIN_X = -109056
const ORIGIN_Y = -57600

function wgsToEcef(lat: number, lon: number): [number, number, number] {
  const latR = (lat * Math.PI) / 180
  const lonR = (lon * Math.PI) / 180
  const sinLat = Math.sin(latR)
  const cosLat = Math.cos(latR)
  const n = A / Math.sqrt(1 - E2 * sinLat * sinLat)
  return [
    n * cosLat * Math.cos(lonR),
    n * cosLat * Math.sin(lonR),
    n * (1 - E2) * sinLat,
  ]
}

const cameraEcef = wgsToEcef(CAMERA_LAT, CAMERA_LON)
const camLatR = (CAMERA_LAT * Math.PI) / 180
const camLonR = (CAMERA_LON * Math.PI) / 180
const sinCamLat = Math.sin(camLatR)
const cosCamLat = Math.cos(camLatR)
const sinCamLon = Math.sin(camLonR)
const cosCamLon = Math.cos(camLonR)

function enu(lat: number, lon: number): [number, number, number] {
  const [x, y, z] = wgsToEcef(lat, lon)
  const dx = x - cameraEcef[0]
  const dy = y - cameraEcef[1]
  const dz = z - cameraEcef[2]
  const east = -sinCamLon * dx + cosCamLon * dy
  const north = -sinCamLat * cosCamLon * dx - sinCamLat * sinCamLon * dy + cosCamLat * dz
  const up = cosCamLat * cosCamLon * dx + cosCamLat * sinCamLon * dy + sinCamLat * dz
  return [east, north, up]
}

/** WGS84 → tiny.london world pixel coordinates. */
export function latLngToTinyWorld(lat: number, lon: number): [number, number] {
  const [east, north, up] = enu(lat, lon)
  const xr = east * Math.cos(AZIMUTH_RAD) + north * Math.sin(AZIMUTH_RAD)
  const yr = -east * Math.sin(AZIMUTH_RAD) + north * Math.cos(AZIMUTH_RAD)
  const px = xr / METERS_PER_PX - ORIGIN_X
  const py = -(yr * Math.cos(TILT_RAD) + up * Math.sin(TILT_RAD)) / METERS_PER_PX - ORIGIN_Y
  return [px, py]
}

/** Approximate metres from world-pixel distance (from map.json meters_per_px). */
export function worldDeltaToMeters(deltaWorld: number): number {
  return deltaWorld * METERS_PER_PX
}
