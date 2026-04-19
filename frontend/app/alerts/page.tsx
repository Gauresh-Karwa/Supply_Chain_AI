'use client'
import { useState, useCallback, useEffect } from 'react'
import { SimulationResult, AffectedVessel, Shipment, CascadePort } from '@/types'
import { simulateScenario, applyConstraintOverrides, fetchShipments, predictRoute } from '@/lib/api'
import ShipmentDrawer from '@/components/fleet/ShipmentDrawer'
import WorldMap from '@/components/overview/WorldMap'
import AnalysisModal from '@/components/alerts/AnalysisModal'

const ALL_REGIONS = [
  { id: 'suez_canal', name: 'Suez Canal' },
  { id: 'bab_el_mandeb', name: 'Bab-el-Mandeb' },
  { id: 'hormuz_strait', name: 'Strait of Hormuz' },
  { id: 'malacca_strait', name: 'Strait of Malacca' },
  { id: 'taiwan_strait', name: 'Taiwan Strait' },
  { id: 'south_china_sea', name: 'South China Sea' },
  { id: 'east_china_sea', name: 'East China Sea' },
  { id: 'panama_canal', name: 'Panama Canal' },
  { id: 'english_channel', name: 'English Channel' },
  { id: 'bosphorus_strait', name: 'Bosphorus Strait' },
  { id: 'cape_of_good_hope', name: 'Cape of Good Hope' },
  { id: 'arabian_sea', name: 'Arabian Sea' },
  { id: 'bay_of_bengal', name: 'Bay of Bengal' },
  { id: 'north_sea', name: 'North Sea' },
  { id: 'north_atlantic', name: 'North Atlantic' },
  { id: 'new_york_port', name: 'New York Port' },
]

interface ScenarioDef {
  id: string
  name: string
  short: string
  category: 'geopolitical' | 'environmental'
  blocked: string[]
  restricted: string[]
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'red_sea_closure',
    name: 'Red Sea closure',
    short: 'Blocks Bab-el-Mandeb + Suez simultaneously',
    category: 'geopolitical',
    blocked: ['bab_el_mandeb', 'suez_canal'],
    restricted: [],
  },
  {
    id: 'hormuz_blockade',
    name: 'Strait of Hormuz blockade',
    short: 'Blocks Hormuz — cuts 20% of global oil flow',
    category: 'geopolitical',
    blocked: ['hormuz_strait'],
    restricted: ['arabian_sea'],
  },
  {
    id: 'taiwan_strait_closure',
    name: 'Taiwan Strait military closure',
    short: 'Blocks Taiwan Strait + South China Sea',
    category: 'geopolitical',
    blocked: ['taiwan_strait', 'south_china_sea'],
    restricted: ['east_china_sea'],
  },
  {
    id: 'suez_mechanical',
    name: 'Suez Canal mechanical blockage',
    short: 'Blocks Suez only — like Ever Given 2021',
    category: 'geopolitical',
    blocked: ['suez_canal'],
    restricted: [],
  },
  {
    id: 'panama_drought',
    name: 'Panama Canal drought restriction',
    short: 'Restricts Panama — 60% capacity loss',
    category: 'geopolitical',
    blocked: [],
    restricted: ['panama_canal'],
  },
  {
    id: 'us_east_strike',
    name: 'US East Coast port strike',
    short: 'Restricts New York + US East ports',
    category: 'geopolitical',
    blocked: [],
    restricted: ['new_york_port'],
  },
  {
    id: 'south_china_escalation',
    name: 'South China Sea escalation',
    short: 'Blocks South China Sea shipping lanes',
    category: 'geopolitical',
    blocked: ['south_china_sea'],
    restricted: ['east_china_sea'],
  },
  {
    id: 'typhoon_pacific',
    name: 'Category 5 Typhoon — Western Pacific',
    short: 'Blocks Taiwan Strait + South + East China Sea',
    category: 'environmental',
    blocked: ['taiwan_strait', 'south_china_sea', 'east_china_sea'],
    restricted: [],
  },
  {
    id: 'indian_ocean_cyclone',
    name: 'Indian Ocean cyclone season',
    short: 'Restricts Arabian Sea + Bay of Bengal',
    category: 'environmental',
    blocked: [],
    restricted: ['arabian_sea', 'bay_of_bengal'],
  },
  {
    id: 'north_atlantic_storms',
    name: 'North Atlantic winter storms',
    short: 'Restricts North Sea + North Atlantic',
    category: 'environmental',
    blocked: [],
    restricted: ['north_sea', 'north_atlantic'],
  },
  {
    id: 'suez_sandstorm',
    name: 'Suez sandstorm closure',
    short: 'Blocks Suez 48–72 hours',
    category: 'environmental',
    blocked: ['suez_canal'],
    restricted: [],
  },
]

