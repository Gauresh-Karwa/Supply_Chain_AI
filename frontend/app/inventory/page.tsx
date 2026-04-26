'use client'
import { useEffect, useState, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Cell,
} from 'recharts'

interface InventoryItem {
  id:                   string
  user_label:           string
  sku:                  string
  current_stock_units:  number
  daily_consumption:    number
  incoming_quantity:    number
  reorder_point:        number
  unit_cost_usd:        number
  linked_shipment_id:   string | null
  warehouse_location:   string | null
  cargo_type:           string | null
}

interface LinkedShipment {
  id:                   string
  origin:               string
  destination:          string
  departure_time:       string
  predicted_delay_days: number
  risk_score:           number
}

interface AnalysedItem extends InventoryItem {
  shipment:            LinkedShipment | null
  days_until_stockout: number
  days_until_arrival:  number
  buffer_days:         number
  alert_level:         'critical' | 'warning' | 'safe'
  financial_exposure:  number
}

function analyseItem(item: InventoryItem, shipment: LinkedShipment | null): AnalysedItem {
  const dailyRate = item.daily_consumption ?? 0
  const daysUntilStockout = dailyRate > 0
    ? item.current_stock_units / dailyRate
    : 999

  let daysUntilArrival = 999
  if (shipment) {
    const departure   = new Date(shipment.departure_time)
    const now         = new Date()
    const elapsedDays = (now.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24)
    const baseTransit = 22
    daysUntilArrival  = Math.max(0, baseTransit - elapsedDays + (shipment.predicted_delay_days ?? 0))
  }

  const bufferDays       = daysUntilStockout - daysUntilArrival
  const alertLevel       = bufferDays < 0 ? 'critical' : bufferDays < 4 ? 'warning' : 'safe'
  const financialExposure = bufferDays < 0
    ? Math.abs(bufferDays) * dailyRate * (item.unit_cost_usd ?? 0)
    : 0

  return {
    ...item,
    shipment,
    days_until_stockout: Math.round(daysUntilStockout * 10) / 10,
    days_until_arrival:  Math.round(daysUntilArrival * 10) / 10,
    buffer_days:         Math.round(bufferDays * 10) / 10,
    alert_level:         alertLevel,
    financial_exposure:  financialExposure,
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

const ALERT_COLORS: Record<string, string> = {
  critical: '#dc2626',
  warning:  '#d97706',
  safe:     '#16a34a',
}

function AlertCard({ item }: { item: AnalysedItem }) {
  const crit = item.alert_level === 'critical'

  return (
    <div style={{
      background:   crit ? '#fef2f2' : '#fffbeb',
      border:       `1px solid ${crit ? '#fecaca' : '#fde68a'}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.user_label}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {item.sku} — {item.warehouse_location ?? 'Warehouse'}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
          background: crit ? '#dc2626' : '#d97706', color: 'white',
        }}>
          {crit ? 'STOCKOUT RISK' : 'LOW BUFFER'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Stock remaining',  value: `${item.current_stock_units.toLocaleString()} units`, color: '#0f172a' },
          { label: 'Days of stock',    value: `${item.days_until_stockout}d`,                        color: crit ? '#dc2626' : '#d97706' },
          { label: 'Shipment arrives', value: item.shipment ? `~${item.days_until_arrival.toFixed(0)}d` : 'No shipment', color: '#1d4ed8' },
          { label: 'Buffer',           value: `${item.buffer_days}d`,                                color: item.buffer_days < 0 ? '#dc2626' : '#d97706' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'white', borderRadius: 8, padding: '8px 10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'white', borderRadius: 8, padding: '10px 12px',
        border: `1px solid ${crit ? '#fecaca' : '#fde68a'}`,
        fontSize: 11, color: '#475569', lineHeight: 1.6,
      }}>
        {crit ? (
          <>
            <strong style={{ color: '#dc2626' }}>Stockout in {item.days_until_stockout} days.</strong>{' '}
            {item.user_label} will run out {Math.abs(item.buffer_days).toFixed(1)} days before the{' '}
            {item.shipment ? `${item.shipment.origin} to ${item.shipment.destination}` : 'incoming'}{' '}
            shipment arrives.
            {item.financial_exposure > 0 && (
              <> Estimated production impact:{' '}
                <strong style={{ color: '#dc2626' }}>{fmt(item.financial_exposure)}</strong>.
              </>
            )}{' '}
            Consider emergency sourcing or expediting the linked shipment.
          </>
        ) : (
          <>
            <strong style={{ color: '#d97706' }}>Low buffer warning.</strong>{' '}
            Only {item.buffer_days.toFixed(1)} days of buffer between stockout and shipment arrival.
            {item.shipment && item.shipment.risk_score > 0.45 && (
              ' The linked shipment carries elevated risk — monitor closely.'
            )}
          </>
        )}
      </div>

      {item.shipment && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            Linked: {item.shipment.origin} to {item.shipment.destination} —{' '}
            <span style={{
              color: item.shipment.risk_score >= 0.7 ? '#dc2626'
                   : item.shipment.risk_score >= 0.45 ? '#d97706' : '#16a34a',
              fontWeight: 600,
            }}>
              {Math.round(item.shipment.risk_score * 100)}% risk
            </span>
          </div>
          <a href="/fleet-tracker" style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 600 }}>
            View shipment
          </a>
        </div>
      )}
    </div>
  )
}

export default function InventoryPage() {
  const [items,    setItems]    = useState<AnalysedItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [scenario, setScenario] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: rawItems } = await supabase.from('inventory_items').select('*')
      const shipmentIds = (rawItems ?? []).map((i: any) => i.linked_shipment_id).filter(Boolean)

      let shipmentMap: Record<string, any> = {}
      if (shipmentIds.length > 0) {
        const { data: ships } = await supabase
          .from('shipments')
          .select('id,origin,destination,departure_time,predicted_delay_days,risk_score')
          .in('id', shipmentIds)
        shipmentMap = Object.fromEntries((ships ?? []).map((s: any) => [s.id, s]))
      }

      const analysed: AnalysedItem[] = (rawItems ?? []).map((item: any) =>
        analyseItem(item, item.linked_shipment_id ? shipmentMap[item.linked_shipment_id] ?? null : null)
      ).sort((a: AnalysedItem, b: AnalysedItem) => {
        const order: Record<string, number> = { critical: 0, warning: 1, safe: 2 }
        return order[a.alert_level] - order[b.alert_level]
      })

      setItems(analysed)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('inv-shipments')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shipments' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const critical      = items.filter(i => i.alert_level === 'critical')
  const warning       = items.filter(i => i.alert_level === 'warning')
  const safe          = items.filter(i => i.alert_level === 'safe')
  const totalExposure = critical.reduce((s, i) => s + i.financial_exposure, 0)

  // Scenario planner — forecast impact of additional delays
  const scenarioItems = items.map(item => {
    const adjusted = {
      ...item,
      days_until_arrival: item.days_until_arrival + scenario,
      buffer_days:        item.buffer_days - scenario,
    }
    return {
      ...adjusted,
      alert_level: adjusted.buffer_days < 0 ? 'critical' : adjusted.buffer_days < 4 ? 'warning' : 'safe',
    } as AnalysedItem
  })

  // Chart: stock coverage bars — all items
  const coverageData = items.map(item => ({
    name:     item.user_label.split(' ').slice(0, 2).join(' '),
    stock:    item.days_until_stockout,
    arrival:  item.days_until_arrival < 999 ? item.days_until_arrival : null,
    level:    item.alert_level,
  }))

  // Chart: exposure by item (critical only)
  const exposureData = critical.map(item => ({
    name:      item.user_label.split(' ').slice(0, 2).join(' '),
    exposure:  Math.round(item.financial_exposure / 1000),
  })).sort((a, b) => b.exposure - a.exposure)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Inventory intelligence"
        subtitle="Stockout risk monitoring linked to live shipment delay predictions"
        badges={[
          ...(critical.length > 0 ? [{ label: `${critical.length} critical`, color: 'red'   as const }] : []),
          ...(warning.length  > 0 ? [{ label: `${warning.length} warnings`,  color: 'amber' as const }] : []),
          { label: `${safe.length} on track`, color: 'green' as const },
        ]}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          Loading inventory data...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px' }}>

            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Items monitored',    value: String(items.length),    color: '#1d4ed8' },
                { label: 'Critical alerts',    value: String(critical.length), color: '#dc2626' },
                { label: 'Financial exposure', value: fmt(totalExposure),      color: '#dc2626' },
                { label: 'On track',           value: String(safe.length),     color: '#16a34a' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Two-column layout: alerts left, charts right */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

              {/* LEFT: Active alerts + scenario planner + safe table */}
              <div>
                {(critical.length > 0 || warning.length > 0) && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Active alerts — {critical.length + warning.length} items need attention
                    </div>
                    {[...critical, ...warning].map(item => (
                      <AlertCard key={item.id} item={item} />
                    ))}
                  </div>
                )}

                {/* Delay Impact Analyser */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                  {/* Header */}
                  <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                      Delay impact analyser
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Stress-test your inventory against transit disruptions to identify which items need immediate action.
                    </div>
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    {/* Preset scenario buttons */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick scenarios</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Port congestion', days: 5,  desc: '+5d' },
                          { label: 'Red Sea reroute', days: 12, desc: '+12d' },
                          { label: 'Typhoon delay',   days: 18, desc: '+18d' },
                          { label: 'Reset',           days: 0,  desc: '0d'   },
                        ].map(p => (
                          <button
                            key={p.label}
                            onClick={() => setScenario(p.days)}
                            style={{
                              fontSize: 11, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                              fontWeight: scenario === p.days ? 700 : 500,
                              background: scenario === p.days ? '#0f172a' : '#f8fafc',
                              color: scenario === p.days ? '#fff' : '#475569',
                              border: scenario === p.days ? '1px solid #0f172a' : '1px solid #e2e8f0',
                              transition: 'all 0.15s',
                            }}
                          >
                            {p.label} <span style={{ opacity: 0.6 }}>{p.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom slider */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Custom delay</span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: scenario === 0 ? '#16a34a' : scenario <= 7 ? '#d97706' : '#dc2626',
                        }}>
                          +{scenario} days
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={21} value={scenario}
                        onChange={e => setScenario(Number(e.target.value))}
                        style={{ width: '100%', accentColor: scenario === 0 ? '#16a34a' : scenario <= 7 ? '#d97706' : '#dc2626' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#cbd5e1', marginTop: 2 }}>
                        <span>0d</span><span>7d</span><span>14d</span><span>21d</span>
                      </div>
                    </div>

                    {/* Impact metrics — always visible */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: scenario > 0 ? 16 : 0 }}>
                      {(() => {
                        const nowCritical    = scenarioItems.filter(i => i.alert_level === 'critical').length
                        const nowWarning     = scenarioItems.filter(i => i.alert_level === 'warning').length
                        const nowSafe        = scenarioItems.filter(i => i.alert_level === 'safe').length
                        const addlExposure   = scenarioItems.reduce((s, i) => s + i.financial_exposure, 0) -
                                               items.reduce((s2, i) => s2 + i.financial_exposure, 0)
                        const bufferLost     = scenario * items.filter(i => i.shipment).length
                        return [
                          { label: 'Critical items',    value: String(nowCritical),         color: nowCritical > 0 ? '#dc2626' : '#16a34a', bg: nowCritical > 0 ? '#fef2f2' : '#f0fdf4', border: nowCritical > 0 ? '#fecaca' : '#bbf7d0' },
                          { label: 'At-risk items',     value: String(nowWarning),          color: nowWarning > 0 ? '#d97706' : '#475569',   bg: nowWarning > 0 ? '#fffbeb' : '#f8fafc',  border: nowWarning > 0 ? '#fde68a' : '#e2e8f0' },
                          { label: 'Safe items',        value: String(nowSafe),             color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                          { label: 'Added exposure',    value: addlExposure > 0 ? fmt(addlExposure) : '—', color: addlExposure > 0 ? '#dc2626' : '#475569', bg: addlExposure > 0 ? '#fef2f2' : '#f8fafc', border: addlExposure > 0 ? '#fecaca' : '#e2e8f0' },
                        ].map(({ label, value, color, bg, border }) => (
                          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          </div>
                        ))
                      })()}
                    </div>

                    {/* Per-item impact table */}
                    {scenario > 0 && (() => {
                      const changed = scenarioItems.filter((sci, idx) => {
                        const orig = items[idx]
                        return sci.alert_level !== orig.alert_level || sci.buffer_days < orig.buffer_days
                      }).sort((a, b) => {
                        const order: Record<string, number> = { critical: 0, warning: 1, safe: 2 }
                        return order[a.alert_level] - order[b.alert_level]
                      })
                      if (changed.length === 0) return (
                        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                          All items remain stable under this scenario.
                        </div>
                      )
                      return (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            Items affected by +{scenario} day delay
                          </div>
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                  {['Product', 'Status after', 'Buffer lost', 'New stockout', 'Action needed'].map(h => (
                                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {changed.map((sci, idx) => {
                                  const orig = items.find(i => i.id === sci.id)
                                  const bufferChange = orig ? sci.buffer_days - orig.buffer_days : 0
                                  const action = sci.alert_level === 'critical'
                                    ? 'Emergency source now'
                                    : sci.alert_level === 'warning'
                                    ? 'Monitor closely'
                                    : 'Buffer reduced'
                                  return (
                                    <tr key={sci.id} style={{ borderBottom: idx < changed.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                      <td style={{ padding: '9px 12px' }}>
                                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 11 }}>{sci.user_label.split(' ').slice(0,3).join(' ')}</div>
                                        <div style={{ fontSize: 9, color: '#94a3b8' }}>{sci.sku}</div>
                                      </td>
                                      <td style={{ padding: '9px 12px' }}>
                                        <span style={{
                                          fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                                          background: sci.alert_level === 'critical' ? '#fef2f2' : sci.alert_level === 'warning' ? '#fffbeb' : '#f0fdf4',
                                          color: sci.alert_level === 'critical' ? '#dc2626' : sci.alert_level === 'warning' ? '#d97706' : '#16a34a',
                                          border: `1px solid ${sci.alert_level === 'critical' ? '#fecaca' : sci.alert_level === 'warning' ? '#fde68a' : '#bbf7d0'}`,
                                        }}>
                                          {sci.alert_level.toUpperCase()}
                                        </span>
                                      </td>
                                      <td style={{ padding: '9px 12px', color: '#dc2626', fontWeight: 600, fontSize: 11 }}>
                                        {bufferChange.toFixed(1)}d
                                      </td>
                                      <td style={{ padding: '9px 12px', color: sci.days_until_stockout < 7 ? '#dc2626' : '#475569', fontWeight: sci.days_until_stockout < 7 ? 700 : 400 }}>
                                        {sci.days_until_stockout}d
                                      </td>
                                      <td style={{ padding: '9px 12px', fontSize: 10, color: sci.alert_level === 'critical' ? '#dc2626' : '#64748b', fontWeight: sci.alert_level === 'critical' ? 700 : 400 }}>
                                        {action}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Emergency sourcing callout */}
                          {scenarioItems.some(i => i.alert_level === 'critical') && (
                            <div style={{
                              marginTop: 12, padding: '10px 14px',
                              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Emergency sourcing required
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {scenarioItems.filter(i => i.alert_level === 'critical').map(i => (
                                  <div key={i.id} style={{ fontSize: 11, color: '#7f1d1d', display: 'flex', justifyContent: 'space-between' }}>
                                    <span><strong>{i.user_label.split(' ').slice(0,3).join(' ')}</strong> — {i.sku}</span>
                                    <span style={{ fontWeight: 600 }}>stockout in {i.days_until_stockout}d</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>

                {/* Safe items table */}
                {safe.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      On track — {safe.length} items
                    </div>
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {['Product', 'Stock', 'Daily use', 'Days remaining', 'Buffer', 'Linked shipment'].map(h => (
                              <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {safe.map((item, i) => (
                            <tr key={item.id} style={{ borderBottom: i < safe.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 12 }}>{item.user_label}</div>
                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.sku}</div>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569' }}>{item.current_stock_units.toLocaleString()}</td>
                              <td style={{ padding: '10px 14px', color: '#475569' }}>{item.daily_consumption}/day</td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>{item.days_until_stockout}d</span>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>+{item.buffer_days}d</span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                {item.shipment ? `${item.shipment.origin} to ${item.shipment.destination}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Analytical charts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Stock coverage chart */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Stock coverage vs shipment arrival (days)
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>
                    Blue bar = days of stock remaining. Dashed line = estimated shipment arrival.
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={coverageData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip
                        formatter={(val: unknown, name: unknown) => [
                          `${val as number} days`,
                          name === 'stock' ? 'Stock coverage' : 'Shipment arrival'
                        ]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="stock" radius={[0, 4, 4, 0]} barSize={10}>
                        {coverageData.map((entry, i) => (
                          <Cell key={i} fill={ALERT_COLORS[entry.level]} opacity={0.8} />
                        ))}
                      </Bar>
                      <Bar dataKey="arrival" radius={[0, 4, 4, 0]} barSize={4} fill="#1d4ed8" opacity={0.5} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    {[
                      { color: '#dc2626', label: 'Critical' },
                      { color: '#d97706', label: 'Warning' },
                      { color: '#16a34a', label: 'Safe' },
                      { color: '#1d4ed8', label: 'Arrival estimate' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, opacity: 0.8 }} />
                        <span style={{ fontSize: 9, color: '#64748b' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial exposure chart */}
                {exposureData.length > 0 && (
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      Financial exposure by item ($k)
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>
                      Projected production loss for critical items only
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={exposureData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#475569' }} tickLine={false} axisLine={false} width={80} />
                        <Tooltip
                          formatter={(val: unknown) => [`$${val as number}k`, 'Exposure']}
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="exposure" fill="#dc2626" radius={[0, 4, 4, 0]} barSize={12} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Scenario projection chart */}
                {scenario > 0 && (
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      Scenario impact — +{scenario} day delay
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 14 }}>
                      Items that would transition to critical status
                    </div>
                    <ResponsiveContainer width="100%" height={130}>
                      <BarChart
                        data={[
                          { label: 'Critical', base: critical.length, scenario: scenarioItems.filter(i => i.alert_level === 'critical').length },
                          { label: 'Warning',  base: warning.length,  scenario: scenarioItems.filter(i => i.alert_level === 'warning').length },
                          { label: 'Safe',     base: safe.length,     scenario: scenarioItems.filter(i => i.alert_level === 'safe').length },
                        ]}
                        margin={{ left: -10, right: 10, top: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <Bar dataKey="base"     name="Current"  fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={16} opacity={0.5} />
                        <Bar dataKey="scenario" name="Projected" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={16} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      {[{ color: '#94a3b8', label: 'Current' }, { color: '#dc2626', label: 'After delay' }].map(l => (
                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                          <span style={{ fontSize: 9, color: '#64748b' }}>{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}