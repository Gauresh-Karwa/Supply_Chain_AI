'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { Shipment } from '@/types'

// AIS vessel name generator (deterministic off shipment id)
function getVesselName(id: string): string {
  const names = ['EVER GIVEN','MSC GÜLSÜN','COSCO SHIPPING','HMM ALGECIRAS',
    'MADRID MAERSK','OOCL HONG KONG','CMA CGM ANTOINE','ZIM INTEGRATED',
    'YANG MING WISH','ONE INNOVATION','EVERGREEN LIGHT','HAPAG BERLIN',
    'COSCO GLORY','MSC OSCAR','MAERSK MC-KINNEY','OOCL GERMANY']
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return names[hash % names.length]
}

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
  'Los_Angeles':{ lon:-118.2, lat: 34.1,  label: 'Los Angeles' },
  'New_York':   { lon: -74.0, lat: 40.7,  label: 'New York'    },
  'Santos':     { lon: -46.3, lat:-24.0,  label: 'Santos'      },
  'Sydney':     { lon: 151.2, lat:-33.9,  label: 'Sydney'      },
  'Melbourne':  { lon: 145.0, lat:-37.8,  label: 'Melbourne'   },
  'Tokyo':      { lon: 139.7, lat: 35.7,  label: 'Tokyo'       },
  'Yokohama':   { lon: 139.6, lat: 35.4,  label: 'Yokohama'    },
  'Shenzhen':   { lon: 114.1, lat: 22.5,  label: 'Shenzhen'    },
  'Ningbo':     { lon: 121.5, lat: 29.9,  label: 'Ningbo'      },
  'Qingdao':    { lon: 120.3, lat: 36.1,  label: 'Qingdao'     },
  'Kaohsiung':  { lon: 120.3, lat: 22.6,  label: 'Kaohsiung'   },
  'Houston':    { lon: -95.4, lat: 29.8,  label: 'Houston'     },
  'Savannah':   { lon: -81.1, lat: 32.1,  label: 'Savannah'    },
  'Miami':      { lon: -80.2, lat: 25.8,  label: 'Miami'       },
  'Seattle':    { lon:-122.3, lat: 47.6,  label: 'Seattle'     },
  'Vancouver':  { lon:-123.1, lat: 49.3,  label: 'Vancouver'   },
  'Valparaiso': { lon: -71.6, lat:-33.0,  label: 'Valparaiso'  },
  'Callao':     { lon: -77.1, lat:-12.1,  label: 'Callao'      },
  'Buenos_Aires':{lon: -58.4, lat:-34.6,  label: 'Buenos Aires'},
  'Felixstowe': { lon:   1.3, lat: 51.9,  label: 'Felixstowe'  },
  'Algeciras':  { lon:  -5.4, lat: 36.1,  label: 'Algeciras'   },
  'Valencia':   { lon:  -0.4, lat: 39.5,  label: 'Valencia'    },
  'Genoa':      { lon:   8.9, lat: 44.4,  label: 'Genoa'       },
  'Alexandria': { lon:  29.9, lat: 31.2,  label: 'Alexandria'  },
  'Cape_Town':  { lon:  18.4, lat:-33.9,  label: 'Cape Town'   },
  'Vladivostok':{ lon: 131.8, lat: 43.1,  label: 'Vladivostok' },
  'St_Petersburg':{lon: 30.3, lat: 59.9,  label: 'St. Petersburg'},
  'Auckland':   { lon: 174.7, lat:-36.8,  label: 'Auckland'    },
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
const MAP_BOUNDS = { lonMin: -130, lonMax: 160, latMin: -45, latMax: 65 }
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
  const mousePos   = useRef({ x: -1000, y: -1000 })
  const [tooltip, setTooltip] = useState<{
    x: number; y: number;
    vessel: string; status: string;
    risk: number; delay: number;
    origin: string; dest: string;
    etaDays: number; speed: string;
  } | null>(null)
  const tooltipRef = useRef(tooltip)
  
  shipRef.current = shipments
  tooltipRef.current = tooltip

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
    let newTooltip: typeof tooltip = null

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
      // Offset applies only to curve control point to bundle the departure/arrivals
      const offsetAmt = totalForPair > 1 ? (routeIdx - (totalForPair - 1) / 2) * (12 * zoom.current) : 0

      const sox = ox
      const soy = oy
      const sdx = dx
      const sdy = dy

      const midX = (ox + dx) / 2
      const midY = (oy + dy) / 2
      
      const curvature = len * 0.15
      const cx = midX + perpX * (curvature + offsetAmt)
      const cy = midY + perpY * (curvature + offsetAmt)

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

      // --- AIS Vessel Tracking ---
      // seed t from departure_time so each vessel has a unique, realistic position
      const depMs     = new Date(s.departure_time).getTime()
      const nowMs     = Date.now()
      const seaSpeedKnots = s.risk_score >= 0.70 ? 10 : 14  // Slower when at-risk
      const routeKm   = 15000  // proxy; real distance tracked via route data
      const transitMs = (routeKm / (seaSpeedKnots * 1.852)) * 3600 * 1000
      const elapsed   = Math.max(0, nowMs - depMs)
      const baseT     = Math.min(elapsed / transitMs, 0.99)
      
      // Overlay a slow animation tick on top of the realistic base position
      const animSpeed = 0.00015
      const animT     = (baseT + timeRef.current * animSpeed) % 1
      const t = animT

      const shipX = (1-t)*(1-t)*sox + 2*(1-t)*t*cx + t*t*sdx
      const shipY = (1-t)*(1-t)*soy + 2*(1-t)*t*cy + t*t*sdy
      
      // Compute heading direction from bezier tangent
      const dt = 0.01
      const t2 = Math.min(t + dt, 0.99)
      const nx = (1-t2)*(1-t2)*sox + 2*(1-t2)*t2*cx + t2*t2*sdx
      const ny = (1-t2)*(1-t2)*soy + 2*(1-t2)*t2*cy + t2*t2*sdy
      const angle = Math.atan2(ny - shipY, nx - shipX)

      const vesselSize = 5 * Math.min(zoom.current, 2)
      
      // Check if mouse is hovering this vessel
      const isVesselHovered = Math.hypot(shipX - mousePos.current.x, shipY - mousePos.current.y) < 12
      
      // Draw vessel body: arrow shape
      ctx.save()
      ctx.translate(shipX, shipY)
      ctx.rotate(angle)
      
      // Outer glow for at-risk vessels
      if (s.risk_score >= 0.70 || isVesselHovered) {
        ctx.shadowColor = color
        ctx.shadowBlur  = isVesselHovered ? 12 : 6
      }
      
      ctx.beginPath()
      ctx.moveTo(vesselSize * 1.8, 0)              // nose
      ctx.lineTo(-vesselSize, vesselSize * 0.7)    // stern-port
      ctx.lineTo(-vesselSize * 0.5, 0)             // stern notch
      ctx.lineTo(-vesselSize, -vesselSize * 0.7)   // stern-starboard
      ctx.closePath()
      ctx.fillStyle = isVesselHovered ? '#ffffff' : color
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.restore()
      
      // Store hover data
      if (isVesselHovered) {
        const etaDays = Math.max(0, Math.round((1 - t) * (transitMs / 86400000)))
        const knotsDisplay = seaSpeedKnots + (Math.sin(timeRef.current * 0.01 + routeIdx) * 0.5).toFixed(1)
        newTooltip = {
          x: shipX, y: shipY,
          vessel: getVesselName(s.id),
          status: s.status,
          risk: s.risk_score,
          delay: s.predicted_delay_days,
          origin: s.origin.replace(/_/g, ' '),
          dest: s.destination.replace(/_/g, ' '),
          etaDays,
          speed: `${seaSpeedKnots} kn`,
        }
      }
    }) // end sorted.forEach

    // Commit tooltip state only if changed
    if (JSON.stringify(newTooltip) !== JSON.stringify(tooltipRef.current)) {
      setTooltip(newTooltip)
    }

    // --- 5. Precise Port Markers ---
    const renderPorts = Object.entries(PORT_DATA)
      .map(([key, port]) => {
        const [x, y] = getPos(port.lon, port.lat)
        const hasHigh = shipRef.current.some(s => (s.origin === key || s.destination === key) && s.risk_score >= 0.70)
        const isHovered = Math.hypot(x - mousePos.current.x, y - mousePos.current.y) < 15
        return { key, port, x, y, hasHigh, isHovered }
      })
      .filter(p => activePorts.has(p.key))

    // Draw all dots first (so they sit underneath labels)
    renderPorts.forEach(({ x, y, hasHigh }) => {
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
    })

    // Draw Labels with Collision Detection
    ctx.font = `600 ${Math.max(10, Math.min(12, 11 * zoom.current))}px "Inter", -apple-system, sans-serif`
    ctx.fillStyle = '#0f172a'
    const drawnLabels: { l: number, r: number, t: number, b: number }[] = []

    // Sort to prioritize important labels claiming screen space first
    const sortedLabels = [...renderPorts].sort((a, b) => {
      if (a.isHovered && !b.isHovered) return -1
      if (!a.isHovered && b.isHovered) return 1
      if (a.hasHigh && !b.hasHigh) return -1
      if (!a.hasHigh && b.hasHigh) return 1
      return 0
    })

    sortedLabels.forEach(({ port, x, y, hasHigh, isHovered }) => {
      if (!isHovered && !hasHigh && zoom.current < 2.5) return
      
      const width = ctx.measureText(port.label).width
      const box = { l: x + 4, r: x + 8 + width, t: y - 10, b: y + 6 }
      
      const collision = drawnLabels.some(b => 
        !(box.r < b.l || box.l > b.r || box.b < b.t || box.t > b.b)
      )
      
      // Hovered labels bypass collision to guarantee visibility
      if (!collision || isHovered) {
        // Draw crisp text background to mask crossing lines
        ctx.fillStyle = 'rgba(248, 250, 252, 0.8)'
        ctx.fillRect(box.l, box.t, box.r - box.l, box.b - box.t)
        
        ctx.fillStyle = '#0f172a'
        ctx.fillText(port.label, x + 6, y + 4)
        drawnLabels.push(box)
      }
    })
  }, [geoData, setTooltip])

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
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    mousePos.current = { x: mx, y: my }
    
    if (dragging.current) {
      pan.current.x += (mx - lastMouse.current.x) / zoom.current
      pan.current.y += (my - lastMouse.current.y) / zoom.current
    }
    lastMouse.current = { x: mx, y: my }
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
      {/* AIS Vessel Tooltip */}
      {tooltip && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 14, 999),
            top:  Math.max(tooltip.y - 80, 4),
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur-sm text-white rounded-xl shadow-xl border border-slate-700 px-3 py-2.5 min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold tracking-wide text-white">{tooltip.vessel}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                tooltip.risk >= 0.70 ? 'bg-red-500/30 text-red-300'
                : tooltip.risk >= 0.45 ? 'bg-amber-500/30 text-amber-300'
                : 'bg-emerald-500/30 text-emerald-300'
              }`}>
                {tooltip.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mb-2">{tooltip.origin} → {tooltip.dest}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <span className="text-slate-400">Risk</span>
              <span className={`font-semibold ${
                tooltip.risk >= 0.70 ? 'text-red-400' : tooltip.risk >= 0.45 ? 'text-amber-400' : 'text-emerald-400'
              }`}>{Math.round(tooltip.risk * 100)}%</span>
              <span className="text-slate-400">Speed</span>
              <span className="text-white font-medium">{tooltip.speed}</span>
              <span className="text-slate-400">ETA</span>
              <span className="text-white font-medium">{tooltip.etaDays}d remaining</span>
              {tooltip.delay > 0 && <>
                <span className="text-slate-400">Delay est.</span>
                <span className="text-amber-400 font-semibold">+{tooltip.delay.toFixed(1)} days</span>
              </>}
            </div>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false; mousePos.current = { x: -1000, y: -1000 } }}
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