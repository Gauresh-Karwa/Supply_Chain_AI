'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

interface Point {
  lon: number
  lat: number
  label?: string
}

interface RouteLine {
  id: string
  origin: Point
  destination: Point
  color: string
  label: string
  isDashed?: boolean
}

const PORT_COORDS: Record<string, { lon: number; lat: number }> = {
  'Shanghai':     { lon: 121.5, lat: 31.2 },
  'Singapore':    { lon: 103.8, lat:  1.4 },
  'Rotterdam':    { lon:   4.5, lat: 51.9 },
  'Dubai':        { lon:  55.3, lat: 25.2 },
  'Mumbai':       { lon:  72.8, lat: 18.9 },
  'Colombo':      { lon:  79.9, lat:  6.9 },
  'Busan':        { lon: 129.1, lat: 35.2 },
  'Hong_Kong':    { lon: 114.2, lat: 22.3 },
  'Hamburg':      { lon:  10.0, lat: 53.6 },
  'Antwerp':      { lon:   4.4, lat: 51.2 },
  'Piraeus':      { lon:  23.6, lat: 37.9 },
  'Los_Angeles':  { lon:-118.2, lat: 34.1 },
  'New_York':     { lon: -74.0, lat: 40.7 },
  'Sydney':       { lon: 151.2, lat:-33.9 },
  'Cape_Town':    { lon:  18.4, lat:-33.9 },
  'Djibouti':     { lon:  43.1, lat: 11.6 },
  'Santos':       { lon: -46.3, lat:-24.0 },
}

function toMercator(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360
  const latRad = lat * Math.PI / 180
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI)
  return [x, y]
}

const MAP_BOUNDS = { lonMin: -130, lonMax: 160, latMin: -45, latMax: 65 }
const [mxMin, myMin] = toMercator(MAP_BOUNDS.lonMin, MAP_BOUNDS.latMax)
const [mxMax, myMax] = toMercator(MAP_BOUNDS.lonMax, MAP_BOUNDS.latMin)

export default function RouteMap({ routes }: { routes: RouteLine[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [geoData, setGeoData] = useState<any>(null)
  const timeRef = useRef(0)

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json()).then(d => setGeoData(d)).catch(() => {})
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    const cw = rect.width, ch = rect.height
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
    }
    const ctx = canvas.getContext('2d')!
    ctx.resetTransform(); ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cw, ch)
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, cw, ch)

    const mercW = mxMax - mxMin, mercH = myMax - myMin
    const mapAspect = mercW / mercH, canvasAspect = cw / ch
    let scale: number, offsetX = 0, offsetY = 0
    if (canvasAspect > mapAspect) { scale = ch / mercH; offsetX = (cw - mercW * scale) / 2 }
    else { scale = cw / mercW; offsetY = (ch - mercH * scale) / 2 }

    function getPos(lon: number, lat: number): [number, number] {
      const [mx, my] = toMercator(lon, lat)
      return [(mx - mxMin) * scale + offsetX, (my - myMin) * scale + offsetY]
    }

    if (geoData) {
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.5
      geoData.features.forEach((f: any) => {
        const drawPoly = (ring: number[][]) => {
          ctx.beginPath()
          ring.forEach(([lon, lat], i) => {
            const [px, py] = getPos(lon, lat)
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
          })
          ctx.fill(); ctx.stroke()
        }
        if (f.geometry?.type === 'Polygon') drawPoly(f.geometry.coordinates[0])
        else if (f.geometry?.type === 'MultiPolygon') f.geometry.coordinates.forEach((p: any) => drawPoly(p[0]))
      })
    }

    routes.forEach(r => {
      const [ox, oy] = getPos(r.origin.lon, r.origin.lat)
      const [dx, dy] = getPos(r.destination.lon, r.destination.lat)
      const midX = (ox + dx) / 2, midY = (oy + dy) / 2
      const cpX = midX + (dy - oy) * 0.2, cpY = midY - (dx - ox) * 0.2

      // Shadow/Glow
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
      ctx.strokeStyle = r.color + '33'; ctx.lineWidth = 6; ctx.stroke()

      // Main line
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
      ctx.strokeStyle = r.color; ctx.lineWidth = 2.5
      if (r.isDashed) {
        ctx.setLineDash([8, 6])
        ctx.lineDashOffset = -timeRef.current * 0.4
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Dots & Labels
      ctx.font = '600 10px "Inter", sans-serif'
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      
      const points: { p: [number, number], label?: string }[] = [
        { p: [ox, oy], label: r.origin.label },
        { p: [dx, dy], label: r.destination.label }
      ]
      
      points.forEach(({ p: [px, py], label }) => {
        // Port dot (WorldMap style)
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'; ctx.fill()
        ctx.lineWidth = 2; ctx.strokeStyle = '#0f172a'; ctx.stroke()
        
        if (label) {
          ctx.fillStyle = '#000000'
          ctx.fillText(label.replace(/_/g, ' '), px, py - 10)
        }
      })
    })
  }, [geoData, routes])

  useEffect(() => {
    let req: number
    const loop = () => {
      timeRef.current += 1
      draw()
      req = requestAnimationFrame(loop)
    }
    req = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(req)
  }, [draw])

  return (
    <div ref={wrapRef} className="w-full h-full bg-[#f8fafc] rounded-xl overflow-hidden border border-slate-200">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
