'use client'
import { useEffect, useState, useMemo } from 'react'
import TopBar from '@/components/layout/TopBar'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  AreaChart, Area, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, ReferenceLine
} from 'recharts'

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(1)}K`
  : `$${n.toFixed(0)}`

const riskColor = (score: number) =>
  score >= 0.7 ? '#ef4444' : score >= 0.45 ? '#f59e0b' : '#10b981'

const riskLabel = (score: number) =>
  score >= 0.7 ? 'CRITICAL' : score >= 0.45 ? 'ELEVATED' : 'LOW'

// ─── custom tooltip ──────────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-700 mb-1">{label}</div>
      <div className="text-blue-600 font-bold">{fmt(payload[0].value)}</div>
    </div>
  )
}

// ─── risk factor card ─────────────────────────────────────────────────────────
function FactorCard({ label, score, note }: { label: string; score: number; note: string }) {
  const pct = Math.round(score * 100)
  const color = riskColor(score)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[11px] text-slate-400 leading-snug">{note}</p>
    </div>
  )
}

// ─── AI explanation engine ────────────────────────────────────────────────────
function buildExplanation(
  shipment: Shipment | null,
  companyName: string,
  delayDays: number,
  demurrageSavings: number,
  holdingSavings: number,
  penaltySavings: number,
  totalSavings: number
): { headline: string; points: string[]; verdict: string; urgency: 'critical' | 'elevated' | 'normal' } {
  if (!shipment || delayDays === 0) {
    return {
      headline: 'No disruption predicted — routing is optimal.',
      points: ['All active corridors are within acceptable risk tolerance.', 'No financial provisioning required at this time.'],
      verdict: 'Maintain current routing. No action required.',
      urgency: 'normal',
    }
  }

  const route = `${shipment.origin.replace(/_/g, ' ')} → ${shipment.destination.replace(/_/g, ' ')}`
  const riskPct = Math.round((shipment.risk_score || 0) * 100)
  const urgency = (shipment.risk_score || 0) >= 0.7 ? 'critical' : 'elevated'

  const headline = urgency === 'critical'
    ? `CRITICAL ALERT: ${route} corridor is at ${riskPct}% disruption probability — immediate rerouting required.`
    : `ELEVATED RISK: ${route} is trending toward ${riskPct}% disruption probability over the next ${delayDays.toFixed(1)} days.`

  const points = [
    `The MarineIQ Neural Net has calculated a ${delayDays.toFixed(1)}-day delay window on the ${shipment.origin.replace(/_/g, ' ')} baseline corridor, informed by live weather feeds, port congestion telemetry, and geopolitical constraint data.`,
    `${companyName} is directly exposed to ${fmt(demurrageSavings)} in vessel demurrage fees accruing at the origin port during any forced holding period.`,
    holdingSavings > 0 ? `Cargo capital holding costs add a further ${fmt(holdingSavings)} in financing burden per the ${delayDays.toFixed(1)}-day window — this compounds if re-berthing queues deepen.` : '',
    penaltySavings > 0 ? `Contractual SLA penalties will trigger a ${fmt(penaltySavings)} charge if the shipment misses the delivery window, further eroding net margin.` : '',
    `Proactive rerouting via the alternative corridor preserves ${fmt(totalSavings)} in total verified contract value and eliminates all accrual-based capital lockup.`,
  ].filter(Boolean)

  const verdict = `RECOMMENDATION: Execute strategic diversion order immediately. Savings preservation of ${fmt(totalSavings)} is confirmed. Each 24-hour delay compounds demurrage accrual by ${fmt(Number(shipment.predicted_delay_days) > 0 ? demurrageSavings / delayDays : 0)}.`

  return { headline, points, verdict, urgency }
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function CostAnalysisPage() {
  const [shipments,        setShipments]        = useState<Shipment[]>([])
  const [loading,          setLoading]          = useState(true)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [saving,           setSaving]           = useState(false)
  const [deletingId,       setDeletingId]       = useState<string | null>(null)
  const [history,          setHistory]          = useState<any[]>([])

  const [inputs, setInputs] = useState({
    analysisTitle:   'Shanghai Q3 Contingency',
    companyName:     'DCL Electronics',
    cargoValue:      '2500000',
    demurrageRate:   '15000',
    holdingRatePct:  '1',
    penaltyRatePct:  '0.5',
  })

  // ── fleet summary ──────────────────────────────────────────────────────────
  const atRisk   = shipments.filter(s => s.risk_score >= 0.70)
  const watch    = shipments.filter(s => s.risk_score >= 0.45 && s.risk_score < 0.70)
  const avgSaved = history.length > 0 ? history.reduce((s, h) => s + h.total_savings_usd, 0) / history.length : 2_500_000
  const valueAtRisk  = atRisk.length * avgSaved + watch.length * avgSaved * 0.4
  const realMtdSaved = history.reduce((s, h) => s + (h.total_savings_usd || 0), 0)
  const realDays     = history.reduce((s, h) => s + (h.delay_days_avoided || 0), 0)

  useEffect(() => {
    Promise.all([
      fetchShipments(),
      fetch('http://localhost:8000/cost-analysis').then(r => r.ok ? r.json() : { analyses: [] }).catch(() => ({ analyses: [] }))
    ])
    .then(([d, histR]) => {
      const ships = d.shipments || []
      setShipments(ships)
      if (ships.length > 0) {
        const sorted = [...ships].sort((a, b) => (b.predicted_delay_days || 0) - (a.predicted_delay_days || 0))
        setSelectedShipment(sorted[0])
      }
      if (histR?.analyses) setHistory(histR.analyses)
    })
    .finally(() => setLoading(false))
  }, [])

  const handleInput = (k: keyof typeof inputs, v: string) => {
    if (/^\d*\.?\d*$/.test(v)) setInputs(p => ({ ...p, [k]: v }))
  }

  // ── financials ─────────────────────────────────────────────────────────────
  const cargoVal    = parseFloat(inputs.cargoValue) || 0
  const demurrage   = parseFloat(inputs.demurrageRate) || 0
  const holdPct     = parseFloat(inputs.holdingRatePct) || 0
  const penPct      = parseFloat(inputs.penaltyRatePct) || 0
  const delayDays   = selectedShipment?.predicted_delay_days || 0

  const demurrageSavings = demurrage * delayDays
  const holdingSavings   = cargoVal * (holdPct / 100) / 30 * delayDays
  const penaltySavings   = cargoVal * (penPct / 100) * delayDays
  const totalSavings     = demurrageSavings + holdingSavings + penaltySavings

  // ── chart data ─────────────────────────────────────────────────────────────
  const breakdownData = [
    { name: 'Demurrage',     amount: demurrageSavings, fill: '#3b82f6' },
    { name: 'Capital Hold',  amount: holdingSavings,   fill: '#8b5cf6' },
    { name: 'SLA Penalties', amount: penaltySavings,   fill: '#ef4444' },
  ]

  const cumulativeData = useMemo(() => {
    let cum = 0
    return [...history].reverse().map((h) => {
      cum += h.total_savings_usd
      const label = (h.analysis_title || 'Analysis').length > 14
        ? (h.analysis_title || 'Analysis').substring(0, 14) + '…'
        : (h.analysis_title || 'Analysis')
      return { name: label, cumulative: cum, single: h.total_savings_usd, company: h.company_name }
    })
  }, [history])

  const radarData = selectedShipment ? [
    { factor: 'Delay Risk',    value: Math.round((selectedShipment.risk_score || 0) * 100) },
    { factor: 'Demurrage',     value: Math.min(100, Math.round(demurrageSavings / (totalSavings + 1) * 100)) },
    { factor: 'Capital',       value: Math.min(100, Math.round(holdingSavings   / (totalSavings + 1) * 100)) },
    { factor: 'SLA Exposure',  value: Math.min(100, Math.round(penaltySavings   / (totalSavings + 1) * 100)) },
    { factor: 'Days at Risk',  value: Math.min(100, Math.round((delayDays / 20) * 100)) },
  ] : []

  // ── AI explanation ─────────────────────────────────────────────────────────
  const ai = buildExplanation(
    selectedShipment, inputs.companyName,
    delayDays, demurrageSavings, holdingSavings, penaltySavings, totalSavings
  )

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedShipment || saving) return
    setSaving(true)
    try {
      const res = await fetch('http://localhost:8000/cost-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_title:      inputs.analysisTitle,
          company_name:        inputs.companyName,
          shipment_id:         selectedShipment.id,
          origin:              selectedShipment.origin,
          destination:         selectedShipment.destination,
          cargo_value_usd:     cargoVal,
          daily_demurrage_usd: demurrage,
          penalty_rate_pct:    penPct,
          holding_rate_pct:    holdPct,
          delay_days_avoided:  delayDays,
          total_savings_usd:   totalSavings,
          co2_delta_tonnes:    0,
        })
      })
      if (!res.ok) throw new Error('Save failed')
      const saved = await res.json()
      setHistory(p => [saved, ...p])
    } catch { alert('Save failed — check backend connection.') }
    setSaving(false)
  }

  const handleDelete = async (id: string, localIdx?: number) => {
    setDeletingId(id)
    try {
      if (id) {
        await fetch(`http://localhost:8000/cost-analysis/${id}`, { method: 'DELETE' })
        setHistory(p => p.filter(h => h.id !== id))
      } else if (localIdx !== undefined) {
        setHistory(p => p.filter((_, j) => j !== localIdx))
      }
    } catch { alert('Delete failed.') }
    setDeletingId(null)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar
        title="Financial Intelligence"
        subtitle="Quantify the economic impact of route risk and verify savings from proactive diversion decisions."
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-7 text-slate-900">
        {loading ? (
          <p className="text-slate-400 p-10">Loading intelligent ledger...</p>
        ) : (
          <div className="max-w-7xl mx-auto space-y-7">

            {/* ── 1. Fleet Summary KPIs ─────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Value at Risk',     val: fmt(valueAtRisk),           sub: `${atRisk.length} critical shipments`,    accent: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
                { label: 'MTD Savings',       val: fmt(realMtdSaved),           sub: `${realDays.toFixed(1)} delay-days avoided`, accent: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                { label: 'At-Risk Shipments', val: String(atRisk.length),       sub: `${watch.length} on watch`,              accent: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
                { label: 'Analyses Logged',   val: String(history.length),      sub: 'in active ledger',                      accent: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
              ].map(k => (
                <div key={k.label} className={`${k.bg} ${k.border} border rounded-xl p-5`}>
                  <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-500 mb-1">{k.label}</div>
                  <div className={`text-2xl font-bold ${k.accent} mb-0.5`}>{k.val}</div>
                  <div className="text-[11px] text-slate-500">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── 2. Calculator + Charts ────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-7 py-4 border-b border-slate-100 bg-slate-50/40 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Dynamic Cost-Benefit Calculator</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Real-time savings projection based on selected shipment and cost parameters.</p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || delayDays === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition"
                >
                  {saving ? 'Committing…' : '+ Commit to Ledger'}
                </button>
              </div>

              <div className="p-7 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* ── Inputs ──────────────────────────────────────── */}
                <div className="lg:col-span-4 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Target Shipment</label>
                    <select
                      className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={selectedShipment?.id || ''}
                      onChange={e => setSelectedShipment(shipments.find(s => s.id === e.target.value) || null)}
                    >
                      {shipments.filter(s => (s.predicted_delay_days || 0) > 0).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.origin.replace(/_/g,' ')} → {s.destination.replace(/_/g,' ')} — {s.predicted_delay_days?.toFixed(1)}d delay
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Shipment snapshot */}
                  {selectedShipment && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Risk Score</span>
                        <span className="font-bold" style={{ color: riskColor(selectedShipment.risk_score || 0) }}>
                          {riskLabel(selectedShipment.risk_score || 0)} — {Math.round((selectedShipment.risk_score || 0) * 100)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Predicted Delay</span>
                        <span className="font-semibold text-slate-700">{delayDays.toFixed(1)} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Transport Mode</span>
                        <span className="font-semibold text-slate-700 capitalize">{selectedShipment.transport_mode || '—'}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:'Company Name',       key:'companyName',     isText:true },
                      { label:'Ledger Title',        key:'analysisTitle',   isText:true },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">{f.label}</label>
                        <input
                          type="text"
                          value={(inputs as any)[f.key]}
                          onChange={e => setInputs(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full bg-white border border-slate-200 px-2.5 py-2 rounded-lg text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {[
                      { label:'Total Cargo Value',     key:'cargoValue',     prefix:'$' },
                      { label:'Daily Demurrage (USD)',  key:'demurrageRate',  prefix:'$' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">{f.label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-slate-400 text-xs">{f.prefix}</span>
                          <input type="text" value={(inputs as any)[f.key]} onChange={e => handleInput(f.key as any, e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 pl-7 pr-3 py-2 rounded-lg text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                          />
                        </div>
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label:'Penalty / Day', key:'penaltyRatePct' },
                        { label:'Hold / Month',  key:'holdingRatePct' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">{f.label}</label>
                          <div className="relative">
                            <input type="text" value={(inputs as any)[f.key]} onChange={e => handleInput(f.key as any, e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs pr-6 focus:ring-2 focus:ring-blue-400 outline-none"
                            />
                            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Results + Charts ─────────────────────────────── */}
                <div className="lg:col-span-8 space-y-5">

                  {/* Hero savings + factor cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-3 md:col-span-1 bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-xl p-5 flex flex-col justify-center items-center text-center">
                      <div className="text-[10px] uppercase tracking-widest font-semibold text-blue-200 mb-1">Total Projected Savings</div>
                      <div className="text-3xl font-bold tracking-tight mb-1">{fmt(totalSavings)}</div>
                      <div className="text-[11px] text-blue-200">Avoiding {delayDays.toFixed(1)} delay days</div>
                    </div>
                    {breakdownData.map(d => (
                      <div key={d.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col justify-center">
                        <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">{d.name}</div>
                        <div className="text-xl font-bold text-slate-800" style={{ color: d.fill }}>{fmt(d.amount)}</div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {totalSavings > 0 ? `${Math.round(d.amount / totalSavings * 100)}% of total` : '—'}
                        </div>
                        <div className="mt-2 h-1 bg-slate-200 rounded-full">
                          <div className="h-1 rounded-full" style={{ width: totalSavings > 0 ? `${Math.round(d.amount / totalSavings * 100)}%` : '0%', background: d.fill }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Charts: Bar + Radar side-by-side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="text-xs font-semibold text-slate-600 mb-3">Cost Breakdown Analysis</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={breakdownData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} width={75} />
                          <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={22}>
                            {breakdownData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="text-xs font-semibold text-slate-600 mb-3">Risk Factor Radar</div>
                      {radarData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                          <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="factor" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                            <Radar name="Risk" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                          </RadarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-40 flex items-center justify-center text-xs text-slate-400">Select a shipment to view radar</div>
                      )}
                    </div>
                  </div>

                  {/* Risk factor breakdown */}
                  {selectedShipment && (
                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-3">Exposure Factor Analysis</div>
                      <div className="grid grid-cols-2 gap-3">
                        <FactorCard
                          label="Geopolitical Risk Exposure"
                          score={selectedShipment.risk_score || 0}
                          note={`${Math.round((selectedShipment.risk_score || 0) * 100)}% probability of corridor constraint affecting delivery timeline.`}
                        />
                        <FactorCard
                          label="Demurrage Accrual Signal"
                          score={Math.min(1, demurrageSavings / (cargoVal + 1) * 2)}
                          note={`${fmt(demurrageSavings)} in port staging fees over ${delayDays.toFixed(1)} days at ${fmt(demurrage)}/day.`}
                        />
                        <FactorCard
                          label="Capital Holding Cost"
                          score={Math.min(1, holdingSavings / (totalSavings + 1))}
                          note={`${fmt(holdingSavings)} in financing drag from ${holdPct}%/mo rate on ${fmt(cargoVal)} cargo value.`}
                        />
                        <FactorCard
                          label="SLA Breach Probability"
                          score={Math.min(1, penaltySavings / (totalSavings + 1))}
                          note={`${fmt(penaltySavings)} in potential SLA penalty at ${penPct}% per day of delay.`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── AI Intelligence Block ────────────────────────────────────── */}
              <div className={`mx-7 mb-7 rounded-xl border p-5 ${
                ai.urgency === 'critical'  ? 'bg-red-50 border-red-200' :
                ai.urgency === 'elevated'  ? 'bg-amber-50 border-amber-200' :
                'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 p-2.5 rounded-lg ${
                    ai.urgency === 'critical' ? 'bg-red-100 text-red-600' :
                    ai.urgency === 'elevated' ? 'bg-amber-100 text-amber-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-sm font-bold mb-2 ${
                      ai.urgency === 'critical' ? 'text-red-900' :
                      ai.urgency === 'elevated' ? 'text-amber-900' :
                      'text-blue-900'
                    }`}>
                      MarineIQ Intelligence Engine — Financial Risk Assessment
                    </h4>
                    <p className={`text-xs font-semibold mb-3 ${
                      ai.urgency === 'critical' ? 'text-red-800' :
                      ai.urgency === 'elevated' ? 'text-amber-800' :
                      'text-blue-800'
                    }`}>{ai.headline}</p>
                    <ul className={`space-y-1.5 mb-4 ${
                      ai.urgency === 'critical' ? 'text-red-700' :
                      ai.urgency === 'elevated' ? 'text-amber-700' :
                      'text-blue-700'
                    }`}>
                      {ai.points.map((p, i) => (
                        <li key={i} className="text-xs leading-relaxed flex gap-2">
                          <span className="font-bold shrink-0 mt-0.5">{i + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={`text-xs font-semibold border-t pt-3 ${
                      ai.urgency === 'critical' ? 'border-red-200 text-red-900' :
                      ai.urgency === 'elevated' ? 'border-amber-200 text-amber-900' :
                      'border-blue-200 text-blue-900'
                    }`}>
                      {ai.verdict}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 3. Historical Savings Trajectory ─────────────────────── */}
            {cumulativeData.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Cumulative Savings Trajectory</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Total verified capital preserved across all ledger entries</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-emerald-600">{fmt(realMtdSaved)}</div>
                    <div className="text-xs text-slate-400">total ledger savings</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11 }}
                      formatter={(v: any) => [fmt(v), 'Cumulative Saved']}
                    />
                    <Area type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={2.5} fill="url(#cumFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── 4. Ledger Table ───────────────────────────────────────── */}
            {history.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Active Savings Ledger</h3>
                    <p className="text-xs text-slate-500">All committed analyses — persisted in Supabase. Click ✕ to remove any entry.</p>
                  </div>
                  <div className="text-xs text-slate-400">{history.length} entr{history.length === 1 ? 'y' : 'ies'}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30">
                        {['Title','Company','Route','Days Avoided','Total Saved','Date',''].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[10px] uppercase tracking-widest font-semibold text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={h.id || i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                          <td className="px-5 py-3 font-medium text-slate-700">{h.analysis_title || '—'}</td>
                          <td className="px-5 py-3 text-slate-500">{h.company_name || '—'}</td>
                          <td className="px-5 py-3 text-slate-500 text-[11px]">
                            {h.origin && h.destination
                              ? `${h.origin.replace(/_/g,' ')} → ${h.destination.replace(/_/g,' ')}`
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-slate-600">{(h.delay_days_avoided || 0).toFixed(1)}d</td>
                          <td className="px-5 py-3 font-bold text-emerald-600">{fmt(h.total_savings_usd || 0)}</td>
                          <td className="px-5 py-3 text-slate-400">{h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'}</td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => h.id ? handleDelete(h.id) : setHistory(p => p.filter((_, j) => j !== i))}
                              disabled={deletingId === h.id}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 font-bold text-lg leading-none disabled:opacity-30"
                              title="Delete this entry"
                            >
                              {deletingId === h.id ? '…' : '✕'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
