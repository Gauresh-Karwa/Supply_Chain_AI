'use client'
import { SimulationResult } from '@/types'
import { stripMarkdown } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'

interface Props {
  isOpen: boolean
  onClose: () => void
  result: SimulationResult | null
  geminiBrief: string
  isLoading: boolean
}

const STATUS_COLORS = {
  exposed: '#dc2626',
  reroutable: '#1d4ed8',
  unaffected: '#16a34a',
}

const CARGO_COLORS: Record<string, string> = {
  electronics: '#3b82f6',
  automotive: '#8b5cf6',
  pharmaceuticals: '#ef4444',
  textiles: '#f59e0b',
  chemicals: '#f97316',
  machinery: '#64748b',
  energy_equipment: '#eab308',
  general: '#94a3b8',
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

// Known section labels produced by the updated Gemini prompts
const SECTION_LABELS = new Set([
  'SITUATION', 'KEY RISKS', 'IMMEDIATE ACTIONS', 'FINANCIAL EXPOSURE',
  'ROUTE STATUS', 'OPERATIONAL CONTEXT', 'RECOMMENDED ACTIONS',
  'RISK SUMMARY', 'KEY RISK DRIVERS', 'IMMEDIATE ACTIONS REQUIRED',
  'FINANCIAL IMPLICATIONS', 'STRATEGIC CONSIDERATIONS',
])

// Parse the plain-text memo format into React elements
function FormattedBrief({ text }: { text: string }) {
  if (!text) return null
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }

    // ALL-CAPS section label (new format) or ** heading (old format)
    const isAllCapsLabel = SECTION_LABELS.has(line.toUpperCase()) || /^[A-Z][A-Z\s]+$/.test(line) && line.length < 50
    const isBoldHeading = line.startsWith('**') && line.endsWith('**') && !line.slice(2, -2).includes('**')

    if (isAllCapsLabel || isBoldHeading) {
      const heading = line.replace(/^\*\*/, '').replace(/\*\*$/, '')
      elements.push(
        <div key={i} style={{
          fontSize: 10, fontWeight: 700, color: '#475569',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          marginTop: elements.length > 0 ? 16 : 0, marginBottom: 6,
          paddingBottom: 4, borderBottom: '1px solid #f1f5f9',
        }}>
          {heading}
        </div>
      )
      i++; continue
    }

    // Numbered list: 1. 2. 3.
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s*/, ''))
        i++
      }
      elements.push(
        <ol key={i} style={{ paddingLeft: 0, margin: '6px 0', listStyle: 'none' }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
              <span style={{ minWidth: 20, height: 20, borderRadius: '50%', background: '#1d4ed8', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {j + 1}
              </span>
              <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Bullet list: - or *
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().slice(2))
        i++
      }
      elements.push(
        <ul key={i} style={{ paddingLeft: 0, margin: '6px 0', listStyle: 'none' }}>
          {listItems.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
              <span style={{ color: '#1d4ed8', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>›</span>
              <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.7, marginBottom: 8 }}
        dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
      />
    )
    i++
  }

  return <div>{elements}</div>
}

export default function AnalysisModal({ isOpen, onClose, result, geminiBrief, isLoading }: Props) {
  if (!isOpen || !result) return null

  // ── Data preparation ─────────────────────────────────────────────────────
  const allAffected = [...result.affected_vessels, ...result.exposed_vessels]
  const totalCost = allAffected.reduce((s, v) => s + v.cost_impact_usd, 0)
  const totalCarbon = allAffected.reduce((s, v) => s + v.co2_delta_tonnes, 0)
  const avgDelay = allAffected.length
    ? allAffected.reduce((s, v) => s + v.delay_added_days, 0) / allAffected.length
    : 0

  // Fleet exposure donut data
  const exposureData = [
    { name: 'Exposed — no safe route', value: result.exposed_count, color: '#dc2626' },
    { name: 'Reroutable', value: result.reroutable_count, color: '#1d4ed8' },
    { name: 'Unaffected', value: result.unaffected_count, color: '#16a34a' },
  ].filter(d => d.value > 0)

  // Cost by route — meaningful labels
  const routeCostData = allAffected
    .filter(v => v.cost_impact_usd > 0)
    .sort((a, b) => b.cost_impact_usd - a.cost_impact_usd)
    .slice(0, 6)
    .map(v => ({
      name: `${v.origin.slice(0, 3)}→${v.destination.slice(0, 3)}`,
      cost: Math.round(v.cost_impact_usd / 1000),
      cargo: v.cargo_type ?? 'general',
      full: `${v.origin} → ${v.destination}`,
      delay: v.delay_added_days,
    }))

  // Delay distribution — bar chart
  const delayBuckets = [
    { range: '0–5d', count: allAffected.filter(v => v.delay_added_days <= 5).length },
    { range: '5–10d', count: allAffected.filter(v => v.delay_added_days > 5 && v.delay_added_days <= 10).length },
    { range: '10–15d', count: allAffected.filter(v => v.delay_added_days > 10 && v.delay_added_days <= 15).length },
    { range: '15d+', count: allAffected.filter(v => v.delay_added_days > 15).length },
  ].filter(b => b.count > 0)

  // CO2 by route — rerouted routes emit more
  const co2Data = allAffected
    .filter(v => v.co2_delta_tonnes > 0)
    .sort((a, b) => b.co2_delta_tonnes - a.co2_delta_tonnes)
    .slice(0, 5)
    .map(v => ({
      name: `${v.origin.slice(0, 3)}→${v.destination.slice(0, 3)}`,
      co2: Math.round(v.co2_delta_tonnes),
      full: `${v.origin} → ${v.destination}`,
    }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.7)', padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 1100,
        maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', border: '1px solid #e2e8f0',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Strategic exposure analysis
            </h2>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              {result.scenario_name} · {new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#f8fafc' }}>

          {/* Metric strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total vessels affected', value: result.affected_count + result.exposed_count, color: '#dc2626', sub: `${result.exposed_count} with no safe route` },
              { label: 'Projected cost impact', value: fmt(totalCost), color: '#dc2626', sub: 'demurrage + penalties' },
              { label: 'Daily fleet loss rate', value: fmt(result.daily_loss_rate_usd), color: '#d97706', sub: 'while crisis persists' },
              { label: 'Average vessel delay', value: `${avgDelay.toFixed(1)} days`, color: '#d97706', sub: 'across rerouted fleet' },
              { label: 'Additional CO₂', value: `${(totalCarbon / 1000).toFixed(1)}k t`, color: '#475569', sub: 'from longer routes' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16 }}>

            {/* LEFT — Gemini brief */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: '#4f46e5', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Executive intelligence brief
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                    Powered by Gemini 2.5 Flash
                  </span>
                </div>
                <div style={{ padding: 20, minHeight: 200 }}>
                  {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
                      <div style={{ width: 36, height: 36, border: '3px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <div style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600 }}>Generating strategic advisory...</div>
                    </div>
                  ) : geminiBrief ? (
                    <FormattedBrief text={geminiBrief} />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 12 }}>
                      No advisory generated for this scenario.
                    </div>
                  )}
                </div>
              </div>

              {/* Automated actions */}
              {!isLoading && geminiBrief && (
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Recommended immediate actions
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { action: `Trigger auto-reroute for ${result.reroutable_count} reroutable vessels via safest available corridors`, urgent: true },
                      { action: `Notify supply chain partners for ${result.exposed_count} exposed shipments — no safe route currently available`, urgent: result.exposed_count > 0 },
                      { action: `Review inventory buffer for high-value cargo (electronics, pharmaceuticals) linked to affected routes`, urgent: false },
                      { action: `Monitor ${result.scenario_name} situation — reassess every 6 hours until resolved`, urgent: false },
                    ].map(({ action, urgent }, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8,
                        background: urgent ? '#fef2f2' : '#f8fafc',
                        border: `1px solid ${urgent ? '#fecaca' : '#e2e8f0'}`,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: urgent ? '#dc2626' : '#1d4ed8', flexShrink: 0, marginTop: 1 }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — Analytical charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Fleet exposure donut */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  Fleet exposure breakdown
                </div>
                <div style={{ position: 'relative', height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={exposureData}
                        cx="50%" cy="50%"
                        innerRadius={52} outerRadius={74}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {exposureData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number, name: string) => [`${val} vessels`, name]}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{result.affected_count + result.exposed_count}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>vessels hit</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                  {exposureData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#475569' }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cargo exposure by type */}
              {(() => {
                const cargoExposure: Record<string, { cost: number; count: number }> = {}
                allAffected.forEach(v => {
                  const ct = v.cargo_type ?? 'general'
                  if (!cargoExposure[ct]) cargoExposure[ct] = { cost: 0, count: 0 }
                  cargoExposure[ct].cost += v.cost_impact_usd
                  cargoExposure[ct].count += 1
                })
                const cargoData = Object.entries(cargoExposure)
                  .map(([name, { cost, count }]) => ({ name: name.replace('_', ' '), cost: Math.round(cost / 1000), count }))
                  .sort((a, b) => b.cost - a.cost)
                if (cargoData.length === 0) return null
                return (
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Exposure by cargo type ($k)</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12 }}>Cumulative cost impact per cargo category</div>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={cargoData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} tickLine={false} axisLine={false} width={72} />
                        <Tooltip
                          formatter={(val: number, _: string, item: any) => [`$${val}k · ${item.payload.count} vessel${item.payload.count !== 1 ? 's' : ''}`, 'Exposure']}
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={12}>
                          {cargoData.map((entry, i) => (
                            <Cell key={i} fill={CARGO_COLORS[entry.name.replace(' ', '_')] ?? '#94a3b8'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* Projected cost accumulation */}
              {(() => {
                const daily = result.daily_loss_rate_usd
                if (!daily) return null
                const projData = [
                  { day: 'Day 1', cost: Math.round(daily / 1000) },
                  { day: 'Day 3', cost: Math.round(daily * 3 / 1000) },
                  { day: 'Day 7', cost: Math.round(daily * 7 / 1000) },
                  { day: 'Day 14', cost: Math.round(daily * 14 / 1000) },
                  { day: 'Day 21', cost: Math.round(daily * 21 / 1000) },
                ]
                return (
                  <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cost accumulation if crisis persists ($k)</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12 }}>Projected daily loss compounded over time</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={projData} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <Tooltip
                          formatter={(val: number) => [`$${val}k`, 'Cumulative loss']}
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="cost" fill="#dc2626" radius={[4, 4, 0, 0]} barSize={22} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: 'white', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              MarineIQ Risk Simulation · Live scenario active
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: 12, fontWeight: 700, background: '#0f172a', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
