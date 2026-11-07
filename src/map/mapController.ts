import maplibregl, { type Map, type StyleSpecification } from 'maplibre-gl'
import type { GeoPoint, ScreenPoint, Viewport } from '../types'

const TILE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
} as const

export class MapController {
  private readonly map: Map

  public constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: [-0.1278, 51.5074],
      zoom: 16.8,
      attributionControl: false,
    })

    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
  }

  public resize(): void {
    this.map.resize()
  }

  public async ready(): Promise<void> {
    if (this.map.loaded()) {
      return
    }
    await new Promise<void>((resolve) => {
      this.map.on('load', () => resolve())
    })
  }

  public getViewport(): Viewport {
    const bounds = this.map.getBounds()
    const center = this.map.getCenter()
    return {
      center: {
        lng: center.lng,
        lat: center.lat,
      },
      zoom: this.map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
    }
  }

  public flyTo(lng: number, lat: number): void {
    this.map.flyTo({
      center: [lng, lat],
      zoom: 16.8,
      speed: 0.8,
    })
  }

  public fitToPoints(points: GeoPoint[]): void {
    if (points.length === 0) {
      return
    }

    let west = Number.POSITIVE_INFINITY
    let east = Number.NEGATIVE_INFINITY
    let south = Number.POSITIVE_INFINITY
    let north = Number.NEGATIVE_INFINITY

    for (const point of points) {
      west = Math.min(west, point.lng)
      east = Math.max(east, point.lng)
      south = Math.min(south, point.lat)
      north = Math.max(north, point.lat)
    }

    // Pad tiny bounding boxes so MapLibre still has room to frame a readable maze.
    const lngPad = Math.max((east - west) * 0.08, 0.00018)
    const latPad = Math.max((north - south) * 0.08, 0.00012)

    this.map.fitBounds(
      [
        [west - lngPad, south - latPad],
        [east + lngPad, north + latPad],
      ],
      {
        padding: { top: 28, bottom: 48, left: 24, right: 24 },
        maxZoom: 17.6,
        duration: 380,
        essential: true,
      },
    )
  }

  public getZoom(): number {
    return this.map.getZoom()
  }

  public project(point: GeoPoint): ScreenPoint {
    const projected = this.map.project([point.lng, point.lat])
    return {
      x: projected.x,
      y: projected.y,
    }
  }

  public onViewChange(listener: () => void): void {
    this.map.on('move', listener)
    this.map.on('zoom', listener)
    this.map.on('resize', listener)
  }

  public setInteractive(enabled: boolean): void {
    const methods = [
      this.map.boxZoom,
      this.map.dragPan,
      this.map.dragRotate,
      this.map.doubleClickZoom,
      this.map.keyboard,
      this.map.scrollZoom,
      this.map.touchPitch,
      this.map.touchZoomRotate,
    ]
    for (const method of methods) {
      if (enabled) {
        method.enable()
      } else {
        method.disable()
      }
    }
  }
}