function fmt(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function PulseDot({ color }: { color: 'red' | 'green' | 'amber' }) {
  const c = { red: '#ef4444', green: '#22c55e', amber: '#f59e0b' }[color]
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, marginRight: 8 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: c, opacity: 0.3, animation: 'ping 1.5s ease-in-out infinite',
      }} />
      <span style={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', background: c }} />
    </span>
  )
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string
  color: 'red' | 'amber' | 'blue' | 'slate'
}) {
  const styles = {
    red: { border: '#fecaca', bg: '#fef2f2', text: '#dc2626' },
    amber: { border: '#fde68a', bg: '#fffbeb', text: '#d97706' },
    blue: { border: '#bfdbfe', bg: '#eff6ff', text: '#1d4ed8' },
    slate: { border: '#e2e8f0', bg: '#f8fafc', text: '#475569' },
  }[color]
  return (
    <div style={{ border: `1px solid ${styles.border}`, background: styles.bg, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: styles.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function WarRoomPage() {
  const [activeScenarioIds, setActiveScenarioIds] = useState<Set<string>>(new Set())
  const [customOpen, setCustomOpen] = useState(false)
  const [customRegions, setCustomRegions] = useState<Record<string, 'open' | 'restricted' | 'blocked'>>({})
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [geminiLoading, setGeminiLoading] = useState(false)
  const [briefGenerated, setBriefGenerated] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [briefCopied, setBriefCopied] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [drawerShipment, setDrawerShipment] = useState<Shipment | null>(null)
  const [applyingLive, setApplyingLive] = useState(false)
  const [liveApplied, setLiveApplied] = useState(false)
  const [reroutingIds, setReroutingIds] = useState<Set<string>>(new Set())
  const [reroutedIds,  setReroutedIds]  = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function autoReroute(v: AffectedVessel) {
    setReroutingIds(prev => new Set([...prev, v.shipment_id]))
    try {
      const date   = new Date().toISOString().split('T')[0]
      const result = await predictRoute(v.origin, v.destination, date)

      if (result.recommendation?.route_id) {
        // Persist to Supabase — this closes the demo loop
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/shipments/${v.shipment_id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route_id:             result.recommendation.route_id,
            status:               'on_time',
            risk_score:           result.prediction.risk_score,
            predicted_delay_days: result.prediction.delay_days,
          }),
        })
        setReroutedIds(prev => new Set([...prev, v.shipment_id]))
      }
    } catch {
      setError(`Failed to reroute ${v.origin} → ${v.destination}`)
    } finally {
      setReroutingIds(prev => {
        const n = new Set(prev); n.delete(v.shipment_id); return n
      })
    }
  }

  useEffect(() => {
    fetchShipments()
      .then(res => setShipments(res.shipments || []))
      .catch(() => setError('Failed to load fleet data'))
  }, [])

  const mergedScenario = useCallback(() => {
    const blocked: string[] = []
    const restricted: string[] = []
    for (const sid of activeScenarioIds) {
      const s = SCENARIOS.find(sc => sc.id === sid)
      if (s) { blocked.push(...s.blocked); restricted.push(...s.restricted) }
    }
    for (const [id, st] of Object.entries(customRegions)) {
      if (st === 'blocked') blocked.push(id)
      else if (st === 'restricted') restricted.push(id)
    }
    const name = activeScenarioIds.size === 0
      ? customOpen ? 'Custom scenario' : ''
      : activeScenarioIds.size === 1
        ? SCENARIOS.find(s => s.id === [...activeScenarioIds][0])?.name ?? 'Scenario'
        : `Compound crisis (${activeScenarioIds.size} events)`
    return { blocked: [...new Set(blocked)], restricted: [...new Set(restricted)], name }
  }, [activeScenarioIds, customRegions, customOpen])

  const runSimulation = useCallback(async (blocked: string[], restricted: string[], name: string) => {
    if (!blocked.length && !restricted.length) { setSimulationResult(null); return }
    setIsSimulating(true); setError(''); setBriefGenerated(false); setBriefText('')
    try {
      const result = await simulateScenario(blocked, restricted, name)
      setSimulationResult(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setIsSimulating(false)
    }
  }, [])

  useEffect(() => {
    const { blocked, restricted, name } = mergedScenario()
    runSimulation(blocked, restricted, name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenarioIds, customRegions])

  const toggleScenario = useCallback((id: string) => {
    setActiveScenarioIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const generateBrief = useCallback(async () => {
    if (!simulationResult) return
    setIsModalOpen(true); setGeminiLoading(true)
    const brief = simulationResult.gemini_brief
    setBriefText(''); setBriefGenerated(true); setBriefText('')
    let i = 0
    const interval = setInterval(() => {
      setBriefText(brief.slice(0, i)); i += 6
      if (i > brief.length) { setBriefText(brief); clearInterval(interval); setGeminiLoading(false) }
    }, 16)
  }, [simulationResult])

  const copyBrief = useCallback(async () => {
    if (!briefText) return
    await navigator.clipboard.writeText(briefText)
    setBriefCopied(true); setTimeout(() => setBriefCopied(false), 2000)
  }, [briefText])

  const applyToLive = useCallback(async () => {
    setApplyingLive(true)
    try {
      await applyConstraintOverrides(customRegions)
      setLiveApplied(true); setTimeout(() => setLiveApplied(false), 3000)
    } catch { setError('Failed to apply to live system') }
    finally { setApplyingLive(false) }
  }, [customRegions])

  const triggerManualSim = useCallback(() => {
    const { blocked, restricted, name } = mergedScenario()
    runSimulation(blocked, restricted, name)
  }, [mergedScenario, runSimulation])

  const clearAll = () => {
    setActiveScenarioIds(new Set()); setCustomRegions({}); setCustomOpen(false)
    setSimulationResult(null); setBriefGenerated(false); setBriefText(''); setError('')
  }

  const isActive = activeScenarioIds.size > 0 || Object.values(customRegions).some(v => v !== 'open')
  const allAffected = simulationResult
    ? [...simulationResult.affected_vessels, ...simulationResult.exposed_vessels]
    : []
  const { name: scenarioName } = mergedScenario()

  function vesselToShipment(v: AffectedVessel): Shipment {
    return {
      id: v.shipment_id, origin: v.origin, destination: v.destination,
      departure_time: new Date().toISOString(), transport_mode: 'sea',
      risk_score: v.risk_score, predicted_delay_days: v.delay_added_days,
      anomaly_flag: v.status === 'exposed',
      status: v.status === 'exposed' ? 'at_risk' : 'watch',
      updated_at: new Date().toISOString(),
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px', borderBottom: '1px solid #e2e8f0',
        background: 'white', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isActive ? <PulseDot color="red" /> : <PulseDot color="green" />}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Risk Simulation</h1>
              {isActive && scenarioName && (
                <span style={{
                  fontSize: 10, fontWeight: 600, background: '#fef2f2',
                  color: '#dc2626', border: '1px solid #fecaca',
                  padding: '2px 10px', borderRadius: 99,
                }}>
                  {scenarioName}
                </span>
              )}
              {!isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 500, background: '#f0fdf4',
                  color: '#16a34a', border: '1px solid #bbf7d0',
                  padding: '2px 10px', borderRadius: 99,
                }}>
                  Normal monitoring
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
              Global risk simulation and strategic response centre
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {simulationResult && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              {[
                { label: 'affected', val: simulationResult.affected_count + simulationResult.exposed_count, color: '#dc2626' },
                { label: 'reroutable', val: simulationResult.reroutable_count, color: '#1d4ed8' },
                { label: 'exposed', val: simulationResult.exposed_count, color: '#dc2626' },
                { label: 'safe', val: simulationResult.unaffected_count, color: '#16a34a' },
              ].map(({ label, val, color }) => (
                <span key={label} style={{ color: '#94a3b8' }}>
                  <strong style={{ color }}>{val}</strong> {label}
                </span>
              ))}
            </div>
          )}
          {isActive && (
            <button
              onClick={clearAll}
              style={{
                fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0',
                background: 'white', padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ── Three-panel body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT panel — scenario triggers */}
        <aside style={{
          width: 272, flexShrink: 0, borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Scenario triggers
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
              Click to activate · multiple = compound crisis
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>

            {/* Geopolitical */}
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '8px 8px 4px' }}>
              Geopolitical
            </div>
            {SCENARIOS.filter(s => s.category === 'geopolitical').map(sc => {
              const active = activeScenarioIds.has(sc.id)
              return (
                <button
                  key={sc.id}
                  onClick={() => toggleScenario(sc.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    padding: '9px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                    border: active ? '1px solid #fecaca' : '1px solid transparent',
                    background: active ? '#fef2f2' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: active ? '#dc2626' : '#1e293b', lineHeight: 1.3 }}>
                        {sc.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
                        {sc.short}
                      </div>
                      {active && sc.blocked.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {sc.blocked.map(r => (
                            <span key={r} style={{
                              fontSize: 9, fontWeight: 700, background: '#fef2f2',
                              color: '#dc2626', border: '1px solid #fecaca',
                              padding: '1px 6px', borderRadius: 99,
                            }}>BLOCKED</span>
                          ))}
                          {sc.restricted.map(r => (
                            <span key={r} style={{
                              fontSize: 9, fontWeight: 700, background: '#fffbeb',
                              color: '#d97706', border: '1px solid #fde68a',
                              padding: '1px 6px', borderRadius: 99,
                            }}>WATCH</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                      background: active ? '#dc2626' : '#cbd5e1',
                      boxShadow: active ? '0 0 6px rgba(220,38,38,0.6)' : 'none',
                    }} />
                  </div>
                </button>
              )
            })}

            {/* Environmental */}
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '12px 8px 4px' }}>
              Environmental
            </div>
            {SCENARIOS.filter(s => s.category === 'environmental').map(sc => {
              const active = activeScenarioIds.has(sc.id)
              return (
                <button
                  key={sc.id}
                  onClick={() => toggleScenario(sc.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    padding: '9px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                    border: active ? '1px solid #fde68a' : '1px solid transparent',
                    background: active ? '#fffbeb' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: active ? '#d97706' : '#1e293b', lineHeight: 1.3 }}>
                        {sc.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
                        {sc.short}
                      </div>
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                      background: active ? '#f59e0b' : '#cbd5e1',
                      boxShadow: active ? '0 0 6px rgba(245,158,11,0.6)' : 'none',
                    }} />
                  </div>
                </button>
              )
            })}

            {/* Custom */}
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '12px 8px 4px' }}>
              Custom
            </div>
            <button
              onClick={() => setCustomOpen(o => !o)}
              style={{
                width: '100%', textAlign: 'left', display: 'block',
                padding: '9px 10px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                border: customOpen ? '1px solid #bfdbfe' : '1px solid transparent',
                background: customOpen ? '#eff6ff' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: customOpen ? '#1d4ed8' : '#1e293b' }}>
                    Build custom scenario
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    Configure any region manually
                  </div>
                </div>
                <span style={{ fontSize: 10, color: '#94a3b8', transform: customOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </button>

            {customOpen && (
              <div style={{ margin: '4px 4px 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                {ALL_REGIONS.map(reg => (
                  <div key={reg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#475569', flex: 1 }}>{reg.name}</span>
                    <select
                      value={customRegions[reg.id] ?? 'open'}
                      onChange={e => setCustomRegions(prev => ({ ...prev, [reg.id]: e.target.value as any }))}
                      style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', background: 'white', color: '#1e293b' }}
                    >
                      <option value="open">Open</option>
                      <option value="restricted">Watch</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={triggerManualSim}
                    disabled={isSimulating}
                    style={{ flex: 1, fontSize: 11, fontWeight: 700, background: '#1d4ed8', color: 'white', border: 'none', padding: '7px', borderRadius: 8, cursor: 'pointer', opacity: isSimulating ? 0.5 : 1 }}
                  >
                    {isSimulating ? 'Running...' : 'Simulate'}
                  </button>
                  <button
                    onClick={applyToLive}
                    disabled={applyingLive}
                    style={{ flex: 1, fontSize: 11, fontWeight: 700, background: liveApplied ? '#f0fdf4' : '#0f172a', color: liveApplied ? '#16a34a' : 'white', border: liveApplied ? '1px solid #bbf7d0' : 'none', padding: '7px', borderRadius: 8, cursor: 'pointer' }}
                  >
                    {liveApplied ? 'Applied ✓' : applyingLive ? 'Applying...' : 'Apply live'}
                  </button>
                </div>
              </div>
            )}

            {/* Summary strip */}
            <div style={{ margin: '8px 4px 4px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                <strong style={{ color: '#0f172a' }}>{activeScenarioIds.size + (customOpen ? 1 : 0)}</strong> events active
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                <strong style={{ color: '#0f172a' }}>
                  {[...new Set([
                    ...[...activeScenarioIds].flatMap(id => {
                      const s = SCENARIOS.find(sc => sc.id === id)
                      return s ? [...s.blocked, ...s.restricted] : []
                    }),
                    ...Object.entries(customRegions).filter(([, v]) => v !== 'open').map(([k]) => k)
                  ])].length}
                </strong> regions affected
              </span>
            </div>

          </div>

          {/* Run button */}
          {isActive && (
            <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: 'white' }}>
              <button
                onClick={triggerManualSim}
                disabled={isSimulating}
                style={{
                  width: '100%', padding: '10px', background: isSimulating ? '#fee2e2' : '#dc2626',
                  color: 'white', border: 'none', borderRadius: 10, fontSize: 12,
                  fontWeight: 700, cursor: isSimulating ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isSimulating ? (
                  <>
                    <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" opacity="0.8" />
                    </svg>
                    Simulating fleet...
                  </>
                ) : 'Run simulation'}
              </button>
            </div>
          )}
        </aside>

        {/* CENTRE panel — map */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Fleet exposure strip */}
          {simulationResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 24,
              padding: '8px 20px', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0,
            }}>
              {[
                { dot: '#dc2626', label: 'vessels affected', val: simulationResult.affected_count + simulationResult.exposed_count },
                { dot: '#1d4ed8', label: 'reroutable', val: simulationResult.reroutable_count },
                { dot: '#dc2626', label: 'exposed', val: simulationResult.exposed_count },
                { dot: '#16a34a', label: 'safe', val: simulationResult.unaffected_count },
              ].map(({ dot, label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    <strong style={{ color: '#0f172a' }}>{val}</strong> {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Cascade effect strip */}
          {simulationResult?.cascade_effects && simulationResult.cascade_effects.length > 0 && (
            <div style={{
              display: 'flex', gap: 8, padding: '7px 16px',
              background: '#fffbeb', borderBottom: '1px solid #fde68a', flexShrink: 0,
              overflowX: 'auto',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                CASCADE EFFECT:
              </span>
              {simulationResult.cascade_effects.map((c, i) => (
                <div key={i} style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 99,
                  background: c.alert_level === 'high' ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${c.alert_level === 'high' ? '#fecaca' : '#fde68a'}`,
                  color: c.alert_level === 'high' ? '#dc2626' : '#d97706',
                  fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {c.port} +{c.congestion_increase_pct}%
                </div>
              ))}
            </div>
          )}

          {/* Map */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f1f5f9' }}>
            <WorldMap
              shipments={shipments}
              simulationResult={simulationResult}
              activeScenario={mergedScenario()}
              cascadeEffects={simulationResult?.cascade_effects ?? []}
            />

            {/* Loading overlay */}
            {isSimulating && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(248,250,252,0.85)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10,
              }}>
                <div style={{ width: 56, height: 56, position: 'relative', marginBottom: 16 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #fee2e2', animation: 'ping 1.5s ease-in-out infinite' }} />
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #fecaca' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: 24, height: 24, color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Simulating fleet exposure...</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Running constraint × decision engine for all shipments</div>
              </div>
            )}


            {/* Idle state */}
            {!isSimulating && !simulationResult && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
                  Select a scenario to begin simulation
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  Fleet exposure will be calculated in real time
                </div>
              </div>
            )}
          </div>
        </main>


        {/* RIGHT panel — strategic fallout */}
        <aside style={{
          width: 320, flexShrink: 0, borderLeft: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'white',
        }}>

          {/* Financial metrics */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Financial impact
            </div>
            {simulationResult ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MetricCard label="Cargo at risk" value={fmt(simulationResult.total_value_at_risk_usd)} sub="across fleet" color="red" />
                <MetricCard label="Daily loss" value={fmt(simulationResult.daily_loss_rate_usd)} sub="demurrage + holding" color="amber" />
                <MetricCard label="Avg delay" value={`${simulationResult.avg_delay_days}d`} sub="per vessel" color="blue" />
                <MetricCard label="Exposed" value={`${simulationResult.exposed_count}`} sub="no safe route" color={simulationResult.exposed_count > 0 ? 'red' : 'slate'} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['Cargo at risk', 'Daily loss', 'Avg delay', 'Exposed'].map(l => (
                  <div key={l} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>{l}</div>
                    <div style={{ height: 16, width: 60, background: '#e2e8f0', borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Affected vessels */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{
              padding: '10px 16px 8px', position: 'sticky', top: 0,
              background: 'white', borderBottom: '1px solid #f1f5f9', zIndex: 5,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Affected vessels
                {allAffected.length > 0 && (
                  <span style={{ marginLeft: 8, fontWeight: 400, color: '#94a3b8', textTransform: 'none' }}>
                    {allAffected.length} total
                  </span>
                )}
              </div>
            </div>

            {allAffected.filter(v => v.status !== 'exposed').length > 0 && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => allAffected.filter(v => v.status !== 'exposed').forEach(v => autoReroute(v))}
                  style={{
                    width: '100%', fontSize: 11, fontWeight: 700,
                    background: '#1d4ed8', color: 'white',
                    border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer',
                  }}
                >
                  Auto-reroute all {allAffected.filter(v => v.status !== 'exposed').length} reroutable vessels
                </button>
              </div>
            )}

            {!simulationResult && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                No simulation active
              </div>
            )}
            {simulationResult && allAffected.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, color: '#16a34a', marginBottom: 6 }}>✓</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>No vessels affected by this scenario</div>
              </div>
            )}

            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allAffected.map((v, i) => (
                <div
                  key={v.shipment_id + i}
                  style={{
                    borderRadius: 10, padding: '10px 12px',
                    border: v.status === 'exposed' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                    background: v.status === 'exposed' ? '#fef2f2' : '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      background: v.status === 'exposed' ? '#fef2f2' : '#eff6ff',
                      color: v.status === 'exposed' ? '#dc2626' : '#1d4ed8',
                      border: v.status === 'exposed' ? '1px solid #fecaca' : '1px solid #bfdbfe',
                    }}>
                      {v.status === 'exposed' ? 'EXPOSED' : 'REROUTABLE'}
                    </span>
                    <button
                      onClick={() => setDrawerShipment(vesselToShipment(v))}
                      style={{ fontSize: 10, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      View detail →
                    </button>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>
                    {v.origin} → {v.destination}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                    {v.current_route}
                    {v.recommended_route && v.recommended_route !== v.current_route && (
                      <> → <span style={{ color: '#1d4ed8' }}>{v.recommended_route}</span></>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {reroutedIds.has(v.shipment_id) ? (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px', textAlign: 'center' }}>
                        ✓ Auto-rerouted via {v.recommended_route}
                      </div>
                    ) : (
                      <button
                        onClick={() => autoReroute(v)}
                        disabled={v.status === 'exposed' || reroutingIds.has(v.shipment_id)}
                        style={{
                          width: '100%', fontSize: 10, fontWeight: 700,
                          background: v.status === 'exposed' ? '#f8fafc' : '#1d4ed8',
                          color: v.status === 'exposed' ? '#94a3b8' : 'white',
                          border: v.status === 'exposed' ? '1px solid #e2e8f0' : 'none',
                          borderRadius: 6, padding: '5px', cursor: v.status === 'exposed' ? 'not-allowed' : 'pointer',
                          opacity: reroutingIds.has(v.shipment_id) ? 0.6 : 1,
                        }}
                      >
                        {reroutingIds.has(v.shipment_id) ? 'Rerouting...' : v.status === 'exposed' ? 'No safe route available' : ' Auto-reroute now'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                    {v.delay_added_days > 0 && (
                      <span style={{ color: '#d97706', fontWeight: 700 }}>
                        +{v.delay_added_days.toFixed(1)} days
                      </span>
                    )}
                    <span style={{ fontWeight: 600, color: '#dc2626' }}>
                      {v.cost_impact_usd >= 1_000_000
                        ? `$${(v.cost_impact_usd / 1_000_000).toFixed(1)}M`
                        : `$${(v.cost_impact_usd / 1_000).toFixed(0)}k`} exposure
                    </span>
                    {v.co2_delta_tonnes !== 0 && (
                      <span style={{ color: v.co2_delta_tonnes > 0 ? '#ea580c' : '#16a34a' }}>
                        {v.co2_delta_tonnes > 0 ? '+' : ''}{v.co2_delta_tonnes.toFixed(0)}t CO₂
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate advisory button */}
          <div style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
            <button
              onClick={() => { setIsModalOpen(true); if (!briefGenerated) generateBrief() }}
              disabled={!simulationResult || isSimulating}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: simulationResult && !isSimulating ? 'pointer' : 'not-allowed',
                background: simulationResult && !isSimulating ? '#7c3aed' : '#e2e8f0',
                color: simulationResult && !isSimulating ? 'white' : '#94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {briefGenerated ? 'View strategic advisory' : 'Generate strategic advisory'}
            </button>
          </div>
        </aside>
      </div>


      {/* Shipment drawer */}
      {drawerShipment && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} onClick={() => setDrawerShipment(null)} />
          <div style={{ width: 384, background: 'white', borderLeft: '1px solid #e2e8f0', overflowY: 'auto' }}>
            <ShipmentDrawer shipment={drawerShipment} onClose={() => setDrawerShipment(null)} />
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 50,
          background: '#fef2f2', border: '1px solid #fecaca',
          color: '#dc2626', fontSize: 12, padding: '10px 16px',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ marginRight: 4, fontWeight: 700 }}>!</span> {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      <AnalysisModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        result={simulationResult}
        geminiBrief={briefText}
        isLoading={geminiLoading}
      />

      <style>{`
        @keyframes ping {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}