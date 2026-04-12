'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts'
import { Shipment } from '@/types'
import { fetchShipments } from '@/lib/api'

interface PortCongestion {
  port_name: string
  vessels_waiting: number
  avg_wait_hours: number
  congestion_score: number
  last_updated: string
}

const PORT_DATA: Record<string, { lon: number; lat: number; label: string }> = {
  'Shanghai':     { lon: 121.5, lat: 31.2,  label: 'Shanghai'     },
  'Singapore':    { lon: 103.8, lat:  1.4,  label: 'Singapore'    },
  'Rotterdam':    { lon:   4.5, lat: 51.9,  label: 'Rotterdam'    },
  'Dubai':        { lon:  55.3, lat: 25.2,  label: 'Dubai'        },
  'Mumbai':       { lon:  72.8, lat: 18.9,  label: 'Mumbai'       },
  'Colombo':      { lon:  79.9, lat:  6.9,  label: 'Colombo'      },
  'Busan':        { lon: 129.1, lat: 35.2,  label: 'Busan'        },
  'Hong_Kong':    { lon: 114.2, lat: 22.3,  label: 'Hong Kong'    },
  'Hamburg':      { lon:  10.0, lat: 53.6,  label: 'Hamburg'      },
  'Antwerp':      { lon:   4.4, lat: 51.2,  label: 'Antwerp'      },
  'Piraeus':      { lon:  23.6, lat: 37.9,  label: 'Piraeus'      },
  'Karachi':      { lon:  67.0, lat: 24.9,  label: 'Karachi'      },
  'Djibouti':     { lon:  43.1, lat: 11.6,  label: 'Djibouti'     },
  'Port_Klang':   { lon: 101.4, lat:  3.0,  label: 'Port Klang'   },
  'Los_Angeles':  { lon:-118.2, lat: 34.1,  label: 'Los Angeles'  },
  'New_York':     { lon: -74.0, lat: 40.7,  label: 'New York'     },
  'Santos':       { lon: -46.3, lat:-24.0,  label: 'Santos'       },
  'Sydney':       { lon: 151.2, lat:-33.9,  label: 'Sydney'       },
  'Melbourne':    { lon: 145.0, lat:-37.8,  label: 'Melbourne'    },
  'Tokyo':        { lon: 139.7, lat: 35.7,  label: 'Tokyo'        },
  'Ningbo':       { lon: 121.5, lat: 29.9,  label: 'Ningbo'       },
  'Qingdao':      { lon: 120.3, lat: 36.1,  label: 'Qingdao'      },
  'Houston':      { lon: -95.4, lat: 29.8,  label: 'Houston'      },
  'Savannah':     { lon: -81.1, lat: 32.1,  label: 'Savannah'     },
  'Cape_Town':    { lon:  18.4, lat:-33.9,  label: 'Cape Town'    },
  'Auckland':     { lon: 174.7, lat:-36.8,  label: 'Auckland'     },
  'Kaohsiung':    { lon: 120.3, lat: 22.6,  label: 'Kaohsiung'    },
  'Yokohama':     { lon: 139.6, lat: 35.4,  label: 'Yokohama'     },
  'Shenzhen':     { lon: 114.1, lat: 22.5,  label: 'Shenzhen'     },
  'Vladivostok':  { lon: 131.8, lat: 43.1,  label: 'Vladivostok'  },
  'Alexandria':   { lon:  29.9, lat: 31.2,  label: 'Alexandria'   },
  'Algeciras':    { lon:  -5.4, lat: 36.1,  label: 'Algeciras'    },
  'Genoa':        { lon:   8.9, lat: 44.4,  label: 'Genoa'        },
  'Valencia':     { lon:  -0.4, lat: 39.5,  label: 'Valencia'     },
  'Felixstowe':   { lon:   1.3, lat: 51.9,  label: 'Felixstowe'   },
  'Buenos_Aires': { lon: -58.4, lat:-34.6,  label: 'Buenos Aires' },
  'Callao':       { lon: -77.1, lat:-12.1,  label: 'Callao'       },
  'Valparaiso':   { lon: -71.6, lat:-33.0,  label: 'Valparaiso'   },
  'Miami':        { lon: -80.2, lat: 25.8,  label: 'Miami'        },
  'Seattle':      { lon:-122.3, lat: 47.6,  label: 'Seattle'      },
  'Vancouver':    { lon:-123.1, lat: 49.3,  label: 'Vancouver'    },
  'St_Petersburg':{ lon:  30.3, lat: 59.9,  label: 'St. Petersburg'},
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

function congestionColor(score: number): string {
  if (score >= 70) return '#ef4444'
  if (score >= 40) return '#f59e0b'
  return '#10b981'
}
function getCongestionMeta(score: number) {
  if (score >= 70) return { badge: 'bg-red-100 text-red-700', label: 'Critical' }
  if (score >= 40) return { badge: 'bg-amber-100 text-amber-700', label: 'Congested' }
  return { badge: 'bg-emerald-100 text-emerald-700', label: 'Clear' }
}

// ── Full GeoJSON Congestion World Map ──────────────────────────────────
function CongestionMap({
  ports, congestionMap, shipments, selectedPort, onSelectPort
}: {
  ports: PortCongestion[]
  congestionMap: Record<string, PortCongestion>
  shipments: Shipment[]
  selectedPort: PortCongestion | null
  onSelectPort: (p: PortCongestion) => void
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const geoRef     = useRef<any>(null)
  const zoom       = useRef(1)
  const pan        = useRef({ x: 0, y: 0 })
  const dragging   = useRef(false)
  const lastMouse  = useRef({ x: 0, y: 0 })
  const mousePos   = useRef({ x: -1000, y: -1000 })
  const timeRef    = useRef(0)
  const reqRef     = useRef(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; port: PortCongestion } | null>(null)

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json()).then(d => { geoRef.current = d }).catch(() => {})
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
      const bx = (mx - mxMin) * scale + offsetX
      const by = (my - myMin) * scale + offsetY
      return [
        bx * zoom.current + pan.current.x * zoom.current + (cw - cw * zoom.current) / 2,
        by * zoom.current + pan.current.y * zoom.current + (ch - ch * zoom.current) / 2,
      ]
    }

    // Land
    if (geoRef.current) {
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8
      geoRef.current.features.forEach((f: any) => {
        const draw = (ring: number[][]) => {
          ctx.beginPath()
          ring.forEach(([lon, lat], i) => {
            const [x, y] = getPos(lon, lat)
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.closePath(); ctx.fill(); ctx.stroke()
        }
        if (f.geometry?.type === 'Polygon') draw(f.geometry.coordinates[0])
        else if (f.geometry?.type === 'MultiPolygon') f.geometry.coordinates.forEach((p: any) => draw(p[0]))
      })
    } else {
      ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'
      ctx.fillText('Loading map…', cw / 2 - 50, ch / 2)
      return
    }

    // Inbound routes to selected port
    if (selectedPort) {
      const destCoords = PORT_DATA[selectedPort.port_name]
      if (destCoords) {
        const [dx, dy] = getPos(destCoords.lon, destCoords.lat)
        shipments.filter(s => s.destination === selectedPort.port_name).forEach(s => {
          const orig = PORT_DATA[s.origin]
          if (!orig) return
          const [ox, oy] = getPos(orig.lon, orig.lat)
          const midX = (ox + dx) / 2, midY = (oy + dy) / 2
          const cpX = midX + (dy - oy) * 0.18, cpY = midY - (dx - ox) * 0.18
          let color = '#10b981'
          if (s.risk_score >= 0.70) color = '#ef4444'
          else if (s.risk_score >= 0.45) color = '#f59e0b'
          // Glow
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
          ctx.strokeStyle = color + '40'; ctx.lineWidth = 6; ctx.globalAlpha = 0.5
          ctx.stroke()
          // Line
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
          ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.95
          if (s.risk_score >= 0.70) { ctx.setLineDash([6, 5]); ctx.lineDashOffset = -timeRef.current * 0.3 }
          else ctx.setLineDash([])
          ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
        })
      }
    }

    // Port dots
    let newTooltip: typeof tooltip = null
    Object.entries(PORT_DATA).forEach(([key, coord]) => {
      const cong = congestionMap[key]
      if (!cong) return
      const [x, y] = getPos(coord.lon, coord.lat)
      const score = cong.congestion_score
      const color = congestionColor(score)
      const isSelected = selectedPort?.port_name === key
      const isHovered = Math.hypot(x - mousePos.current.x, y - mousePos.current.y) < 14

      // Pulse ring for critical ports
      if (score >= 70 || isSelected) {
        const pulse = (Math.sin(timeRef.current * 0.05) + 1) / 2
        const r = (isSelected ? 14 : 10) + pulse * 5
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = color + (isSelected ? '50' : '30'); ctx.fill()
      }

      // Dot sized by vessels_waiting (3-10px)
      const dotR = Math.max(3, Math.min(10, 3 + (cong.vessels_waiting / 20))) * Math.min(zoom.current, 1.5)
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'; ctx.fill()
      ctx.strokeStyle = color; ctx.lineWidth = isSelected ? 2.5 : 1.8
      if (isSelected) { ctx.shadowColor = color; ctx.shadowBlur = 10 }
      ctx.stroke(); ctx.shadowBlur = 0

      // Label
      if (isSelected || isHovered || score >= 70) {
        ctx.fillStyle = 'rgba(248,250,252,0.88)'
        const lw = ctx.measureText(coord.label).width
        ctx.fillRect(x + dotR + 2, y - 8, lw + 6, 14)
        ctx.fillStyle = isSelected ? '#1d4ed8' : '#0f172a'
        ctx.font = `${isSelected ? '600' : '500'} 10px "Inter", sans-serif`
        ctx.fillText(coord.label, x + dotR + 5, y + 3)
      }

      if (isHovered) newTooltip = { x, y, port: cong }
    })

    if (JSON.stringify(newTooltip) !== JSON.stringify(tooltip)) setTooltip(newTooltip)
  }, [congestionMap, selectedPort, shipments, tooltip])

  useEffect(() => {
    const loop = () => { timeRef.current += 1; draw(); reqRef.current = requestAnimationFrame(loop) }
    reqRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(reqRef.current)
  }, [draw])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    mousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (dragging.current) {
      pan.current.x += (mousePos.current.x - lastMouse.current.x) / zoom.current
      pan.current.y += (mousePos.current.y - lastMouse.current.y) / zoom.current
    }
    lastMouse.current = { ...mousePos.current }
  }, [])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const cw = rect.width, ch = rect.height
    const mercW = mxMax - mxMin, mercH = myMax - myMin
    const mapAspect = mercW / mercH, canvasAspect = cw / ch
    let scale: number, offsetX = 0, offsetY = 0
    if (canvasAspect > mapAspect) { scale = ch / mercH; offsetX = (cw - mercW * scale) / 2 }
    else { scale = cw / mercW; offsetY = (ch - mercH * scale) / 2 }
    function getPos(lon: number, lat: number): [number, number] {
      const [mxc, myc] = toMercator(lon, lat)
      const bx = (mxc - mxMin) * scale + offsetX
      const by = (myc - myMin) * scale + offsetY
      return [bx * zoom.current + pan.current.x * zoom.current + (cw - cw * zoom.current) / 2,
              by * zoom.current + pan.current.y * zoom.current + (ch - ch * zoom.current) / 2]
    }
    for (const [key, coord] of Object.entries(PORT_DATA)) {
      const cong = congestionMap[key]
      if (!cong) continue
      const [px, py] = getPos(coord.lon, coord.lat)
      if (Math.hypot(mx - px, my - py) < 14) { onSelectPort(cong); break }
    }
  }, [congestionMap, onSelectPort])

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    zoom.current = Math.min(Math.max(zoom.current * (e.deltaY < 0 ? 1.15 : 0.87), 0.5), 8)
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas?.removeEventListener('wheel', onWheel)
  }, [onWheel])

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[#f8fafc] rounded-xl overflow-hidden border border-slate-200">
      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 flex gap-4 text-[10px] font-medium shadow-sm">
        {[['#ef4444','Critical (≥70)'],['#f59e0b','Congested (40-69)'],['#10b981','Clear (<40)']].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block border-2" style={{ borderColor: c, background: '#fff' }} />{l}
          </span>
        ))}
        <span className="text-slate-400 border-l border-slate-200 pl-3">Dot size = vessels waiting</span>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        {[['＋', () => { zoom.current = Math.min(zoom.current + 0.5, 8) }],
          ['－', () => { zoom.current = Math.max(zoom.current - 0.5, 0.5) }],
          ['⊙',  () => { zoom.current = 1; pan.current = { x: 0, y: 0 } }]].map(([l, a]) => (
          <button key={l as string} onClick={a as () => void}
            className="w-7 h-7 rounded bg-white border border-slate-200 shadow-sm text-slate-600 font-bold hover:bg-slate-50 flex items-center justify-center text-sm">
            {l as string}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute z-20 pointer-events-none"
          style={{ left: Math.min(tooltip.x + 14, 9999), top: Math.max(tooltip.y - 70, 4) }}>
          <div className="bg-slate-900/95 border border-slate-700 text-white rounded-xl shadow-xl px-3 py-2 min-w-[160px]">
            <p className="text-xs font-bold mb-1">{tooltip.port.port_name.replace(/_/g, ' ')}</p>
            <div className="grid grid-cols-2 gap-x-3 text-[10px]">
              <span className="text-slate-400">Score</span><span className="font-semibold" style={{ color: congestionColor(tooltip.port.congestion_score) }}>{tooltip.port.congestion_score.toFixed(0)}</span>
              <span className="text-slate-400">Vessels</span><span className="font-medium">{tooltip.port.vessels_waiting}</span>
              <span className="text-slate-400">Avg Wait</span><span className="font-medium">{tooltip.port.avg_wait_hours}h</span>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="block w-full h-full cursor-pointer"
        onMouseMove={onMouseMove} onClick={onClick}
        onMouseDown={e => { dragging.current = true; const r = canvasRef.current!.getBoundingClientRect(); lastMouse.current = { x: e.clientX - r.left, y: e.clientY - r.top } }}
        onMouseUp={() => { dragging.current = false }}
        onMouseLeave={() => { dragging.current = false; mousePos.current = { x: -1000, y: -1000 } }}
      />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────
export default function PortTrafficPage() {
  const [ports, setPorts] = useState<PortCongestion[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPort, setSelectedPort] = useState<PortCongestion | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const congestionMap: Record<string, PortCongestion> = {}
  ports.forEach(p => { congestionMap[p.port_name] = p })

  const loadData = useCallback(async () => {
    const [portRes, shipRes] = await Promise.all([
      fetch('http://localhost:8000/port-congestion').then(r => r.ok ? r.json() : { ports: [] }).catch(() => ({ ports: [] })),
      fetchShipments().catch(() => ({ shipments: [] }))
    ])
    const portList: PortCongestion[] = portRes.ports || []
    setPorts(portList)
    setShipments(shipRes.shipments || [])
    setLastRefresh(new Date())
    if (portList.length > 0) setSelectedPort(p => p ?? portList.sort((a, b) => b.congestion_score - a.congestion_score)[0])
    setLoading(false)
  }, [])

  useEffect(() => { loadData(); const t = setInterval(loadData, 60000); return () => clearInterval(t) }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetch('http://localhost:8000/port-congestion/refresh', { method: 'POST' }).catch(() => {})
    await loadData(); setRefreshing(false)
  }

  const critical = ports.filter(p => p.congestion_score >= 70)
  const congested = ports.filter(p => p.congestion_score >= 40 && p.congestion_score < 70)
  const clear = ports.filter(p => p.congestion_score < 40)
  const totalVessels = ports.reduce((s, p) => s + p.vessels_waiting, 0)
  const avgScore = ports.length > 0 ? ports.reduce((s, p) => s + p.congestion_score, 0) / ports.length : 0

  const chartData = [...ports].sort((a, b) => b.congestion_score - a.congestion_score).slice(0, 8).map(p => ({
    name: p.port_name.length > 10 ? p.port_name.replace(/_/g, ' ').substring(0, 10) + '…' : p.port_name.replace(/_/g, ' '),
    score: Math.round(p.congestion_score),
    color: congestionColor(p.congestion_score)
  }))
  const pieData = [
    { name: 'Critical', value: critical.length, fill: '#ef4444' },
    { name: 'Congested', value: congested.length, fill: '#f59e0b' },
    { name: 'Clear', value: clear.length, fill: '#10b981' },
  ].filter(d => d.value > 0)

  const inbound = selectedPort ? shipments.filter(s => s.destination === selectedPort.port_name) : []

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar
        title="Port Traffic Control"
        subtitle="Live global congestion matrix — click any port to inspect inbound fleet routes and berth analytics."
        badges={[
          { label: '● Live', color: 'green' as const },
          ...(critical.length > 0 ? [{ label: `${critical.length} Critical`, color: 'red' as const }] : [])
        ]}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <div className="max-w-none mx-auto space-y-5">

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ports Monitored', value: ports.length, color: 'text-slate-800' },
              { label: 'Freighters Queued', value: totalVessels, color: 'text-amber-600' },
              { label: 'Critical Ports', value: critical.length, color: 'text-red-600' },
              { label: 'Avg Congestion', value: avgScore.toFixed(1), color: 'text-blue-600' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">{k.label}</p>
                <p className={`text-3xl font-light ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-2">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-400">Connecting to traffic matrix…</p>
              </div>
            </div>
          ) : ports.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
              <p className="text-sm font-semibold text-amber-700 mb-3">No congestion data yet — run the Supabase SQL first, then seed below.</p>
              <button onClick={handleRefresh} disabled={refreshing} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-50">
                {refreshing ? 'Generating…' : 'Generate Port Traffic Data'}
              </button>
            </div>
          ) : (
            <>
              {/* ── Main Map ── */}
              <div className="w-full" style={{ height: 400 }}>
                <CongestionMap
                  ports={ports}
                  congestionMap={congestionMap}
                  shipments={shipments}
                  selectedPort={selectedPort}
                  onSelectPort={setSelectedPort}
                />
              </div>

              {/* ── Bottom Panel ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Port List */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 420 }}>
                  <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h3 className="text-sm font-semibold text-slate-800">Port Rankings</h3>
                    <button onClick={handleRefresh} disabled={refreshing}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-md font-medium transition disabled:opacity-50">
                      {refreshing ? '…' : '↻ Refresh'}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {[...ports].sort((a, b) => b.congestion_score - a.congestion_score).map(port => {
                      const isSelected = selectedPort?.port_name === port.port_name
                      const color = congestionColor(port.congestion_score)
                      return (
                        <div key={port.port_name} onClick={() => setSelectedPort(port)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'}`}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{port.port_name.replace(/_/g, ' ')}</p>
                            <p className="text-[10px] text-slate-400">{port.vessels_waiting} freighters · {port.avg_wait_hours}h wait</p>
                          </div>
                          <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden shrink-0">
                            <div className="h-full rounded-full" style={{ width: `${port.congestion_score}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 shrink-0">
                    <p className="text-[10px] text-slate-400">Updated {lastRefresh.toLocaleTimeString()}</p>
                  </div>
                </div>

                {/* Selected Port Detail + Inbound Table */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  {selectedPort && (() => {
                    const c = getCongestionMeta(selectedPort.congestion_score)
                    const color = congestionColor(selectedPort.congestion_score)
                    return (
                      <>
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                          <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-base font-semibold text-slate-900">{selectedPort.port_name.replace(/_/g, ' ')}</h2>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{c.label}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: 'Score', value: `${selectedPort.congestion_score.toFixed(0)}/100`, style: { color } },
                              { label: 'Freighters', value: selectedPort.vessels_waiting },
                              { label: 'Avg Wait', value: `${selectedPort.avg_wait_hours}h` },
                              { label: 'Est. Cost', value: `$${(selectedPort.avg_wait_hours / 24 * 15000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, style: undefined },
                              { label: 'Inbound', value: inbound.length },
                              { label: 'At-Risk', value: inbound.filter(s => s.risk_score >= 0.70).length, style: { color: '#ef4444' } },
                            ].map(item => (
                              <div key={item.label} className="bg-slate-50 rounded-lg p-3 text-center">
                                <p className="text-[10px] text-slate-400 mb-1">{item.label}</p>
                                <p className="text-sm font-semibold text-slate-800" style={item.style}>{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {inbound.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
                            <div className="px-4 py-3 border-b border-slate-100">
                              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Inbound Freighters ({inbound.length})</h3>
                            </div>
                            <div className="divide-y divide-slate-50 overflow-y-auto" style={{ maxHeight: 200 }}>
                              {inbound.map(s => (
                                <div key={s.id} className="px-4 py-2.5 flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-medium text-slate-800">{s.origin.replace(/_/g, ' ')}</p>
                                    <p className="text-[10px] text-slate-400">{s.predicted_delay_days > 0 ? `+${s.predicted_delay_days.toFixed(1)}d delay` : 'On schedule'}</p>
                                  </div>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.risk_score >= 0.70 ? 'bg-red-100 text-red-700' : s.risk_score >= 0.45 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {Math.round(s.risk_score * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                  {/* Charts column — Pie + full-height Bar */}
                  <div className="lg:col-span-5 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Status Distribution</h3>
                        <div className="flex items-center gap-3">
                          <div style={{ width: 80, height: 80 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={22} outerRadius={38} dataKey="value" paddingAngle={3}>
                                  {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                                </Pie>
                                <Tooltip formatter={(v: any) => [`${v}`, 'ports']} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-1 text-[10px]">
                            {pieData.map(d => (
                              <div key={d.name} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                                <span className="text-slate-600">{d.name}</span>
                                <span className="font-semibold text-slate-800 ml-auto">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Freighters by Port</h3>
                        <div style={{ width: '100%', height: 100, minWidth: 0 }}>
                          <ResponsiveContainer width="100%" height={100}>
                            <BarChart data={[...ports].sort((a,b) => b.vessels_waiting - a.vessels_waiting).slice(0,8).map(p=>({ name: p.port_name.replace(/_/g,' ').substring(0,8), count: p.vessels_waiting, color: congestionColor(p.congestion_score) }))} margin={{ top: 0, right: 4, left: -24, bottom: 20 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} angle={-40} textAnchor="end" axisLine={false} tickLine={false} interval={0} />
                              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 11 }} formatter={(v: any) => [`${v}`, 'Freighters']} />
                              <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={14}>
                                {[...ports].sort((a,b) => b.vessels_waiting - a.vessels_waiting).slice(0,8).map((_, i) => <Cell key={i} fill={congestionColor(_.congestion_score)} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                    {/* Taller congestion score bar chart */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex-1">
                      <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Top 8 Congestion Scores</h3>
                      <div style={{ width: '100%', height: 210, minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={210}>
                          <BarChart data={chartData} margin={{ top: 0, right: 4, left: -24, bottom: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} angle={-40} textAnchor="end" axisLine={false} tickLine={false} interval={0} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 11 }} formatter={(v: any) => [`${v}`, 'Score']} />
                            <Bar dataKey="score" radius={[3, 3, 0, 0]} barSize={20}>
                              {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
