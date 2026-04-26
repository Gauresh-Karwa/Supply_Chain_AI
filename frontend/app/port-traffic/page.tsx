'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'
import { Shipment } from '@/types'
import { fetchShipments } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface PortCongestion {
  port_name: string
  vessels_waiting: number
  avg_wait_hours: number
  congestion_score: number
  last_updated: string
  is_manual?: boolean
  notes?: string
}

const PORT_DATA: Record<string, { lon: number; lat: number; label: string }> = {
  'Shanghai': { lon: 121.5, lat: 31.2, label: 'Shanghai' },
  'Singapore': { lon: 103.8, lat: 1.4, label: 'Singapore' },
  'Rotterdam': { lon: 4.5, lat: 51.9, label: 'Rotterdam' },
  'Dubai': { lon: 55.3, lat: 25.2, label: 'Dubai' },
  'Mumbai': { lon: 72.8, lat: 18.9, label: 'Mumbai' },
  'Colombo': { lon: 79.9, lat: 6.9, label: 'Colombo' },
  'Busan': { lon: 129.1, lat: 35.2, label: 'Busan' },
  'Hong_Kong': { lon: 114.2, lat: 22.3, label: 'Hong Kong' },
  'Hamburg': { lon: 10.0, lat: 53.6, label: 'Hamburg' },
  'Antwerp': { lon: 4.4, lat: 51.2, label: 'Antwerp' },
  'Piraeus': { lon: 23.6, lat: 37.9, label: 'Piraeus' },
  'Karachi': { lon: 67.0, lat: 24.9, label: 'Karachi' },
  'Djibouti': { lon: 43.1, lat: 11.6, label: 'Djibouti' },
  'Port_Klang': { lon: 101.4, lat: 3.0, label: 'Port Klang' },
  'Los_Angeles': { lon: -118.2, lat: 34.1, label: 'Los Angeles' },
  'New_York': { lon: -74.0, lat: 40.7, label: 'New York' },
  'Santos': { lon: -46.3, lat: -24.0, label: 'Santos' },
  'Sydney': { lon: 151.2, lat: -33.9, label: 'Sydney' },
  'Melbourne': { lon: 145.0, lat: -37.8, label: 'Melbourne' },
  'Tokyo': { lon: 139.7, lat: 35.7, label: 'Tokyo' },
  'Ningbo': { lon: 121.5, lat: 29.9, label: 'Ningbo' },
  'Qingdao': { lon: 120.3, lat: 36.1, label: 'Qingdao' },
  'Houston': { lon: -95.4, lat: 29.8, label: 'Houston' },
  'Savannah': { lon: -81.1, lat: 32.1, label: 'Savannah' },
  'Cape_Town': { lon: 18.4, lat: -33.9, label: 'Cape Town' },
  'Auckland': { lon: 174.7, lat: -36.8, label: 'Auckland' },
  'Kaohsiung': { lon: 120.3, lat: 22.6, label: 'Kaohsiung' },
  'Yokohama': { lon: 139.6, lat: 35.4, label: 'Yokohama' },
  'Shenzhen': { lon: 114.1, lat: 22.5, label: 'Shenzhen' },
  'Alexandria': { lon: 29.9, lat: 31.2, label: 'Alexandria' },
  'Algeciras': { lon: -5.4, lat: 36.1, label: 'Algeciras' },
  'Genoa': { lon: 8.9, lat: 44.4, label: 'Genoa' },
  'Valencia': { lon: -0.4, lat: 39.5, label: 'Valencia' },
  'Felixstowe': { lon: 1.3, lat: 51.9, label: 'Felixstowe' },
  'Buenos_Aires': { lon: -58.4, lat: -34.6, label: 'Buenos Aires' },
  'Miami': { lon: -80.2, lat: 25.8, label: 'Miami' },
  'Seattle': { lon: -122.3, lat: 47.6, label: 'Seattle' },
  'Vancouver': { lon: -123.1, lat: 49.3, label: 'Vancouver' },
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
  if (score >= 70) return { badge: 'bg-red-100 text-red-700 border-red-200', label: 'Critical' }
  if (score >= 40) return { badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Congested' }
  return { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Clear' }
}

// ── Manual Override Modal ──────────────────────────────────────────────────
function OverrideModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    port_name: '', vessels_waiting: '', avg_wait_hours: '', congestion_score: '', notes: ''
  })
  const known = Object.keys(PORT_DATA)
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Auto-calculate congestion score from vessels+wait if user hasn't typed it
  const autoScore = () => {
    const v = parseFloat(form.vessels_waiting) || 0
    const w = parseFloat(form.avg_wait_hours) || 0
    const s = Math.min(100, Math.round(v * 0.4 + w * 2))
    setForm(p => ({ ...p, congestion_score: String(s) }))
  }

  const handleSave = async () => {
    if (!form.port_name || !form.vessels_waiting || !form.avg_wait_hours) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/port-congestion/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          port_name: form.port_name,
          vessels_waiting: parseInt(form.vessels_waiting),
          avg_wait_hours: parseFloat(form.avg_wait_hours),
          congestion_score: parseFloat(form.congestion_score) || 0,
          notes: form.notes,
        })
      })
      if (!res.ok) throw new Error()
      onSaved(); onClose()
    } catch { alert('Failed to save override — check backend.') }
    setSaving(false)
  }

  const inp = 'w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400'
  const lbl = 'text-[10px] uppercase font-semibold text-slate-500 block mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Manual Port Override</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enter real-world data to override the engine's simulation.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={lbl}>Port Name *</label>
            <select value={form.port_name} onChange={e => set('port_name', e.target.value)} className={inp}>
              <option value="">— Select port —</option>
              {known.map(k => <option key={k} value={k}>{PORT_DATA[k].label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Vessels Waiting *</label>
              <input type="number" value={form.vessels_waiting}
                onChange={e => set('vessels_waiting', e.target.value)}
                onBlur={autoScore} placeholder="42" className={inp} />
            </div>
            <div>
              <label className={lbl}>Avg Wait (hours) *</label>
              <input type="number" value={form.avg_wait_hours}
                onChange={e => set('avg_wait_hours', e.target.value)}
                onBlur={autoScore} placeholder="18.5" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Congestion Score (0–100) — auto-fills on blur</label>
            <input type="number" min={0} max={100} value={form.congestion_score}
              onChange={e => set('congestion_score', e.target.value)}
              placeholder="Will auto-calculate" className={inp} />
          </div>
          <div>
            <label className={lbl}>Notes / Source</label>
            <input type="text" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="e.g. LiveAIS feed 2026-04-13" className={inp} />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.port_name}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {saving ? 'Saving…' : 'Save Override'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── World Map Canvas ──────────────────────────────────────────────────────
function CongestionMap({ ports, congestionMap, shipments, selectedPort, onSelectPort }: {
  ports: PortCongestion[]
  congestionMap: Record<string, PortCongestion>
  shipments: Shipment[]
  selectedPort: PortCongestion | null
  onSelectPort: (p: PortCongestion) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const geoRef = useRef<any>(null)
  const zoom = useRef(1)
  const pan = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const mousePos = useRef({ x: -1000, y: -1000 })
  const timeRef = useRef(0)
  const reqRef = useRef(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; port: PortCongestion } | null>(null)

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json()).then(d => { geoRef.current = d }).catch(() => { })
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    const cw = rect.width, ch = rect.height
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr)
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

    if (geoRef.current) {
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8
      geoRef.current.features.forEach((f: any) => {
        const drawRing = (ring: number[][]) => {
          ctx.beginPath()
          ring.forEach(([lon, lat], i) => {
            const [x, y] = getPos(lon, lat)
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.closePath(); ctx.fill(); ctx.stroke()
        }
        if (f.geometry?.type === 'Polygon') drawRing(f.geometry.coordinates[0])
        else if (f.geometry?.type === 'MultiPolygon') f.geometry.coordinates.forEach((p: any) => drawRing(p[0]))
      })
    } else {
      ctx.fillStyle = '#94a3b8'; ctx.font = '13px sans-serif'
      ctx.fillText('Loading map…', cw / 2 - 50, ch / 2); return
    }

    if (selectedPort) {
      const destCoords = PORT_DATA[selectedPort.port_name]
      if (destCoords) {
        const [dx, dy] = getPos(destCoords.lon, destCoords.lat)
        shipments.filter(s => s.destination === selectedPort.port_name).forEach(s => {
          const orig = PORT_DATA[s.origin]; if (!orig) return
          const [ox, oy] = getPos(orig.lon, orig.lat)
          const midX = (ox + dx) / 2, midY = (oy + dy) / 2
          const cpX = midX + (dy - oy) * 0.18, cpY = midY - (dx - ox) * 0.18
          const color = s.risk_score >= 0.70 ? '#ef4444' : s.risk_score >= 0.45 ? '#f59e0b' : '#10b981'
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
          ctx.strokeStyle = color + '40'; ctx.lineWidth = 6; ctx.globalAlpha = 0.5; ctx.stroke()
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(cpX, cpY, dx, dy)
          ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.95
          if (s.risk_score >= 0.70) { ctx.setLineDash([6, 5]); ctx.lineDashOffset = -timeRef.current * 0.3 }
          else ctx.setLineDash([])
          ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
        })
      }
    }

    let newTooltip: typeof tooltip = null
    Object.entries(PORT_DATA).forEach(([key, coord]) => {
      const cong = congestionMap[key]; if (!cong) return
      const [x, y] = getPos(coord.lon, coord.lat)
      const score = cong.congestion_score
      const color = congestionColor(score)
      const isSelected = selectedPort?.port_name === key
      const isHovered = Math.hypot(x - mousePos.current.x, y - mousePos.current.y) < 14
      if (score >= 70 || isSelected) {
        const pulse = (Math.sin(timeRef.current * 0.05) + 1) / 2
        const r = (isSelected ? 14 : 10) + pulse * 5
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = color + (isSelected ? '50' : '30'); ctx.fill()
      }
      const dotR = Math.max(3, Math.min(10, 3 + (cong.vessels_waiting / 20))) * Math.min(zoom.current, 1.5)
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'; ctx.fill()
      ctx.strokeStyle = color; ctx.lineWidth = isSelected ? 2.5 : 1.8
      if (cong.is_manual) { ctx.setLineDash([3, 2]) }
      if (isSelected) { ctx.shadowColor = color; ctx.shadowBlur = 10 }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([])
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
      const cong = congestionMap[key]; if (!cong) continue
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
      <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 flex gap-4 text-[10px] font-medium shadow-sm flex-wrap">
        {[['#ef4444', 'Critical (≥70)'], ['#f59e0b', 'Congested (40–69)'], ['#10b981', 'Clear (<40)']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block border-2" style={{ borderColor: c, background: '#fff' }} />{l}
          </span>
        ))}
        <span className="text-slate-400 border-l border-slate-200 pl-3">Dashed border = manual override</span>
      </div>
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        {([['＋', () => { zoom.current = Math.min(zoom.current + 0.5, 8) }],
        ['－', () => { zoom.current = Math.max(zoom.current - 0.5, 0.5) }],
        ['⊙', () => { zoom.current = 1; pan.current = { x: 0, y: 0 } }]] as [string, () => void][]).map(([l, a]) => (
          <button key={l} onClick={a}
            className="w-7 h-7 rounded bg-white border border-slate-200 shadow-sm text-slate-600 font-bold hover:bg-slate-50 flex items-center justify-center text-sm">
            {l}
          </button>
        ))}
      </div>
      {tooltip && (
        <div className="absolute z-20 pointer-events-none"
          style={{ left: Math.min(tooltip.x + 14, 9999), top: Math.max(tooltip.y - 70, 4) }}>
          <div className="bg-slate-900/95 border border-slate-700 text-white rounded-xl shadow-xl px-3 py-2 min-w-[170px]">
            <p className="text-xs font-bold mb-1 flex items-center gap-2">
              {tooltip.port.port_name.replace(/_/g, ' ')}
              {tooltip.port.is_manual && <span className="text-[9px] bg-blue-600 px-1.5 py-0.5 rounded font-semibold">MANUAL</span>}
            </p>
            <div className="grid grid-cols-2 gap-x-3 text-[10px]">
              <span className="text-slate-400">Score</span><span className="font-semibold" style={{ color: congestionColor(tooltip.port.congestion_score) }}>{tooltip.port.congestion_score.toFixed(0)}</span>
              <span className="text-slate-400">Vessels</span><span className="font-medium">{tooltip.port.vessels_waiting}</span>
              <span className="text-slate-400">Avg Wait</span><span className="font-medium">{tooltip.port.avg_wait_hours}h</span>
              {tooltip.port.notes && <><span className="text-slate-400 col-span-2 mt-1 truncate">{tooltip.port.notes}</span></>}
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

// ── Page ──────────────────────────────────────────────────────────────────
export default function PortTrafficPage() {
  const [ports, setPorts] = useState<PortCongestion[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPort, setSelectedPort] = useState<PortCongestion | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [showOverride, setShowOverride] = useState(false)
  const [deletingPort, setDeletingPort] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)

  const congestionMap: Record<string, PortCongestion> = {}
  ports.forEach(p => { congestionMap[p.port_name] = p })

  const loadData = useCallback(async () => {
    const [portRes, shipRes] = await Promise.all([
      fetch(`${API}/port-congestion`).then(r => r.ok ? r.json() : { ports: [] }).catch(() => ({ ports: [] })),
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
    await fetch(`${API}/port-congestion/refresh`, { method: 'POST' }).catch(() => { })
    await loadData(); setRefreshing(false)
  }

  const handleDeletePort = async (portName: string) => {
    if (!confirm(`Delete "${portName.replace(/_/g, ' ')}" from congestion database?`)) return
    setDeletingPort(portName)
    try {
      await fetch(`${API}/port-congestion/${encodeURIComponent(portName)}`, { method: 'DELETE' })
      setPorts(p => p.filter(x => x.port_name !== portName))
      if (selectedPort?.port_name === portName) setSelectedPort(null)
    } catch { alert('Delete failed.') }
    setDeletingPort(null)
  }

  const critical = ports.filter(p => p.congestion_score >= 70)
  const congested = ports.filter(p => p.congestion_score >= 40 && p.congestion_score < 70)
  const clear = ports.filter(p => p.congestion_score < 40)
  const totalVessels = ports.reduce((s, p) => s + p.vessels_waiting, 0)
  const avgScore = ports.length > 0 ? ports.reduce((s, p) => s + p.congestion_score, 0) / ports.length : 0
  const manualCount = ports.filter(p => p.is_manual).length

  const chartData = [...ports].sort((a, b) => b.congestion_score - a.congestion_score).slice(0, 10).map(p => ({
    name: p.port_name.replace(/_/g, ' ').substring(0, 11),
    score: Math.round(p.congestion_score),
    color: congestionColor(p.congestion_score)
  }))
  const pieData = [
    { name: 'Critical', value: critical.length, fill: '#ef4444' },
    { name: 'Congested', value: congested.length, fill: '#f59e0b' },
    { name: 'Clear', value: clear.length, fill: '#10b981' },
  ].filter(d => d.value > 0)

  const vesselChartData = [...ports].sort((a, b) => b.vessels_waiting - a.vessels_waiting).slice(0, 8).map(p => ({
    name: p.port_name.replace(/_/g, ' ').substring(0, 9),
    count: p.vessels_waiting,
    color: congestionColor(p.congestion_score)
  }))

  const inbound = selectedPort ? shipments.filter(s => s.destination === selectedPort.port_name) : []
  const inboundRisk = inbound.filter(s => s.risk_score >= 0.70).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar
        title="Port Traffic Control"
        subtitle="Live global congestion matrix — click any port to inspect inbound fleet. Add manual overrides or delete stale entries."
        badges={[
          { label: '● Live', color: 'green' as const },
          ...(critical.length > 0 ? [{ label: `${critical.length} Critical`, color: 'red' as const }] : []),
          ...(manualCount > 0 ? [{ label: `${manualCount} Manual`, color: 'green' as const }] : []),
        ]}
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <div className="max-w-none mx-auto space-y-5">

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Ports Monitored', value: ports.length, color: 'text-slate-800', bg: 'bg-white' },
              { label: 'Freighters Queued', value: totalVessels, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              { label: 'Critical Control', value: critical.length, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
              { label: 'Avg Congestion', value: avgScore.toFixed(1), color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
              { label: 'Manual Overrides', value: manualCount, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border border-slate-200 rounded-2xl p-4 shadow-sm transition-transform hover:scale-[1.02]`}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black mb-1">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Action Bar ── */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              <button onClick={handleRefresh} disabled={refreshing}
                className="text-xs bg-white border border-slate-200 hover:border-blue-400 text-slate-600 hover:text-blue-600 px-4 py-2 rounded-lg font-medium transition shadow-sm disabled:opacity-50 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {refreshing ? 'Refreshing…' : 'Refresh Engine'}
              </button>
              <button onClick={() => setShowOverride(true)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Manual Override
              </button>
            </div>
            <button onClick={() => setShowTable(s => !s)}
              className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 bg-white px-4 py-2 rounded-lg transition">
              {showTable ? 'Hide' : 'Show'} Full Port Table
            </button>
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
              <p className="text-sm font-semibold text-amber-700 mb-3">No congestion data yet. Generate engine data or add a manual override.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={handleRefresh} disabled={refreshing}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-50">
                  {refreshing ? 'Generating…' : 'Generate Port Traffic Data'}
                </button>
                <button onClick={() => setShowOverride(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition">
                  + Manual Entry
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Main Map ── */}
              <div className="w-full" style={{ height: 380 }}>
                <CongestionMap ports={ports} congestionMap={congestionMap} shipments={shipments}
                  selectedPort={selectedPort} onSelectPort={setSelectedPort} />
              </div>

              {/* ── Bottom Panel ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                {/* Port List */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 440 }}>
                  <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h3 className="text-sm font-semibold text-slate-800">Port Rankings</h3>
                    <span className="text-[10px] text-slate-400">{lastRefresh.toLocaleTimeString()}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                    {[...ports].sort((a, b) => b.congestion_score - a.congestion_score).map(port => {
                      const isSelected = selectedPort?.port_name === port.port_name
                      const color = congestionColor(port.congestion_score)
                      return (
                        <div key={port.port_name} onClick={() => setSelectedPort(port)}
                          className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'}`}>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate flex items-center gap-1">
                              {port.port_name.replace(/_/g, ' ')}
                              {port.is_manual && <span className="text-[8px] bg-purple-100 text-purple-600 px-1 rounded">M</span>}
                            </p>
                            <p className="text-[10px] text-slate-400">{port.vessels_waiting}v · {port.avg_wait_hours}h wait</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-8 h-1 bg-slate-100 rounded-full overflow-hidden shrink-0">
                              <div className="h-full rounded-full" style={{ width: `${port.congestion_score}%`, background: color }} />
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeletePort(port.port_name) }}
                              disabled={deletingPort === port.port_name}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 text-sm leading-none disabled:opacity-30"
                              title="Delete this port entry">
                              {deletingPort === port.port_name ? '…' : '✕'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Selected Port Details */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  {selectedPort && (() => {
                    const c = getCongestionMeta(selectedPort.congestion_score)
                    const color = congestionColor(selectedPort.congestion_score)
                    return (
                      <>
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-semibold text-slate-900">{selectedPort.port_name.replace(/_/g, ' ')}</h2>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>{c.label}</span>
                              {selectedPort.is_manual && <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-semibold">MANUAL</span>}
                            </div>
                            <button onClick={() => handleDeletePort(selectedPort.port_name)}
                              disabled={deletingPort === selectedPort.port_name}
                              className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-300 px-2 py-1 rounded transition disabled:opacity-30">
                              {deletingPort === selectedPort.port_name ? '…' : 'Delete'}
                            </button>
                          </div>
                          {selectedPort.notes && (
                            <p className="text-[11px] text-slate-400 italic mb-3 border-l-2 border-slate-200 pl-2">{selectedPort.notes}</p>
                          )}
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Score', value: `${selectedPort.congestion_score.toFixed(0)}/100`, style: { color } },
                              { label: 'Freighters', value: selectedPort.vessels_waiting },
                              { label: 'Avg Wait', value: `${selectedPort.avg_wait_hours}h` },
                              { label: 'Est. Cost', value: `$${(selectedPort.avg_wait_hours / 24 * 15000).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                              { label: 'Inbound', value: inbound.length },
                              { label: 'At-Risk', value: inboundRisk, style: inboundRisk > 0 ? { color: '#ef4444' } : undefined },
                            ].map(item => (
                              <div key={item.label} className="bg-slate-50 rounded-lg p-3 text-center">
                                <p className="text-[10px] text-slate-400 mb-1">{item.label}</p>
                                <p className="text-sm font-semibold text-slate-800" style={(item as any).style}>{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {inbound.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
                            <div className="px-4 py-3 border-b border-slate-100">
                              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Inbound Freighters ({inbound.length})</h3>
                            </div>
                            <div className="divide-y divide-slate-50 overflow-y-auto" style={{ maxHeight: 220 }}>
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

                {/* Charts column */}
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
                          <BarChart data={vesselChartData} margin={{ top: 0, right: 4, left: -24, bottom: 20 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} angle={-35} textAnchor="end" axisLine={false} tickLine={false} interval={0} />
                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 11 }} formatter={(v: any) => [`${v}`, 'Freighters']} />
                            <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={14}>
                              {vesselChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex-1">
                    <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Top 10 Congestion Scores</h3>
                    <div style={{ width: '100%', height: 200, minWidth: 0 }}>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={chartData} margin={{ top: 0, right: 4, left: -24, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} angle={-35} textAnchor="end" axisLine={false} tickLine={false} interval={0} />
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

              {/* ── Full Port Table (toggled) ── */}
              {showTable && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Full Port Congestion Database</h3>
                      <p className="text-xs text-slate-500">{ports.length} ports tracked — click ✕ to delete any entry</p>
                    </div>
                    <button onClick={() => setShowTable(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/30">
                          {['Port', 'Score', 'Vessels', 'Avg Wait', 'Est. Delay Cost', 'Source', 'Last Updated', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...ports].sort((a, b) => b.congestion_score - a.congestion_score).map(port => {
                          const c = getCongestionMeta(port.congestion_score)
                          return (
                            <tr key={port.port_name} onClick={() => setSelectedPort(port)}
                              className={`border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group ${selectedPort?.port_name === port.port_name ? 'bg-blue-50' : ''}`}>
                              <td className="px-4 py-2.5 font-medium text-slate-800 flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: congestionColor(port.congestion_score) }} />
                                {port.port_name.replace(/_/g, ' ')}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>{port.congestion_score.toFixed(0)}</span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-600">{port.vessels_waiting}</td>
                              <td className="px-4 py-2.5 text-slate-600">{port.avg_wait_hours}h</td>
                              <td className="px-4 py-2.5 text-slate-600">
                                ${(port.avg_wait_hours / 24 * 15000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="px-4 py-2.5">
                                {port.is_manual
                                  ? <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-semibold">Manual</span>
                                  : <span className="text-[10px] text-slate-400">Engine</span>}
                              </td>
                              <td className="px-4 py-2.5 text-slate-400">{port.last_updated ? new Date(port.last_updated).toLocaleString() : '—'}</td>
                              <td className="px-3 py-2.5">
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeletePort(port.port_name) }}
                                  disabled={deletingPort === port.port_name}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 font-bold text-sm disabled:opacity-30">
                                  {deletingPort === port.port_name ? '…' : '✕'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showOverride && (
        <OverrideModal onClose={() => setShowOverride(false)} onSaved={loadData} />
      )}
    </div>
  )
}
