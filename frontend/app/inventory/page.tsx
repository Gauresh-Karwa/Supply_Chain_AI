'use client'
import { useEffect, useState, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API = 'http://localhost:8000'

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

const ALERT_META = {
  stockout_risk:         { color: 'bg-red-50 border-red-200',    icon: '⚠',  iconColor: 'text-red-500',    badge: 'bg-red-100 text-red-700 border-red-200',    label: 'Stockout Risk'   },
  low_buffer:            { color: 'bg-amber-50 border-amber-200', icon: '⚡', iconColor: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Low Buffer'      },
  safe:                  { color: 'bg-emerald-50 border-emerald-100', icon: '✓', iconColor: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Safe'   },
  low_stock_no_shipment: { color: 'bg-orange-50 border-orange-200', icon: '●', iconColor: 'text-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'No Supply' },
}

function daysBg(days: number) {
  if (days < 0)  return 'text-red-600 font-bold'
  if (days < 3)  return 'text-red-500 font-semibold'
  if (days < 7)  return 'text-amber-600 font-semibold'
  return 'text-emerald-600 font-medium'
}

// Visual timeline bar: shows stock duration vs arrival vs buffer
function TimelineBar({ stockDays, arrivalDays }: { stockDays: number; arrivalDays: number }) {
  const total = Math.max(stockDays, arrivalDays, 1) * 1.2
  const stockPct = Math.min((stockDays / total) * 100, 100)
  const arrivalPct = Math.min((arrivalDays / total) * 100, 100)
  const gap = arrivalDays > stockDays
  return (
    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden w-full">
      <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400/70 transition-all"
        style={{ width: `${stockPct}%` }} title={`Stock lasts ${stockDays.toFixed(1)}d`} />
      <div className="absolute top-0 h-full w-0.5 bg-slate-700/40"
        style={{ left: `${arrivalPct}%` }} title={`Ship arrives at ${arrivalDays.toFixed(1)}d`} />
      {gap && (
        <div className="absolute top-0 h-full bg-red-400/30"
          style={{ left: `${stockPct}%`, width: `${Math.min(arrivalPct - stockPct, 100 - stockPct)}%` }} />
      )}
    </div>
  )
}

function AddItemModal({ shipments, onClose, onSaved }: { shipments: Shipment[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    user_label: '', sku: '', current_stock_units: '', daily_consumption: '',
    linked_shipment_id: '', incoming_quantity: '', reorder_point: '', unit_cost_usd: ''
  })
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.user_label || !form.current_stock_units || !form.daily_consumption) return
    setSaving(true)
    await fetch(`${API}/inventory/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_label: form.user_label, sku: form.sku || 'N/A',
        current_stock_units: parseFloat(form.current_stock_units),
        daily_consumption: parseFloat(form.daily_consumption),
        linked_shipment_id: form.linked_shipment_id || null,
        incoming_quantity: parseFloat(form.incoming_quantity) || 0,
        reorder_point: parseFloat(form.reorder_point) || 0,
        unit_cost_usd: parseFloat(form.unit_cost_usd) || 0,
      })
    })
    setSaving(false); onSaved(); onClose()
  }

  const inp = 'w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'text-xs font-semibold uppercase text-slate-500 block mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-screen overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Register Inventory Item</h2>
            <p className="text-xs text-slate-400 mt-0.5">Link to an inbound shipment to enable automatic stockout prediction.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Item Label *</label><input value={form.user_label} onChange={e => set('user_label', e.target.value)} placeholder="Engine Components" className={inp} /></div>
            <div><label className={lbl}>SKU</label><input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="ENG-447" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Current Stock (units) *</label><input type="number" value={form.current_stock_units} onChange={e => set('current_stock_units', e.target.value)} placeholder="500" className={inp} /></div>
            <div><label className={lbl}>Daily Consumption *</label><input type="number" value={form.daily_consumption} onChange={e => set('daily_consumption', e.target.value)} placeholder="25/day" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Reorder Point (units)</label><input type="number" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} placeholder="100" className={inp} /></div>
            <div><label className={lbl}>Unit Cost (USD)</label><div className="relative"><span className="absolute left-3 top-2 text-slate-400 text-sm">$</span><input type="number" value={form.unit_cost_usd} onChange={e => set('unit_cost_usd', e.target.value)} placeholder="45.00" className={inp + ' pl-6'} /></div></div>
          </div>
          <div>
            <label className={lbl}>Link to Inbound Shipment</label>
            <select value={form.linked_shipment_id} onChange={e => set('linked_shipment_id', e.target.value)} className={inp}>
              <option value="">— No shipment linked —</option>
              {shipments.map(s => (
                <option key={s.id} value={s.id}>
                  {s.origin.replace(/_/g, ' ')} → {s.destination.replace(/_/g, ' ')}
                  {s.predicted_delay_days > 0 ? ` (+${s.predicted_delay_days.toFixed(1)}d delay)` : ' (on time)'}
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
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
            {saving ? 'Saving…' : 'Register Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [alerts, setAlerts] = useState<InventoryAlert[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [extraDelay, setExtraDelay] = useState(0)

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
    if (its.length > 0) setSelectedItem(i => i ?? its[0])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    await fetch(`${API}/inventory/items/${id}`, { method: 'DELETE' }); load()
  }
  const handleRefresh = async () => {
    setRefreshing(true)
    await fetch(`${API}/inventory/alerts/refresh`, { method: 'POST' })
    await load(); setRefreshing(false)
  }

  // Lookup maps
  const shipmentMap: Record<string, Shipment> = {}
  shipments.forEach(s => { shipmentMap[s.id] = s })
  const alertsByItem: Record<string, InventoryAlert> = {}
  alerts.forEach(a => { alertsByItem[a.inventory_item_id] = a })

  // Derived enriched items
  const enriched = items.map(item => {
    const daysLeft = item.current_stock_units / Math.max(item.daily_consumption, 0.01)
    const alert = alertsByItem[item.id]
    const ship = item.linked_shipment_id ? shipmentMap[item.linked_shipment_id] : null
    const delayDays = ship?.predicted_delay_days || 0
    const arrivalDays = alert?.days_until_arrival ?? null
    const buffer = alert?.buffer_days ?? null
    const riskScore = ship?.risk_score || 0
    // Composite risk: blend of buffer tightness and ship risk
    const bufferRisk = buffer !== null ? Math.max(0, 1 - buffer / 20) : 0.5
    const compositeRisk = Math.round((bufferRisk * 0.6 + riskScore * 0.4) * 100)
    // Financial exposure: units at risk × unit cost
    const unitsAtRisk = buffer !== null && buffer < 0 ? Math.abs(buffer) * item.daily_consumption : 0
    const financialExposure = unitsAtRisk * (item.unit_cost_usd || 0)
    return { ...item, daysLeft, alert, ship, arrivalDays, buffer, riskScore, compositeRisk, financialExposure, delayDays }
  }).sort((a, b) => b.compositeRisk - a.compositeRisk)

  // KPIs
  const criticalCount = enriched.filter(e => e.alert?.alert_type === 'stockout_risk').length
  const watchCount = enriched.filter(e => e.alert?.alert_type === 'low_buffer').length
  const totalExposure = enriched.reduce((s, e) => s + e.financialExposure, 0)
  const activeAlerts = alerts.filter(a => a.alert_type === 'stockout_risk' || a.alert_type === 'low_buffer' || a.alert_type === 'low_stock_no_shipment')

  // Chart data
  const chartData = enriched.map(e => ({
    name: e.user_label.length > 12 ? e.user_label.substring(0, 12) + '…' : e.user_label,
    risk: e.compositeRisk,
    color: e.compositeRisk >= 70 ? '#ef4444' : e.compositeRisk >= 40 ? '#f59e0b' : '#10b981'
  }))

  // Scenario for selected item
  const scenarioEnriched = selectedItem ? enriched.find(e => e.id === selectedItem.id) || null : null
  const scDaysLeft = scenarioEnriched?.daysLeft || 0
  const scBaseArrival = scenarioEnriched?.arrivalDays ?? 20
  const scArrival = scBaseArrival + extraDelay
  const scBuffer = scDaysLeft - scArrival
  const scStatus: keyof typeof ALERT_META = scBuffer < 0 ? 'stockout_risk' : scBuffer < 3 ? 'low_buffer' : 'safe'
  const scUnitsShort = scBuffer < 0 ? Math.abs(scBuffer) * (selectedItem?.daily_consumption || 0) : 0
  const scAirFreightCost = scUnitsShort * (selectedItem?.unit_cost_usd ?? 0) * 0.15 // ~15% premium for air
  const scStockoutCost = scUnitsShort * (selectedItem?.unit_cost_usd ?? 0)

  if (loading) return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Inventory Alerting" subtitle="Loading…" />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar
        title="Inventory Alerting"
        subtitle="Real-time stockout risk detection driven by ML delay predictions on linked inbound shipments."
        badges={[
          { label: `${activeAlerts.length} Active Alerts`, color: activeAlerts.length > 0 ? 'red' as const : 'green' as const },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="max-w-7xl mx-auto space-y-5">

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Items Tracked', value: items.length, color: 'text-slate-800' },
              { label: 'Stockout Risk', value: criticalCount, color: 'text-red-600' },
              { label: 'Low Buffer', value: watchCount, color: 'text-amber-600' },
              { label: 'Financial Exposure', value: totalExposure > 0 ? `$${(totalExposure/1000).toFixed(0)}K` : '$0', color: 'text-blue-600' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">{k.label}</p>
                <p className={`text-3xl font-light ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── Active Alerts ── */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Active Alerts</h2>
                <button onClick={handleRefresh} disabled={refreshing} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {refreshing ? '↻ Recomputing…' : '↻ Recompute'}
                </button>
              </div>
              {activeAlerts.map(alert => {
                const meta = ALERT_META[alert.alert_type]
                const item = items.find(i => i.id === alert.inventory_item_id)
                const ship = item?.linked_shipment_id ? shipmentMap[item.linked_shipment_id] : null
                return (
                  <div key={alert.id} className={`border rounded-xl p-4 ${meta.color}`}>
                    <div className="flex items-start gap-3">
                      <span className={`text-lg shrink-0 mt-0.5 ${meta.iconColor}`}>{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-slate-800">{item?.user_label}</h3>
                          {item?.sku && <span className="text-[10px] text-slate-400">{item.sku}</span>}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed mb-2">{alert.message}</p>
                        {/* Visual Timeline */}
                        {alert.days_until_stockout != null && alert.days_until_arrival != null && (
                          <div className="mb-2">
                            <TimelineBar stockDays={alert.days_until_stockout} arrivalDays={alert.days_until_arrival} />
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400/70 inline-block" />Stock: {alert.days_until_stockout.toFixed(1)}d</span>
                              <span>|</span>
                              <span>Ship arrives: {alert.days_until_arrival.toFixed(1)}d</span>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-1">
                          {alert.buffer_days != null && <span>Buffer: <strong className={daysBg(alert.buffer_days)}>{alert.buffer_days.toFixed(1)}d</strong></span>}
                          {alert.shipment_risk_score != null && <span>Ship risk: <strong>{(alert.shipment_risk_score*100).toFixed(0)}%</strong></span>}
                          {ship && <span>Vessel: <strong>{ship.origin.replace(/_/g,' ')} → {ship.destination.replace(/_/g,' ')}</strong></span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Main: Priority Queue + Risk Chart side-by-side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Priority Queue table */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-slate-800">Inventory Risk Priority Queue</h2>
                <div className="flex gap-2">
                  <button onClick={handleRefresh} disabled={refreshing} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                    {refreshing ? '↻' : '↻ Refresh'}
                  </button>
                  <button onClick={() => setShowAdd(true)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium transition">
                    + Add Item
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-sm text-slate-400 mb-4">No inventory items registered yet.</p>
                  <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition">
                    Register your first item
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['#', 'Item', 'Stock Left', 'Arrival', 'Timeline', 'Risk Score', 'Exposure', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {enriched.map((e, idx) => {
                        const meta = e.alert ? ALERT_META[e.alert.alert_type] : null
                        return (
                          <tr key={e.id}
                            onClick={() => setSelectedItem(e)}
                            className={`transition-colors cursor-pointer ${selectedItem?.id === e.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-slate-800">{e.user_label}</p>
                              <p className="text-[10px] text-slate-400">{e.sku}</p>
                            </td>
                            <td className={`px-4 py-3 text-sm whitespace-nowrap ${daysBg(e.daysLeft)}`}>{e.daysLeft.toFixed(1)}d</td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {e.arrivalDays != null ? `${e.arrivalDays.toFixed(1)}d` : <span className="text-slate-300">None</span>}
                              {e.delayDays > 0 && <span className="text-amber-500 ml-1">(+{e.delayDays.toFixed(1)}d)</span>}
                            </td>
                            <td className="px-4 py-3 w-28">
                              {e.arrivalDays != null
                                ? <TimelineBar stockDays={e.daysLeft} arrivalDays={e.arrivalDays} />
                                : <span className="text-[10px] text-slate-300">No shipment</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${e.compositeRisk}%`, background: e.compositeRisk >= 70 ? '#ef4444' : e.compositeRisk >= 40 ? '#f59e0b' : '#10b981' }} />
                                </div>
                                {meta && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {e.financialExposure > 0
                                ? <span className="font-semibold text-red-600">${e.financialExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                : <span className="text-slate-300">$0</span>}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={e2 => { e2.stopPropagation(); handleDelete(e.id) }}
                                className="text-[10px] text-slate-400 hover:text-red-500 transition">✕</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Risk Bar Chart */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Composite Risk Scores</h3>
              <p className="text-[10px] text-slate-400 mb-4">Blend of buffer tightness × ship risk</p>
              {chartData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-300">No data</div>
              ) : (
                <div className="flex-1" style={{ minHeight: 200 }}>
                  <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 38)}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 4, left: 4, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 11 }} formatter={(v: any) => [`${v}`, 'Risk Score']} />
                      <Bar dataKey="risk" radius={[0, 4, 4, 0]} barSize={18}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ── Scenario Planner + Financial Impact ── */}
          {items.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Delay Scenario Planner</h2>
                <p className="text-xs text-slate-500 mt-0.5">Simulate additional shipment delays across your fleet and see financial impact.</p>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Controls */}
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500 block mb-2">Simulate for Item</label>
                    <select value={selectedItem?.id || items[0]?.id} onChange={e => setSelectedItem(items.find(i => i.id === e.target.value) || null)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      {items.map(i => <option key={i.id} value={i.id}>{i.user_label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500 block mb-2">
                      Additional Delay: <span className="text-blue-600 font-bold">+{extraDelay} days</span>
                    </label>
                    <input type="range" min={0} max={30} step={1} value={extraDelay}
                      onChange={e => setExtraDelay(Number(e.target.value))} className="w-full accent-blue-600" />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>0d</span><span>30d</span></div>
                  </div>
                  {scenarioEnriched?.ship && (
                    <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                      <p>Vessel:  <strong>{scenarioEnriched.ship.origin.replace(/_/g,' ')} → {scenarioEnriched.ship.destination.replace(/_/g,' ')}</strong></p>
                      <p>Current delay: <strong className="text-amber-600">{scenarioEnriched.ship.predicted_delay_days.toFixed(1)}d</strong></p>
                      <p>Risk score: <strong>{(scenarioEnriched.ship.risk_score * 100).toFixed(0)}%</strong></p>
                    </div>
                  )}
                </div>

                {/* Scenario result */}
                <div className={`rounded-xl p-5 border ${ALERT_META[scStatus].color}`}>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${ALERT_META[scStatus].badge}`}>
                    {ALERT_META[scStatus].label}
                  </span>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Stock depletes</span><span className={`font-semibold ${daysBg(scDaysLeft)}`}>{scDaysLeft.toFixed(1)}d</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Ship arrives</span><span className="font-semibold text-slate-800">{scArrival.toFixed(1)}d</span></div>
                    <div className="flex justify-between border-t border-slate-200/60 pt-3"><span className="text-slate-500">Buffer</span><span className={`font-bold text-lg ${daysBg(scBuffer)}`}>{scBuffer.toFixed(1)}d</span></div>
                  </div>
                  {scBuffer < 0 && (
                    <div className="mt-3 border-t border-current/20 pt-3 text-xs text-slate-600">
                      You will be <strong className="text-red-600">{scUnitsShort.toFixed(0)} units</strong> short for {Math.abs(scBuffer).toFixed(1)} days.
                    </div>
                  )}
                </div>

                {/* Financial Impact Card */}
                <div className="bg-slate-900 rounded-xl p-5 text-white">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Financial Impact</h4>
                  {scBuffer >= 0 ? (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">✓</span>
                      <p className="text-sm text-emerald-400 font-medium">No financial exposure under this scenario.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] text-slate-400 mb-1">Emergency Air Freight Cost</p>
                        <p className="text-2xl font-semibold text-amber-400">
                          {scAirFreightCost > 0 ? `$${scAirFreightCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">~15% premium on {scUnitsShort.toFixed(0)} units at ${selectedItem?.unit_cost_usd ?? 0}/unit</p>
                      </div>
                      <div className="border-t border-slate-700 pt-4">
                        <p className="text-[10px] text-slate-400 mb-1">Stockout Cost (if no action taken)</p>
                        <p className="text-2xl font-semibold text-red-400">
                          {scStockoutCost > 0 ? `$${scStockoutCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">Lost production value of missing stock</p>
                      </div>
                      {scAirFreightCost > 0 && scStockoutCost > scAirFreightCost && (
                        <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-lg p-3">
                          <p className="text-xs text-emerald-400 font-semibold">
                            Recommendation: Emergency order saves ${(scStockoutCost - scAirFreightCost).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. letting stockout occur.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {showAdd && (
        <AddItemModal shipments={shipments} onClose={() => setShowAdd(false)} onSaved={load} />
      )}
    </div>
  )
}
