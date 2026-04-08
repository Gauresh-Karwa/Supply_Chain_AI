'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { Shipment } from '@/types'

const PORT_DATA: Record<string, { lon: number; lat: number; label: string }> = {
  'Shanghai':   { lon: 121.5, lat: 31.2,  label: 'Shanghai'    },
  'Singapore':  { lon: 103.8, lat:  1.4,  label: 'Singapore'   },
  'Rotterdam':  { lon:   4.5, lat: 51.9,  label: 'Rotterdam'   },
  'Dubai':      { lon:  55.3, lat: 25.2,  label: 'Dubai'       },
  'Mumbai':     { lon:  72.8, lat: 18.9,  label: 'Mumbai'      },
  'Colombo':    { lon:  79.9, lat:  6.9,  label: 'Colombo'     },
  'Busan':      { lon: 129.1, lat: 35.2,  label: 'Busan'       },
  'Hong_Kong':  { lon: 114.2, lat: 22.3,  label: 'Hong Kong'   },
  'Hamburg':    { lon:  10.0, lat: 53.6,  label: 'Hamburg'     },
  'Antwerp':    { lon:   4.4, lat: 51.2,  label: 'Antwerp'     },
  'Piraeus':    { lon:  23.6, lat: 37.9,  label: 'Piraeus'     },
  'Karachi':    { lon:  67.0, lat: 24.9,  label: 'Karachi'     },
  'Djibouti':   { lon:  43.1, lat: 11.6,  label: 'Djibouti'    },
  'Port_Klang': { lon: 101.4, lat:  3.0,  label: 'Port Klang'  },
}

// True Web Mercator Projection (Industry Standard - Same as Google Maps)
function toMercator(lon: number, lat: number) {
  const x = (lon + 180) / 360
  const latRad = lat * Math.PI / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = 0.5 - (mercN / (2 * Math.PI))
  return [x, y]
}

// Bounding box targeting the primary global trade hemisphere
const MAP_BOUNDS = { lonMin: -20, lonMax: 150, latMin: -35, latMax: 65 }
const [mxMin, myMin] = toMercator(MAP_BOUNDS.lonMin, MAP_BOUNDS.latMax) // Top-Left
const [mxMax, myMax] = toMercator(MAP_BOUNDS.lonMax, MAP_BOUNDS.latMin) // Bottom-Right

interface Props { shipments: Shipment[] }

