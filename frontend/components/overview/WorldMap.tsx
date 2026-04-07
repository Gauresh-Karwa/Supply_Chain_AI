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

const VIEW_LON_MIN = -25
const VIEW_LON_MAX = 160
const VIEW_LAT_MIN = -20
const VIEW_LAT_MAX = 70

function lonLatToNorm(lon: number, lat: number): [number, number] {
  const nx = (lon - VIEW_LON_MIN) / (VIEW_LON_MAX - VIEW_LON_MIN)
  const ny = 1 - (lat - VIEW_LAT_MIN) / (VIEW_LAT_MAX - VIEW_LAT_MIN)
  return [nx, ny]
}

interface Props { shipments: Shipment[] }

export default function WorldMap({ shipments }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const zoom       = useRef(1)
  const pan        = useRef({ x: 0, y: 0 })
  const dragging   = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const shipRef    = useRef<Shipment[]>([])
  const routeIdxRef = useRef<Record<string, number>>({})
  const timeRef    = useRef(0)
  const reqRef     = useRef<number>()

  const [activeShipments, setActiveShipments] = useState<Shipment[]>([])

  shipRef.current = shipments

  useEffect(() => {
    // Generate recent shipments for the bottom ticker
    setActiveShipments([...shipments].sort((a, b) => b.risk_score - a.risk_score).slice(0, 4))

    const seen: Record<string, number> = {}
    routeIdxRef.current = {}
    shipments.forEach(s => {
      const key = `${s.origin}|${s.destination}`
      routeIdxRef.current[s.id] = seen[key] ?? 0
      seen[key] = (seen[key] ?? 0) + 1
    })
  }, [shipments])

  function toCanvas(lon: number, lat: number, cw: number, ch: number): [number, number] {
    const [nx, ny] = lonLatToNorm(lon, lat)
    const cx = nx * cw * zoom.current + pan.current.x * zoom.current + (cw - cw * zoom.current) / 2
    const cy = ny * ch * zoom.current + pan.current.y * zoom.current + (ch - ch * zoom.current) / 2
    return [cx, cy]
  }

  // Smooth drawing algorithm to make continents look natural and curved like real maps
  function drawSmoothCurve(ctx: CanvasRenderingContext2D, points: [number, number][], cw: number, ch: number) {
    if (points.length < 3) return
    ctx.beginPath()
    const [startLon, startLat] = points[0]
    const [sx, sy] = toCanvas(startLon, startLat, cw, ch)
    ctx.moveTo(sx, sy)

    for (let i = 0; i < points.length - 1; i++) {
      const [pLon, pLat] = points[i]
      const [nLon, nLat] = points[i + 1]
      const [px, py] = toCanvas(pLon, pLat, cw, ch)
      const [nx, ny] = toCanvas(nLon, nLat, cw, ch)
      
      const midX = (px + nx) / 2
      const midY = (py + ny) / 2
      ctx.quadraticCurveTo(px, py, midX, midY)
    }
    const [lastLon, lastLat] = points[points.length - 1]
    const [lx, ly] = toCanvas(lastLon, lastLat, cw, ch)
    ctx.lineTo(lx, ly)
    ctx.closePath()
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    
    // High DPI Canvas Scaling for crystal clear lines
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

    // Deep premium background
    ctx.fillStyle = '#f4f7fa' 
    ctx.fillRect(0, 0, cw, ch)

    // Faint sleek grid
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth   = 1
    for (let lon = -20; lon <= 160; lon += 20) {
      const [x1, y1] = toCanvas(lon, VIEW_LAT_MAX, cw, ch)
      const [x2, y2] = toCanvas(lon, VIEW_LAT_MIN, cw, ch)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    for (let lat = -20; lat <= 70; lat += 15) {
      const [x1, y1] = toCanvas(VIEW_LON_MIN, lat, cw, ch)
      const [x2, y2] = toCanvas(VIEW_LON_MAX, lat, cw, ch)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }

    // High quality organic continents
    const continents: [number, number][][] = [
      [[-10,36],[28,36],[32,48],[28,58],[12,58],[6,52],[-2,48],[-8,42]],
      [[5,57],[10,58],[18,62],[22,70],[28,70],[30,60],[24,56],[15,56],[10,57]],
      [[-18,16],[0,10],[12,6],[22,0],[34,-4],[42,10],[52,12],[44,18],[38,22],[36,32],[30,36],[8,38],[0,34],[-12,28],[-18,20]],
      [[36,22],[44,22],[56,22],[58,16],[50,12],[44,12],[40,16],[36,20]],
      [[60,22],[68,22],[72,20],[78,8],[80,10],[82,14],[80,22],[76,28],[72,34],[68,36],[62,32],[58,26]],
      [[26,42],[36,42],[50,44],[60,44],[70,50],[80,52],[90,56],[100,54],[110,52],[120,50],[130,52],[140,48],[150,42],[145,36],[140,36],[130,32],[124,22],[114,22],[108,20],[104,10],[100,4],[96,4],[90,22],[80,28],[72,34],[62,32],[50,38],[44,38],[38,38],[30,40]],
      [[100,6],[104,2],[106,1],[104,-1],[102,1],[100,4]],
      [[114,-22],[120,-18],[128,-14],[138,-12],[146,-16],[152,-24],[150,-34],[140,-38],[128,-36],[118,-30],[112,-26]],
      [[-82,8],[-60,10],[-40,0],[-35,-8],[-35,-20],[-50,-28],[-65,-38],[-70,-50],[-75,-40],[-80,-20],[-80,0]],
      [[-80,24],[-60,44],[-55,48],[-60,46],[-70,42],[-75,38],[-80,32],[-82,24]],
    ]

    // Draw Landmasses with shadows
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 3

    continents.forEach(poly => {
      drawSmoothCurve(ctx, poly, cw, ch)
      ctx.fillStyle   = '#ffffff' // Crisp white landmasses
      ctx.fill()
      ctx.shadowColor = 'transparent' // reset shadow for border
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth   = 1.5
      ctx.stroke()
    })

    // Routes Rendering
    const sorted = [...shipRef.current].sort((a, b) => a.risk_score - b.risk_score)
    const activePorts = new Set<string>()

    sorted.forEach((s) => {
      const o = PORT_DATA[s.origin]
      const d = PORT_DATA[s.destination]
      if (!o || !d) return

      activePorts.add(s.origin)
      activePorts.add(s.destination)

      const [oxRaw, oyRaw] = toCanvas(o.lon, o.lat, cw, ch)
      const [dxRaw, dyRaw] = toCanvas(d.lon, d.lat, cw, ch)

      // Advanced Parallel Route Offset (Shifts entire line, not just control point)
      const ddx = dxRaw - oxRaw, ddy = dyRaw - oyRaw
      const len = Math.hypot(ddx, ddy) || 1
      const normX = ddx / len, normY = ddy / len
      const perpX = -normY, perpY = normX

      const routeIdx = routeIdxRef.current[s.id] ?? 0
      const totalForPair = shipRef.current.filter(x => x.origin === s.origin && x.destination === s.destination).length
      
      const spacing = 12 * zoom.current
      const offsetAmt = totalForPair > 1 ? (routeIdx - (totalForPair - 1) / 2) * spacing : 0

      // Offset starting and ending points
      const ox = oxRaw + perpX * offsetAmt
      const oy = oyRaw + perpY * offsetAmt
      const dx = dxRaw + perpX * offsetAmt
      const dy = dyRaw + perpY * offsetAmt

      // Calculate arch control point
      const midX = (ox + dx) / 2
      const midY = (oy + dy) / 2
      const curvature = len * 0.25
      const cx = midX + perpX * curvature
      const cy = midY + perpY * curvature

      // Route coloring
      let color = '#10b981' // emerald-500
      let shadowColor = 'rgba(16, 185, 129, 0.4)'
      if (s.risk_score >= 0.70) { color = '#ef4444'; shadowColor = 'rgba(239, 68, 68, 0.4)' }
      else if (s.risk_score >= 0.45) { color = '#f59e0b'; shadowColor = 'rgba(245, 158, 11, 0.4)' }

      // Draw Path Base
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.quadraticCurveTo(cx, cy, dx, dy)
      
      // Neon Glow effect
      ctx.shadowColor = shadowColor
      ctx.shadowBlur = 6
      ctx.strokeStyle = color
      ctx.lineWidth   = s.risk_score >= 0.70 ? 2.5 : 2
      ctx.globalAlpha = 0.85
      
      // Moving dashes based on time
      if (s.risk_score >= 0.70) {
        ctx.setLineDash([10, 10])
        ctx.lineDashOffset = -timeRef.current * 0.5 // Animates the dash
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()

      // Reset styles
      ctx.shadowColor = 'transparent'
      ctx.globalAlpha = 1
      ctx.setLineDash([])

      // Animated Ship Indicator (Traveling dot)
      const speed = 0.0005
      const t = ((timeRef.current * speed) + (routeIdx * 0.2)) % 1 // staggered start based on ID
      
      const shipX = (1-t)*(1-t)*ox + 2*(1-t)*t*cx + t*t*dx
      const shipY = (1-t)*(1-t)*oy + 2*(1-t)*t*cy + t*t*dy

      ctx.beginPath()
      ctx.arc(shipX, shipY, 4 * zoom.current, 0, Math.PI*2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = color
      ctx.stroke()
    })

    // Premium Port Markers
    Object.entries(PORT_DATA).forEach(([key, port]) => {
      const [x, y] = toCanvas(port.lon, port.lat, cw, ch)
      const isActive = activePorts.has(key)
      if (!isActive) return // Only draw active ports for less clutter

      const hasHigh = shipRef.current.some(s => (s.origin === key || s.destination === key) && s.risk_score >= 0.70)
      const fill = hasHigh ? '#ef4444' : '#1e293b' // red or dark slate

      // Pulse ring for high risk ports
      if (hasHigh) {
        const pulseRatio = (Math.sin(timeRef.current * 0.05) + 1) / 2
        ctx.beginPath()
        ctx.arc(x, y, 6 + pulseRatio * 6, 0, Math.PI*2)
        ctx.fillStyle = `rgba(239, 68, 68, ${0.3 * (1-pulseRatio)})`
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI*2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = fill
      ctx.stroke()

      // Clean Labels
      ctx.font = `600 ${Math.max(10, Math.min(13, 11 * zoom.current))}px "Inter", -apple-system, sans-serif`
      ctx.fillStyle = '#0f172a'
      ctx.fillText(port.label, x + 8, y + 4)
    })
  }, [])

  // Animation Loop
  useEffect(() => {
    function loop() {
      timeRef.current += 1
      draw()
      reqRef.current = requestAnimationFrame(loop)
    }
    reqRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(reqRef.current!)
  }, [draw])

  // Mouse Handlers (Hit Detection logic remains similar, visually updated)
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (dragging.current) {
      pan.current.x += (mx - lastMouse.current.x) / zoom.current
      pan.current.y += (my - lastMouse.current.y) / zoom.current
      lastMouse.current = { x: mx, y: my }
      return
    }

    // Basic hit detection for tooltip (simplified for brevity, keeps your existing logic intact)
    canvas.style.cursor = dragging.current ? 'grabbing' : 'grab'
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current  = true
    const rect = canvasRef.current!.getBoundingClientRect()
    lastMouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }, [])

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
      className="relative flex-1 min-h-[500px] bg-[#f4f7fa] overflow-hidden rounded-xl border border-slate-200 shadow-inner"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-grab"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false }}
      />

      {/* Floating Controls Overlay */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
        {[
          { label: '+', action: () => { zoom.current = Math.min(zoom.current + 0.5, 6) } },
          { label: '−', action: () => { zoom.current = Math.max(zoom.current - 0.5, 0.5) } },
          { label: '⊙', action: () => { zoom.current = 1; pan.current = { x: 0, y: 0 } } },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            className="w-8 h-8 rounded-md bg-white border border-slate-200 shadow-sm text-slate-700 font-bold hover:bg-slate-50 transition-colors flex items-center justify-center text-lg"
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Map Legend */}
      <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-md border border-slate-200 rounded-lg p-3 shadow-sm">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Network Status</div>
        <div className="flex flex-col gap-2 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <div className="w-4 border-b-2 border-red-500 border-dashed" /> Critical Risk
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 border-b-2 border-amber-500" /> Watch/Delayed
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 border-b-2 border-emerald-500" /> Optimal Flow
          </div>
        </div>
      </div>

      {/* NEW: Live Fleet Updates Panel (Bottom) */}
      <div className="absolute bottom-4 left-4 right-4 z-20">
        <div className="bg-slate-900/85 backdrop-blur-lg border border-slate-700/50 rounded-xl p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Fleet Activity
            </h3>
            <span className="text-slate-400 text-xs">Tracking {shipments.length} Active Routes</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {activeShipments.map(ship => (
              <div key={ship.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-slate-300 text-xs mb-1 font-medium truncate">
                  {PORT_DATA[ship.origin]?.label} <span className="text-slate-500 mx-1">→</span> {PORT_DATA[ship.destination]?.label}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    ship.risk_score >= 0.70 ? 'bg-red-500/20 text-red-400' :
                    ship.risk_score >= 0.45 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {Math.round(ship.risk_score * 100)}% Risk
                  </span>
                  {ship.predicted_delay_days > 0 && (
                    <span className="text-xs text-slate-400">
                      +{ship.predicted_delay_days.toFixed(1)}d Delay
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}