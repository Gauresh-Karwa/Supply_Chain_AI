'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import TopBar from '@/components/layout/TopBar'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, Legend
} from 'recharts'

const API = 'http://localhost:8000'

// ─── types ────────────────────────────────────────────────────────────────────
interface InventoryItem {
  id: string
  user_label: string
  sku: string
  current_stock_units: number
  daily_consumption: number
  linked_shipment_id: string | null
  incoming_quantity: number
  reorder_point: number
  unit_cost_usd?: number
  created_at: string
}

interface InventoryAlert {
  id: string
  inventory_item_id: string
  alert_type: 'stockout_risk' | 'low_buffer' | 'safe' | 'low_stock_no_shipment'
  days_until_stockout: number
  days_until_arrival: number | null
  buffer_days: number | null
  shipment_risk_score: number | null
  message: string
  created_at: string
  resolved: boolean
}

// ─── constants ────────────────────────────────────────────────────────────────
const ALERT_META = {
  stockout_risk: { color: 'bg-red-50 border-red-200', iconColor: 'text-red-500', badge: 'bg-red-100 text-red-700 border-red-200', label: 'Stockout Risk', icon: '⚠' },
  low_buffer: { color: 'bg-amber-50 border-amber-200', iconColor: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Low Buffer', icon: '⚡' },
  safe: { color: 'bg-emerald-50 border-emerald-100', iconColor: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Safe', icon: '✓' },
  low_stock_no_shipment: { color: 'bg-orange-50 border-orange-200', iconColor: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'No Supply', icon: '●' },
}

const daysCls = (d: number) =>
  d < 0 ? 'text-red-600 font-bold' : d < 3 ? 'text-red-500 font-semibold' : d < 7 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-medium'

const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`

// ─── sub-components ───────────────────────────────────────────────────────────
function TimelineBar({ stockDays, arrivalDays }: { stockDays: number; arrivalDays: number }) {
  const total = Math.max(stockDays, arrivalDays, 1) * 1.2
  const stockPct = Math.min((stockDays / total) * 100, 100)
  const arrivalPct = Math.min((arrivalDays / total) * 100, 100)
  const gap = arrivalDays > stockDays
  return (
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden w-full">
      <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400/70 transition-all"
        style={{ width: `${stockPct}%` }} title={`Stock lasts ${stockDays.toFixed(1)}d`} />
      <div className="absolute top-0 h-full w-0.5 bg-slate-600/50"
        style={{ left: `${arrivalPct}%` }} title={`Ship arrives at ${arrivalDays.toFixed(1)}d`} />
      {gap && (
        <div className="absolute top-0 h-full bg-red-400/25"
          style={{ left: `${stockPct}%`, width: `${Math.min(arrivalPct - stockPct, 100 - stockPct)}%` }} />
      )}
    </div>
  )
}

function StockProjectionChart({ currentStock, dailyConsumption, arrivalDays, incomingQty }: {
  currentStock: number; dailyConsumption: number; arrivalDays: number | null; incomingQty: number
}) {
  const data = useMemo(() => {
    const points = []
    let stock = currentStock
    for (let i = 0; i <= 30; i++) {
      if (arrivalDays !== null && Math.floor(arrivalDays) === i) {
        stock += incomingQty
      }
      points.push({ day: `D+${i}`, units: Math.max(0, stock) })
      stock -= dailyConsumption
    }
    return points
  }, [currentStock, dailyConsumption, arrivalDays, incomingQty])

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={5} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
          <Area type="monotone" dataKey="units" stroke="#3b82f6" fillOpacity={1} fill="url(#colorUnits)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────
function AddItemModal({ shipments, onClose, onSaved }: { shipments: Shipment[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    user_label: '', sku: '', current_stock_units: '', daily_consumption: '',
    linked_shipment_id: '', incoming_quantity: '', reorder_point: '', unit_cost_usd: ''
  })
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const daysLeft = form.current_stock_units && form.daily_consumption
    ? (parseFloat(form.current_stock_units) / parseFloat(form.daily_consumption)).toFixed(1)
    : null

  const handleSave = async () => {
    if (!form.user_label || !form.current_stock_units || !form.daily_consumption) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/inventory/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_label: form.user_label,
          sku: form.sku || 'N/A',
          current_stock_units: parseFloat(form.current_stock_units),
          daily_consumption: parseFloat(form.daily_consumption),
          linked_shipment_id: form.linked_shipment_id || null,
          incoming_quantity: parseFloat(form.incoming_quantity) || 0,
          reorder_point: parseFloat(form.reorder_point) || 0,
          unit_cost_usd: parseFloat(form.unit_cost_usd) || 0,
        })
      })
      if (!res.ok) throw new Error()
      onSaved(); onClose()
    } catch { alert('Failed to save — check backend connection.') }
    setSaving(false)
  }

  const inp = 'w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 transition'
  const lbl = 'text-[10px] uppercase font-semibold text-slate-500 block mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Register Inventory Item</h2>
            <p className="text-xs text-slate-400 mt-0.5">Link to an inbound shipment to enable automatic stockout prediction.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Item Label *</label><input value={form.user_label} onChange={e => set('user_label', e.target.value)} placeholder="Engine Components" className={inp} /></div>
            <div><label className={lbl}>SKU</label><input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="ENG-447" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Current Stock (units) *</label><input type="number" value={form.current_stock_units} onChange={e => set('current_stock_units', e.target.value)} placeholder="500" className={inp} /></div>
            <div><label className={lbl}>Daily Consumption *</label><input type="number" value={form.daily_consumption} onChange={e => set('daily_consumption', e.target.value)} placeholder="25" className={inp} /></div>
          </div>
          {daysLeft && (
            <div className={`rounded-lg px-4 py-3 border text-sm font-medium flex items-center gap-2 ${parseFloat(daysLeft) < 7 ? 'bg-red-50 border-red-200 text-red-700' : parseFloat(daysLeft) < 14 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              At this consumption rate, current stock lasts <strong className="ml-1">{daysLeft} days</strong>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Reorder Point (units)</label><input type="number" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} placeholder="100" className={inp} /></div>
            <div>
              <label className={lbl}>Unit Cost (USD)</label>
              <div className="relative"><span className="absolute left-3 top-2 text-slate-400 text-sm">$</span><input type="number" value={form.unit_cost_usd} onChange={e => set('unit_cost_usd', e.target.value)} placeholder="45.00" className={inp + ' pl-6'} /></div>
            </div>
          </div>
          <div>
            <label className={lbl}>Link to Inbound Shipment</label>
            <select value={form.linked_shipment_id} onChange={e => set('linked_shipment_id', e.target.value)} className={inp}>
              <option value="">— No shipment linked —</option>
              {shipments.map(s => (
                <option key={s.id} value={s.id}>
                  {s.origin.replace(/_/g, ' ')} → {s.destination.replace(/_/g, ' ')} ({s.predicted_delay_days > 0 ? `+${s.predicted_delay_days.toFixed(1)}d delay` : 'on time'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Incoming Quantity (units)</label>
            <input type="number" value={form.incoming_quantity} onChange={e => set('incoming_quantity', e.target.value)} placeholder="1000" className={inp} />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.user_label || !form.current_stock_units || !form.daily_consumption}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {saving ? 'Registering…' : 'Register Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Item Detail Panel ────────────────────────────────────────────────────────
function ItemDetailPanel({ item, alert, ship, onClose }: {
  item: any; alert: InventoryAlert | undefined; ship: Shipment | null; onClose: () => void
}) {
  const meta = alert ? ALERT_META[alert.alert_type] : null
  const radarData = [
    { factor: 'Stock Health', value: Math.min(100, Math.round((item.daysLeft / 30) * 100)) },
    { factor: 'Buffer Safety', value: item.buffer !== null ? Math.max(0, Math.min(100, Math.round((item.buffer / 15) * 100))) : 50 },
    { factor: 'Ship Risk', value: Math.round((1 - (item.riskScore || 0)) * 100) },
    { factor: 'Reorder Gap', value: Math.min(100, Math.round(((item.current_stock_units - item.reorder_point) / Math.max(item.reorder_point, 1)) * 100)) },
    { factor: 'Consumption', value: Math.min(100, Math.round((item.daily_consumption / Math.max(item.current_stock_units, 1)) * 1000)) },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-slate-900">{item.user_label}</h2>
              {item.sku && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded tracking-wider">{item.sku}</span>}
              {meta && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> System ID: {item.id.substring(0, 8)}...
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0 p-1 hover:bg-slate-50 rounded-lg transition-colors">✕</button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Stock Exhaustion', value: `${item.daysLeft.toFixed(1)}d`, color: daysCls(item.daysLeft) },
                { label: 'Inventory Units', value: item.current_stock_units.toLocaleString(), color: 'text-slate-800' },
                { label: 'Burn Rate', value: `${item.daily_consumption}/d`, color: 'text-slate-800' },
                { label: 'Exposure Value', value: fmt(item.financialExposure), color: item.financialExposure > 0 ? 'text-red-600' : 'text-slate-800' },
              ].map(k => (
                <div key={k.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-transform hover:scale-[1.02]">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1"> {k.label}</p>
                  <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Projection Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">30-Day Inventory Projection</h3>
                  <p className="text-xs text-slate-400">Simulation based on current burn rate and predicted arrival</p>
                </div>
                {alert?.days_until_arrival && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Arrival: D+{Math.floor(alert.days_until_arrival)}</span>
                  </div>
                )}
              </div>
              <StockProjectionChart
                currentStock={item.current_stock_units}
                dailyConsumption={item.daily_consumption}
                arrivalDays={alert?.days_until_arrival ?? null}
                incomingQty={item.incoming_quantity}
              />
            </div>

            {/* Inbound Vessel */}
            {ship && (
              <div className="bg-slate-900 text-white rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                  MarineIQ Inbound Vessel
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Route</p>
                    <p className="text-sm font-bold">{ship.origin.replace(/_/g, ' ')} → {ship.destination.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">ETA Variance</p>
                    <p className="text-sm font-bold text-amber-400">{ship.predicted_delay_days > 0 ? `+${ship.predicted_delay_days.toFixed(1)}d delay` : 'On track'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Risk Index</p>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400" style={{ width: `${ship.risk_score * 100}%` }} />
                      </div>
                      <span className="text-sm font-black italic">{(ship.risk_score * 100).toFixed(0)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Payload</p>
                    <p className="text-sm font-bold">{item.incoming_quantity} units</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            {/* Health Radar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-6">Operational Resilience</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} />
                    <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={3} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 10 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Resource Balance</span>
                  <span className="font-bold text-slate-800">{Math.round(radarData.reduce((s, d) => s + d.value, 0) / 5)}%</span>
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round(radarData.reduce((s, d) => s + d.value, 0) / 5)}%` }} />
                </div>
              </div>
            </div>

            {/* Alert Breakdown */}
            {alert && (
              <div className={`rounded-2xl border p-5 ${meta?.color} shadow-sm border-2`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{meta?.icon}</span>
                  <p className={`text-xs font-black uppercase tracking-widest ${meta?.iconColor}`}>Operational Alert</p>
                </div>
                <p className="text-sm text-slate-800 font-medium leading-relaxed mb-4">{alert.message}</p>
                <div className="space-y-4">
                  <div className="bg-white/50 rounded-xl p-3">
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Supply/Demand Timeline</p>
                    <TimelineBar stockDays={item.daysLeft} arrivalDays={alert.days_until_arrival ?? 0} />
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mt-2 italic">
                      <span>Exhaust: {item.daysLeft.toFixed(1)}d</span>
                      <span>Arrival: {alert.days_until_arrival?.toFixed(1) ?? '—'}d</span>
                    </div>
                  </div>
                  {alert.buffer_days !== null && (
                    <div className={`p-3 rounded-xl border-2 flex items-center justify-between ${alert.buffer_days < 0 ? 'bg-red-100 border-red-300 text-red-800' : 'bg-white border-slate-200'}`}>
                      <span className="text-[10px] font-bold uppercase">Alert Buffer</span>
                      <span className="text-sm font-black">{alert.buffer_days.toFixed(1)} Days</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [detailItem, setDetailItem] = useState<any | null>(null)
  const [extraDelay, setExtraDelay] = useState(0)
  const [scenarioItem, setScenarioItem] = useState<InventoryItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [ir, ar, sr] = await Promise.all([
      fetch(`${API}/inventory/items`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
      fetch(`${API}/inventory/alerts`).then(r => r.ok ? r.json() : { alerts: [] }).catch(() => ({ alerts: [] })),
      fetchShipments().catch(() => ({ shipments: [] }))
    ])
    const its: InventoryItem[] = ir.items || []
    setItems(its)
    setAlerts(ar.alerts || [])
    setShipments(sr.shipments || [])
    if (its.length > 0) setScenarioItem(i => i ?? its[0])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item from internal ledger?')) return
    setDeletingId(id)
    try {
      await fetch(`${API}/inventory/items/${id}`, { method: 'DELETE' })
      setItems(p => p.filter(i => i.id !== id))
      setAlerts(p => p.filter(a => a.inventory_item_id !== id))
      if (detailItem?.id === id) setDetailItem(null)
    } catch { alert('Delete failed.') }
    setDeletingId(null)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetch(`${API}/inventory/alerts/refresh`, { method: 'POST' })
    await load(); setRefreshing(false)
  }

  const shipmentMap: Record<string, Shipment> = {}
  shipments.forEach(s => { shipmentMap[s.id] = s })
  const alertsByItem: Record<string, InventoryAlert> = {}
  alerts.forEach(a => { alertsByItem[a.inventory_item_id] = a })

  const enriched = useMemo(() => items.map(item => {
    const daysLeft = item.current_stock_units / Math.max(item.daily_consumption, 0.01)
    const alert = alertsByItem[item.id]
    const ship = item.linked_shipment_id ? shipmentMap[item.linked_shipment_id] : null
    const delayDays = ship?.predicted_delay_days || 0
    const arrivalDays = alert?.days_until_arrival ?? null
    const buffer = alert?.buffer_days ?? null
    const riskScore = ship?.risk_score || 0
    const bufferRisk = buffer !== null ? Math.max(0, 1 - buffer / 20) : 0.5
    const compositeRisk = Math.round((bufferRisk * 0.6 + riskScore * 0.4) * 100)
    const unitsAtRisk = buffer !== null && buffer < 0 ? Math.abs(buffer) * item.daily_consumption : 0
    const financialExposure = unitsAtRisk * (item.unit_cost_usd || 0)
    return { ...item, daysLeft, alert, ship, arrivalDays, buffer, riskScore, compositeRisk, financialExposure, delayDays }
  }).sort((a, b) => b.compositeRisk - a.compositeRisk), [items, alerts, shipments])

  const criticalCount = enriched.filter(e => e.alert?.alert_type === 'stockout_risk').length
  const watchCount = enriched.filter(e => e.alert?.alert_type === 'low_buffer').length
  const totalExposure = enriched.reduce((s, e) => s + e.financialExposure, 0)
  const activeAlerts = alerts.filter(a => ['stockout_risk', 'low_buffer', 'low_stock_no_shipment'].includes(a.alert_type))
  const safeCount = enriched.filter(e => !e.alert || e.alert?.alert_type === 'safe').length

  const chartData = enriched.map(e => ({
    name: e.user_label.length > 12 ? e.user_label.substring(0, 12) + '…' : e.user_label,
    risk: e.compositeRisk,
    color: e.compositeRisk >= 70 ? '#ef4444' : e.compositeRisk >= 40 ? '#f59e0b' : '#10b981'
  }))

  const scenEnriched = scenarioItem ? enriched.find(e => e.id === scenarioItem.id) || null : null
  const scDaysLeft = scenEnriched?.daysLeft || 0
  const scBaseArrival = scenEnriched?.arrivalDays ?? 20
  const scArrival = scBaseArrival + extraDelay
  const scBuffer = scDaysLeft - scArrival
  const scStatus: keyof typeof ALERT_META = scBuffer < 0 ? 'stockout_risk' : scBuffer < 3 ? 'low_buffer' : 'safe'
  const scUnitsShort = scBuffer < 0 ? Math.abs(scBuffer) * (scenarioItem?.daily_consumption || 0) : 0
  const scAirCost = scUnitsShort * (scenarioItem?.unit_cost_usd ?? 0) * 0.15
  const scStockCost = scUnitsShort * (scenarioItem?.unit_cost_usd ?? 0)

  if (loading) return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Inventory AI" subtitle="Connecting to neural ledger..." />
      <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <TopBar
        title="Inventory Intelligence"
        subtitle="End-to-end stockout prevention engine. Predictive analytics mapping global fleet delays to SKU-level depletion timelines."
        badges={[
          { label: 'Neural Monitoring Active', color: 'green' as const },
          ...(activeAlerts.length > 0 ? [{ label: `${activeAlerts.length} Critical Alerts`, color: 'red' as const }] : []),
        ]}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="max-w-none mx-auto space-y-8">

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {[
              { label: 'Catalog Size', value: items.length, bg: 'bg-white border-slate-200' },
              { label: 'Stockout Events', value: criticalCount, bg: 'bg-red-50 border-red-100 text-red-700' },
              { label: 'Buffer Vigilance', value: watchCount, bg: 'bg-amber-50 border-amber-100 text-amber-700' },
              { label: 'Resilient Items', value: safeCount, bg: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { label: 'At-Risk Value', value: fmt(totalExposure), bg: 'bg-slate-900 border-slate-800 text-white' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} border rounded-2xl p-6 shadow-sm flex flex-col justify-between transition-transform hover:scale-[1.02]`}>
                <p className="text-[10px] uppercase tracking-widest font-black opacity-60 mb-2">{k.label}</p>
                <p className="text-3xl font-black">{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Main View ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

            {/* Priority Feed */}
            <div className="xl:col-span-8 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Tactical Risk Priority</h2>
                <div className="flex gap-2">
                  <button onClick={handleRefresh} disabled={refreshing} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-sm disabled:opacity-50 text-slate-500">
                    <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                  <button onClick={() => setShowAdd(true)} className="bg-slate-900 text-white text-xs font-black uppercase px-4 py-2 rounded-lg shadow-lg hover:bg-black transition-all">
                    Register Asset
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        {['#', 'Asset Registry', 'Exhaustion', 'Vessel Arrival', 'Neural Sentiment', 'Resilience', 'Exposure', ''].map(h => (
                          <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enriched.map((e, idx) => {
                        const meta = e.alert ? ALERT_META[e.alert.alert_type] : null
                        return (
                          <tr key={e.id} onClick={() => setDetailItem(e)} className="group cursor-pointer hover:bg-blue-50/40 transition-all">
                            <td className="px-6 py-5 text-xs font-black text-slate-300">{(idx + 1).toString().padStart(2, '0')}</td>
                            <td className="px-6 py-5">
                              <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{e.user_label}</p>
                              <p className="text-[10px] font-bold text-slate-400 tracking-wider">SKU {e.sku}</p>
                            </td>
                            <td className={`px-6 py-5 text-sm font-black ${daysCls(e.daysLeft)}`}>{e.daysLeft.toFixed(1)}d</td>
                            <td className="px-6 py-5 text-xs font-bold text-slate-500 italic">
                              {e.arrivalDays != null ? `D+${e.arrivalDays.toFixed(1)}` : 'N/A'}
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${e.compositeRisk}%` }} />
                                </div>
                                <span className="text-[10px] font-black text-slate-400">{e.compositeRisk}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              {meta && <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border-2 border-current uppercase leading-none ${meta.badge}`}>{meta.label}</span>}
                            </td>
                            <td className="px-6 py-5 text-xs font-black">{e.financialExposure > 0 ? <span className="text-red-600">{fmt(e.financialExposure)}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-6 py-5">
                              <button onClick={ev => { ev.stopPropagation(); handleDelete(e.id) }} disabled={deletingId === e.id} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 font-black text-base">✕</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Sidebar Charts */}
            <div className="xl:col-span-4 space-y-8">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Aggregated Risk Index</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Bar dataKey="risk" radius={[0, 4, 4, 0]} barSize={16}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Scenario Section */}
              {items.length > 0 && (
                <div className="bg-slate-900 text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full -mr-24 -mt-24 blur-3xl" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-8">Disruption Simulator</h3>

                  <div className="space-y-8 mb-10">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Model Subject</p>
                      <select value={scenarioItem?.id} onChange={e => setScenarioItem(items.find(i => i.id === e.target.value) || null)} className="w-full bg-slate-800 border-none px-4 py-3 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500">
                        {items.map(i => <option key={i.id} value={i.id}>{i.user_label}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between mb-3 text-[10px] font-black uppercase text-slate-400">
                        <span>External Delay</span>
                        <span className="text-blue-400">+{extraDelay} Days</span>
                      </div>
                      <input type="range" min={0} max={30} step={1} value={extraDelay} onChange={e => setExtraDelay(Number(e.target.value))} className="w-full accent-blue-500 h-1 bg-slate-800 rounded-full" />
                    </div>
                  </div>

                  <div className={`p-6 rounded-2xl border-2 mb-8 ${scBuffer < 0 ? 'bg-red-500/10 border-red-500/40' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Projected Buffer</span>
                      <span className={`text-xl font-black italic ${daysCls(scBuffer)}`}>{scBuffer.toFixed(1)}d</span>
                    </div>
                    {scBuffer < 0 ? (
                      <div>
                        <p className="text-[10px] font-black text-red-400 uppercase mb-2">Scenario Impact</p>
                        <p className="text-sm font-black leading-snug">Stock depletion will occur {Math.abs(scBuffer).toFixed(1)} days prior to replenishment arrival.</p>
                        <div className="mt-6 pt-6 border-t border-red-500/20 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Stockout Deficit</p>
                            <p className="text-sm font-black">{scUnitsShort.toFixed(0)} units</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Exposure Value</p>
                            <p className="text-sm font-black text-red-500">{fmt(scStockCost)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] font-black text-emerald-400 uppercase italic">Resilience verified for this scenario.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddItemModal shipments={shipments} onClose={() => setShowAdd(false)} onSaved={load} />}
      {detailItem && <ItemDetailPanel item={detailItem} alert={alertsByItem[detailItem.id]} ship={detailItem.ship} onClose={() => setDetailItem(null)} />}
    </div>
  )
}