export default function WorldMap({ shipments }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  
  const [geoData, setGeoData] = useState<any>(null)
  const zoom       = useRef(1)
  const pan        = useRef({ x: 0, y: 0 })
  const dragging   = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })
  const shipRef    = useRef<Shipment[]>([])
  const routeIdxRef = useRef<Record<string, number>>({})
  const timeRef    = useRef(0)
  const reqRef     = useRef<number>()

  shipRef.current = shipments

  // 1. Fetch real-world map borders (GeoJSON)
  useEffect(() => {
    // Fast, lightweight open-source dataset for world borders
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error('Failed to load map data', err))
  }, [])

  useEffect(() => {
    const seen: Record<string, number> = {}
    routeIdxRef.current = {}
    shipments.forEach(s => {
      const key = `${s.origin}|${s.destination}`
      routeIdxRef.current[s.id] = seen[key] ?? 0
      seen[key] = (seen[key] ?? 0) + 1
    })
  }, [shipments])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    
    const dpr = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    const cw = rect.width
    const ch = rect.height

    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
    }

    const ctx = canvas.getContext('2d')!
    ctx.resetTransform()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cw, ch)

    // Deep water color
    ctx.fillStyle = '#f8fafc' 
    ctx.fillRect(0, 0, cw, ch)

    if (!geoData) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '13px sans-serif'
      ctx.fillText('Loading real-world geographic data...', cw / 2 - 120, ch / 2)
      return
    }

    // --- 2. Advanced Aspect Ratio Lock ---
    // This guarantees the map NEVER squashes, no matter how the browser resizes.
    const mercWidth = mxMax - mxMin
    const mercHeight = myMax - myMin
    const mapAspect = mercWidth / mercHeight
    const canvasAspect = cw / ch

    let scale: number, offsetX = 0, offsetY = 0
    if (canvasAspect > mapAspect) {
      scale = ch / mercHeight
      offsetX = (cw - (mercWidth * scale)) / 2
    } else {
      scale = cw / mercWidth
      offsetY = (ch - (mercHeight * scale)) / 2
    }

    // Universal coordinate converter
    function getPos(lon: number, lat: number): [number, number] {
      const [mx, my] = toMercator(lon, lat)
      const baseX = (mx - mxMin) * scale + offsetX
      const baseY = (my - myMin) * scale + offsetY
      const zx = baseX * zoom.current + pan.current.x * zoom.current + (cw - cw * zoom.current) / 2
      const zy = baseY * zoom.current + pan.current.y * zoom.current + (ch - ch * zoom.current) / 2
      return [zx, zy]
    }

    // --- 3. Draw Accurate Real-World Borders ---
    ctx.fillStyle = '#e2e8f0' // Sleek grey landmasses
    ctx.strokeStyle = '#ffffff' // Crisp white borders
    ctx.lineWidth = 1

    geoData.features.forEach((feature: any) => {
      const drawPoly = (ring: number[][]) => {
        ctx.beginPath()
        ring.forEach(([lon, lat], i) => {
          const [x, y] = getPos(lon, lat)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }

      if (feature.geometry?.type === 'Polygon') {
        drawPoly(feature.geometry.coordinates[0])
      } else if (feature.geometry?.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach((poly: any) => drawPoly(poly[0]))
      }
    })

    // --- 4. Draw Sleek, Tight Routes ---
    const sorted = [...shipRef.current].sort((a, b) => a.risk_score - b.risk_score)
    const activePorts = new Set<string>()

    sorted.forEach((s) => {
      const o = PORT_DATA[s.origin]
      const d = PORT_DATA[s.destination]
      if (!o || !d) return

      activePorts.add(s.origin)
      activePorts.add(s.destination)

      const [ox, oy] = getPos(o.lon, o.lat)
      const [dx, dy] = getPos(d.lon, d.lat)

      const ddx = dx - ox, ddy = dy - oy
      const len = Math.hypot(ddx, ddy) || 1
      const normX = ddx / len, normY = ddy / len
      const perpX = -normY, perpY = normX

      // Tightened spacing to reduce messiness
      const routeIdx = routeIdxRef.current[s.id] ?? 0
      const totalForPair = shipRef.current.filter(x => x.origin === s.origin && x.destination === s.destination).length
      const offsetAmt = totalForPair > 1 ? (routeIdx - (totalForPair - 1) / 2) * (5 * zoom.current) : 0

      const sox = ox + perpX * offsetAmt
      const soy = oy + perpY * offsetAmt
      const sdx = dx + perpX * offsetAmt
      const sdy = dy + perpY * offsetAmt

      const midX = (sox + sdx) / 2
      const midY = (soy + sdy) / 2
      
      // Significantly reduced curvature for a tighter, cleaner look
      const curvature = len * 0.10
      const cx = midX + perpX * curvature
      const cy = midY + perpY * curvature

      let color = '#10b981'
      if (s.risk_score >= 0.70) color = '#ef4444'
      else if (s.risk_score >= 0.45) color = '#f59e0b'

      ctx.beginPath()
      ctx.moveTo(sox, soy)
      ctx.quadraticCurveTo(cx, cy, sdx, sdy)
      
      ctx.strokeStyle = color
      ctx.lineWidth   = s.risk_score >= 0.70 ? 2 : 1.5
      ctx.globalAlpha = 0.9
      
      if (s.risk_score >= 0.70) {
        ctx.setLineDash([6, 6])
        ctx.lineDashOffset = -timeRef.current * 0.4
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Traveling Dot
      const speed = 0.0008
      const t = ((timeRef.current * speed) + (routeIdx * 0.2)) % 1
      const shipX = (1-t)*(1-t)*sox + 2*(1-t)*t*cx + t*t*sdx
      const shipY = (1-t)*(1-t)*soy + 2*(1-t)*t*cy + t*t*sdy

      ctx.beginPath()
      ctx.arc(shipX, shipY, 3.5 * zoom.current, 0, Math.PI*2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = color
      ctx.stroke()
    })

    // --- 5. Precise Port Markers ---
    Object.entries(PORT_DATA).forEach(([key, port]) => {
      const [x, y] = getPos(port.lon, port.lat)
      const isActive = activePorts.has(key)
      if (!isActive) return

      const hasHigh = shipRef.current.some(s => (s.origin === key || s.destination === key) && s.risk_score >= 0.70)
      const fill = hasHigh ? '#ef4444' : '#0f172a'

      if (hasHigh) {
        const pulse = (Math.sin(timeRef.current * 0.05) + 1) / 2
        ctx.beginPath()
        ctx.arc(x, y, (4 + pulse * 3) * zoom.current, 0, Math.PI*2)
        ctx.fillStyle = `rgba(239, 68, 68, ${0.2 * (1-pulse)})`
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(x, y, 4 * zoom.current, 0, Math.PI*2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = fill
      ctx.stroke()

      ctx.font = `600 ${Math.max(10, Math.min(12, 11 * zoom.current))}px "Inter", -apple-system, sans-serif`
      ctx.fillStyle = '#0f172a'
      ctx.fillText(port.label, x + 6, y + 4)
    })
  }, [geoData])

  useEffect(() => {
    function loop() {
      timeRef.current += 1
      draw()
      reqRef.current = requestAnimationFrame(loop)
    }
    reqRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(reqRef.current!)
  }, [draw])

  // Mouse controls
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      pan.current.x += (mx - lastMouse.current.x) / zoom.current
      pan.current.y += (my - lastMouse.current.y) / zoom.current
      lastMouse.current = { x: mx, y: my }
    }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current  = true
    const rect = canvasRef.current!.getBoundingClientRect()
    lastMouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const onMouseUp = useCallback(() => { dragging.current = false }, [])
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    zoom.current = Math.min(Math.max(zoom.current * (e.deltaY < 0 ? 1.15 : 0.85), 0.5), 6)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas?.removeEventListener('wheel', onWheel)
  }, [onWheel])

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-[320px] shrink-0 bg-[#f8fafc] overflow-hidden rounded-xl border border-slate-200 shadow-sm"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false }}
      />
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
        {[
          { label: '+', action: () => { zoom.current = Math.min(zoom.current + 0.5, 6) } },
          { label: '−', action: () => { zoom.current = Math.max(zoom.current - 0.5, 0.5) } },
          { label: '⊙', action: () => { zoom.current = 1; pan.current = { x: 0, y: 0 } } },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            className="w-7 h-7 rounded bg-white border border-slate-200 shadow-sm text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center text-sm"
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}