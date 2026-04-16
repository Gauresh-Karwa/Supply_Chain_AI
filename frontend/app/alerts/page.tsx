'use client'
import { useState, useCallback, useEffect } from 'react'
import { SimulationResult, AffectedVessel, Shipment } from '@/types'
import { simulateScenario, applyConstraintOverrides, fetchShipments } from '@/lib/api'
import ShipmentDrawer from '@/components/fleet/ShipmentDrawer'
import WorldMap from '@/components/overview/WorldMap'
import AnalysisModal from '@/components/alerts/AnalysisModal'

// -- Region catalogue -----------------------------------------------------------
const ALL_REGIONS = [
  { id: 'suez_canal',        name: 'Suez Canal' },
  { id: 'bab_el_mandeb',     name: 'Bab-el-Mandeb' },
  { id: 'hormuz_strait',     name: 'Strait of Hormuz' },
  { id: 'malacca_strait',    name: 'Strait of Malacca' },
  { id: 'taiwan_strait',     name: 'Taiwan Strait' },
  { id: 'south_china_sea',   name: 'South China Sea' },
  { id: 'east_china_sea',    name: 'East China Sea' },
  { id: 'panama_canal',      name: 'Panama Canal' },
  { id: 'english_channel',   name: 'English Channel' },
  { id: 'bosphorus_strait',  name: 'Bosphorus Strait' },
  { id: 'cape_of_good_hope', name: 'Cape of Good Hope' },
  { id: 'arabian_sea',       name: 'Arabian Sea' },
  { id: 'bay_of_bengal',     name: 'Bay of Bengal' },
  { id: 'north_sea',         name: 'North Sea' },
  { id: 'north_atlantic',    name: 'North Atlantic' },
  { id: 'new_york_port',     name: 'New York Port' },
]

// -- Pre-built Black Swan scenarios ---------------------------------------------
interface ScenarioDef {
  id:       string
  name:     string
  short:    string
  category: 'geopolitical' | 'environmental'
  blocked:  string[]
  restricted: string[]
  icon: string
}

const SCENARIOS: ScenarioDef[] = [
  {
    id: 'red_sea_closure',
    name: 'Red Sea closure',
    short: 'Blocks Bab-el-Mandeb + Suez simultaneously',
    category: 'geopolitical',
    blocked: ['bab_el_mandeb', 'suez_canal'],
    restricted: [],
    icon: 'BLOCK',
  },
  {
    id: 'hormuz_blockade',
    name: 'Strait of Hormuz blockade',
    short: 'Blocks Hormuz — cuts 20% of global oil flow',
    category: 'geopolitical',
    blocked: ['hormuz_strait'],
    restricted: ['arabian_sea'],
    icon: 'OIL',
  },
  {
    id: 'taiwan_strait_closure',
    name: 'Taiwan Strait military closure',
    short: 'Blocks Taiwan Strait + South China Sea',
    category: 'geopolitical',
    blocked: ['taiwan_strait', 'south_china_sea'],
    restricted: ['east_china_sea'],
    icon: 'WAR',
  },
  {
    id: 'suez_mechanical',
    name: 'Suez Canal mechanical blockage',
    short: 'Blocks Suez only — like Ever Given 2021',
    category: 'geopolitical',
    blocked: ['suez_canal'],
    restricted: [],
    icon: 'ANCHOR',
  },
  {
    id: 'panama_drought',
    name: 'Panama Canal drought restriction',
    short: 'Restricts Panama Canal — 60% capacity loss',
    category: 'geopolitical',
    blocked: [],
    restricted: ['panama_canal'],
    icon: 'ALERT',
  },
  {
    id: 'us_east_strike',
    name: 'US East Coast port strike',
    short: 'Restricts New York + other US East ports',
    category: 'geopolitical',
    blocked: [],
    restricted: ['new_york_port'],
    icon: 'ALERT',
  },
  {
    id: 'south_china_escalation',
    name: 'South China Sea territorial escalation',
    short: 'Blocks South China Sea shipping lanes',
    category: 'geopolitical',
    blocked: ['south_china_sea'],
    restricted: ['east_china_sea'],
    icon: 'SHIP',
  },
  {
    id: 'typhoon_pacific',
    name: 'Category 5 Typhoon — Western Pacific',
    short: 'Blocks Taiwan Strait + South China Sea + East China Sea',
    category: 'environmental',
    blocked: ['taiwan_strait', 'south_china_sea', 'east_china_sea'],
    restricted: [],
    icon: 'STORM',
  },
  {
    id: 'indian_ocean_cyclone',
    name: 'Indian Ocean cyclone season',
    short: 'Restricts Arabian Sea + Bay of Bengal',
    category: 'environmental',
    blocked: [],
    restricted: ['arabian_sea', 'bay_of_bengal'],
    icon: 'STORM',
  },
  {
    id: 'north_atlantic_storms',
    name: 'North Atlantic winter storms',
    short: 'Restricts North Sea + North Atlantic routes',
    category: 'environmental',
    blocked: [],
    restricted: ['north_sea', 'north_atlantic'],
    icon: '🌨️',
  },
  {
    id: 'suez_sandstorm',
    name: 'Suez sandstorm + visibility closure',
    short: 'Blocks Suez 48-72 hours',
    category: 'environmental',
    blocked: ['suez_canal'],
    restricted: [],
    icon: 'ALERT',
  },
]

// -- Helpers --------------------------------------------------------------------
function fmt(n: number, decimals = 1) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(decimals)}`
}

function fmtDelay(d: number) {
  return d === 0 ? '-' : `+${d.toFixed(1)} days`
}

// -- Sub-components -------------------------------------------------------------
function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color: 'red' | 'amber' | 'blue' | 'slate' }) {
  const colors = {
    red:   'border-red-200   bg-red-50   text-red-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-600',
    blue:  'border-blue-200  bg-blue-50  text-blue-600',
    slate: 'border-slate-300 bg-slate-50 text-slate-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${colors[color].split(' ')[2]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function PulseRing({ color }: { color: 'red' | 'amber' | 'green' }) {
  const c = { red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-green-500' }[color]
  const r = { red: 'bg-red-500/20', amber: 'bg-amber-500/20', green: 'bg-green-500/20' }[color]
  return (
    <span className="relative inline-flex h-2.5 w-2.5 mr-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${r} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${c}`} />
    </span>
  )
}

// == MAIN PAGE =================================================================
export default function RealSimulationPage() {
  /* -- state -- */
  const [activeScenarioIds, setActiveScenarioIds] = useState<Set<string>>(new Set())
  const [customOpen, setCustomOpen]           = useState(false)
  const [customRegions, setCustomRegions]     = useState<Record<string, 'open' | 'restricted' | 'blocked'>>({})
  const [isSimulating, setIsSimulating]       = useState(false)
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [geminiLoading, setGeminiLoading]     = useState(false)
  const [briefGenerated, setBriefGenerated]   = useState(false)
  const [briefTimestamp, setBriefTimestamp]   = useState<Date | null>(null)
  const [briefText, setBriefText]             = useState('')
  const [briefCopied, setBriefCopied]         = useState(false)
  const [isModalOpen, setIsModalOpen]         = useState(false)
  const [shipments, setShipments]           = useState<Shipment[]>([])
  const [drawerShipment, setDrawerShipment]   = useState<Shipment | null>(null)
  const [applyingLive, setApplyingLive]       = useState(false)
  const [liveApplied, setLiveApplied]         = useState(false)
  const [error, setError]                     = useState('')

  /* -- initial load -- */
  useEffect(() => {
    fetchShipments().then(res => setShipments(res.shipments || [])).catch(() => setError('Failed to load fleet data'))
  }, [])

  /* -- derived active scenario merge -- */
  const mergedScenario = useCallback(() => {
    const blocked: string[]    = []
    const restricted: string[] = []

    for (const sid of activeScenarioIds) {
      const s = SCENARIOS.find(sc => sc.id === sid)
      if (s) {
        blocked.push(...s.blocked)
        restricted.push(...s.restricted)
      }
    }

    // Custom overrides
    for (const [id, st] of Object.entries(customRegions)) {
      if (st === 'blocked')     blocked.push(id)
      else if (st === 'restricted') restricted.push(id)
    }

    const name = activeScenarioIds.size === 0
      ? customOpen ? 'Custom Scenario' : ''
      : activeScenarioIds.size === 1
        ? SCENARIOS.find(s => s.id === [...activeScenarioIds][0])?.name ?? 'Scenario'
        : `Compound crisis (${activeScenarioIds.size} events)`

    return {
      blocked:    [...new Set(blocked)],
      restricted: [...new Set(restricted)],
      name,
    }
  }, [activeScenarioIds, customRegions, customOpen])

  const affectedRegionCount = useCallback(() => {
    const m = mergedScenario()
    return new Set([...m.blocked, ...m.restricted]).size
  }, [mergedScenario])

  /* -- run simulation -- */
  const runSimulation = useCallback(async (
    blocked: string[], restricted: string[], name: string
  ) => {
    if (!blocked.length && !restricted.length) {
      setSimulationResult(null)
      return
    }
    setIsSimulating(true)
    setError('')
    setBriefGenerated(false)
    setBriefText('')
    try {
      const result = await simulateScenario(blocked, restricted, name)
      setSimulationResult(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setIsSimulating(false)
    }
  }, [])

  /* -- auto-run whenever active scenarios or custom regions change -- */
  useEffect(() => {
    const { blocked, restricted, name } = mergedScenario()
    runSimulation(blocked, restricted, name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenarioIds, customRegions])

  /* -- toggle a pre-built scenario -- */
  const toggleScenario = useCallback((id: string) => {
    setActiveScenarioIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* -- generate Gemini brief -- */
  const generateBrief = useCallback(async () => {
    if (!simulationResult) return
    setIsModalOpen(true)
    setGeminiLoading(true)
    // Brief was already generated server-side; show it with typewriter if present
    const brief = simulationResult.gemini_brief
    setBriefText('')
    setBriefGenerated(true)
    setBriefTimestamp(new Date())

    // Typewriter animation
    let i = 0
    const interval = setInterval(() => {
      setBriefText(brief.slice(0, i))
      i += 6
      if (i > brief.length) {
        setBriefText(brief)
        clearInterval(interval)
        setGeminiLoading(false)
      }
    }, 16)
  }, [simulationResult])

  /* -- copy brief -- */
  const copyBrief = useCallback(async () => {
    if (!briefText) return
    await navigator.clipboard.writeText(briefText)
    setBriefCopied(true)
    setTimeout(() => setBriefCopied(false), 2000)
  }, [briefText])

  /* -- apply custom to live system -- */
  const applyToLive = useCallback(async () => {
    setApplyingLive(true)
    try {
      await applyConstraintOverrides(customRegions)
      setLiveApplied(true)
      setTimeout(() => setLiveApplied(false), 3000)
    } catch {
      setError('Failed to apply to live system')
    } finally {
      setApplyingLive(false)
    }
  }, [customRegions])

  /* -- manual re-run (for custom scenario simulate button) -- */
  const triggerManualSim = useCallback(() => {
    const { blocked, restricted, name } = mergedScenario()
    runSimulation(blocked, restricted, name)
  }, [mergedScenario, runSimulation])

  /* -- clear all -- */
  const clearAll = () => {
    setActiveScenarioIds(new Set())
    setCustomRegions({})
    setCustomOpen(false)
    setSimulationResult(null)
    setBriefGenerated(false)
    setBriefText('')
    setError('')
  }

  const isActive = activeScenarioIds.size > 0 || Object.values(customRegions).some(v => v !== 'open')
  const allAffected = simulationResult
    ? [...simulationResult.affected_vessels, ...simulationResult.exposed_vessels]
    : []

  const { name: scenarioName } = mergedScenario()

  /* -- Fake shipment for drawer (maps vessel -> Shipment shape) -- */
  function vesselToShipment(v: AffectedVessel): Shipment {
    return {
      id:                   v.shipment_id,
      origin:               v.origin,
      destination:          v.destination,
      departure_time:       new Date().toISOString(),
      transport_mode:       'sea',
      risk_score:           v.risk_score,
      predicted_delay_days: v.delay_added_days,
      anomaly_flag:         v.status === 'exposed',
      status:               v.status === 'exposed' ? 'at_risk' : 'watch',
      updated_at:           new Date().toISOString(),
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden">

      {/* -- Top header bar -- */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          {isActive ? <PulseRing color="red" /> : <PulseRing color="green" />}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-base font-bold tracking-tight text-slate-800">Real-Time Simulation</h1>
              {isActive && scenarioName && (
                <span className="text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/50 px-2.5 py-0.5 rounded-full">
                  {scenarioName}
                </span>
              )}
              {!isActive && (
                <span className="text-xs font-medium bg-green-900/40 text-green-400 border border-green-700/40 px-2.5 py-0.5 rounded-full">
                  Normal monitoring
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Global risk simulation and strategic response centre</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {simulationResult && (
            <div className="flex gap-4 text-xs">
              <span className="text-slate-400">
                <span className="font-semibold text-red-600">{simulationResult.affected_count + simulationResult.exposed_count}</span> affected
              </span>
              <span className="text-slate-400">
                <span className="font-semibold text-amber-600">{simulationResult.reroutable_count}</span> reroutable
              </span>
              <span className="text-slate-400">
                <span className="font-semibold text-red-500">{simulationResult.exposed_count}</span> exposed
              </span>
              <span className="text-slate-400">
                <span className="font-semibold text-green-400">{simulationResult.unaffected_count}</span> safe
              </span>
            </div>
          )}
          {isActive && (
            <button
              onClick={clearAll}
              className="text-xs text-slate-400 hover:text-slate-200 border border-slate-300 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-all"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      {/* -- Three-panel body -- */}
      <div className="flex flex-1 overflow-hidden">

        {/* == LEFT -- Scenario triggers (280px) ================================== */}
        <aside className="w-[280px] flex-shrink-0 border-r border-slate-200 flex flex-col overflow-hidden bg-white">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">Scenario Triggers</div>
            <div className="text-xs text-slate-500 mt-1">Click to activate · Multiple = compound crisis</div>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">

            {/* Geopolitical group */}
            <div className="px-2 pt-2 pb-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">⚡ Geopolitical</div>
            </div>
            {SCENARIOS.filter(s => s.category === 'geopolitical').map(sc => {
              const active = activeScenarioIds.has(sc.id)
              return (
                <button
                  key={sc.id}
                  onClick={() => toggleScenario(sc.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-all border ${
                    active
                      ? 'bg-red-950/60 border-red-700/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-sm mt-0.5 flex-shrink-0">{sc.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold leading-tight ${active ? 'text-red-300' : 'text-slate-700'}`}>
                        {sc.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{sc.short}</div>
                      {active && sc.blocked.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {sc.blocked.map(r => (
                            <span key={r} className="text-[9px] bg-red-900/60 text-red-600 border border-red-800/50 px-1.5 py-0.5 rounded-full">
                              BLOCKED
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`ml-auto mt-0.5 w-3 h-3 rounded-full flex-shrink-0 transition-all ${
                      active ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]' : 'bg-slate-700'
                    }`} />
                  </div>
                </button>
              )
            })}

            {/* Environmental group */}
            <div className="px-2 pt-3 pb-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🌍 Environmental</div>
            </div>
            {SCENARIOS.filter(s => s.category === 'environmental').map(sc => {
              const active = activeScenarioIds.has(sc.id)
              return (
                <button
                  key={sc.id}
                  onClick={() => toggleScenario(sc.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-all border ${
                    active
                      ? 'bg-amber-50 border-amber-700/50 shadow-[0_0_12px_rgba(251,191,36,0.1)]'
                      : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-sm mt-0.5 flex-shrink-0">{sc.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold leading-tight ${active ? 'text-amber-300' : 'text-slate-700'}`}>
                        {sc.name}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{sc.short}</div>
                    </div>
                    <div className={`ml-auto mt-0.5 w-3 h-3 rounded-full flex-shrink-0 transition-all ${
                      active ? 'bg-amber-500 shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'bg-slate-700'
                    }`} />
                  </div>
                </button>
              )
            })}

            {/* Custom scenario */}
            <div className="px-2 pt-3 pb-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🛠 Custom</div>
            </div>
            <button
              onClick={() => setCustomOpen(o => !o)}
              className={`w-full text-left rounded-lg px-3 py-2.5 transition-all border ${
                customOpen
                  ? 'bg-blue-50 border-blue-700/50'
                  : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🔧</span>
                <div>
                  <div className="text-xs font-semibold text-slate-700">Build custom scenario</div>
                  <div className="text-[10px] text-slate-500">Configure any region's status manually</div>
                </div>
                <div className={`ml-auto transition-transform ${customOpen ? 'rotate-180' : ''}`}>
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {customOpen && (
              <div className="mx-2 mt-1 mb-2 bg-white/90 border border-slate-200 rounded-xl p-3 space-y-2">
                {ALL_REGIONS.map(reg => (
                  <div key={reg.id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 flex-1 min-w-0 truncate">{reg.name}</span>
                    <select
                      value={customRegions[reg.id] ?? 'open'}
                      onChange={e => {
                        setCustomRegions(prev => ({
                          ...prev,
                          [reg.id]: e.target.value as 'open' | 'restricted' | 'blocked',
                        }))
                      }}
                      className="text-[10px] bg-slate-800 border border-slate-600 text-slate-700 rounded-md px-1.5 py-1 focus:outline-none focus:border-blue-500"
                    >
                      <option value="open">Open</option>
                      <option value="restricted">Restricted</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={triggerManualSim}
                    disabled={isSimulating}
                    className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-slate-800 font-semibold py-1.5 rounded-lg transition-all disabled:opacity-50"
                  >
                    {isSimulating ? 'Simulating…' : 'Simulate'}
                  </button>
                  <button
                    onClick={applyToLive}
                    disabled={applyingLive}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all border ${
                      liveApplied
                        ? 'bg-green-900/50 text-green-400 border-green-700'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-700 border-slate-600'
                    }`}
                  >
                    {liveApplied ? '✓ Applied' : applyingLive ? 'Applying…' : 'Apply to live'}
                  </button>
                </div>
              </div>
            )}

            {/* Summary strip */}
            <div className="mx-2 mt-3 px-3 py-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                <span className="font-bold text-slate-800">{activeScenarioIds.size + (customOpen ? 1 : 0)}</span> events active
              </span>
              <span className="text-[11px] text-slate-400">
                <span className="font-bold text-slate-800">{affectedRegionCount()}</span> regions affected
              </span>
            </div>

          </div>

          {/* Run btn for pre-built */}
          {isActive && (
            <div className="p-3 border-t border-slate-200">
              <button
                onClick={triggerManualSim}
                disabled={isSimulating}
                className="w-full py-2.5 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-slate-800 text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-900/40 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSimulating ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Simulating fleet…
                  </>
                ) : 'Run simulation'}
              </button>
            </div>
          )}
        </aside>

        {/* == CENTRE -- Blast radius map (flex) ================================== */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Fleet exposure strip */}
          {simulationResult && (
            <div className="flex items-center gap-6 px-5 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-slate-400"><strong className="text-slate-800">{simulationResult.affected_count + simulationResult.exposed_count}</strong> vessels affected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs text-slate-400"><strong className="text-slate-800">{simulationResult.reroutable_count}</strong> reroutable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-700" />
                <span className="text-xs text-slate-400"><strong className="text-red-600">{simulationResult.exposed_count}</strong> exposed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-slate-400"><strong className="text-green-400">{simulationResult.unaffected_count}</strong> unaffected</span>
              </div>
            </div>
          )}

          {/* Map area */}
          <div className="flex-1 flex bg-slate-100 relative overflow-hidden">

            <WorldMap 
              shipments={shipments}
              simulationResult={simulationResult}
              activeScenario={mergedScenario()}
            />

            {/* Scenario active overlay */}
            {isSimulating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-100/80 backdrop-blur-sm">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-2 border-red-500/30 animate-ping absolute inset-0" />
                  <div className="w-16 h-16 rounded-full border-2 border-red-500/60 animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-7 h-7 text-red-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  </div>
                </div>
                <div className="mt-5 text-sm font-semibold text-slate-700">Simulating fleet exposure…</div>
                <div className="mt-1 text-xs text-slate-500">Running constraint × decision engine for all active shipments</div>
              </div>
            )}

            {/* Scenario result summary on map - minimized overlay */}
            {!isSimulating && simulationResult && (
              <div className="absolute bottom-6 left-6 z-10 w-80 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-2xl">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Simulation Summary</div>
                <div className="text-sm font-bold text-slate-800 mb-3">
                  {simulationResult.scenario_name}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-red-50 border border-red-800/30 p-2.5">
                    <div className="text-base font-bold text-red-600">{fmt(simulationResult.total_value_at_risk_usd)}</div>
                    <div className="text-[10px] text-slate-500">cargo at risk</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-800/30 p-2.5">
                    <div className="text-base font-bold text-amber-600">{fmt(simulationResult.daily_loss_rate_usd)}</div>
                    <div className="text-[10px] text-slate-500">daily loss</div>
                  </div>
                </div>

                {simulationResult.exposed_count > 0 && (
                  <div className="mt-2 text-[10px] font-bold text-red-600 bg-red-900/40 border border-red-800/50 px-2.5 py-1.5 rounded-lg flex items-center justify-between">
                    <span>⚠ {simulationResult.exposed_count} VESSELS EXPOSED</span>
                    <PulseRing color="red" />
                  </div>
                )}
              </div>
            )}

            {/* Idle state */}
            {!isSimulating && !simulationResult && (
              <div className="text-center">
                <div className="text-6xl mb-4 opacity-30">🌐</div>
                <div className="text-sm font-semibold text-slate-500">Select a scenario to begin simulation</div>
                <div className="text-xs text-slate-600 mt-1">Fleet exposure will be calculated in real time</div>
              </div>
            )}

          </div>
        </main>

        {/* == RIGHT -- Strategic fallout (340px) =============================== */}
        <aside className="w-[340px] flex-shrink-0 border-l border-slate-200 flex flex-col overflow-hidden bg-white">

          {/* -- Financial impact metrics -- */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3">Financial impact</div>
            {simulationResult ? (
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Cargo at risk"
                  value={fmt(simulationResult.total_value_at_risk_usd)}
                  sub="across affected fleet"
                  color="red"
                />
                <MetricCard
                  label="Daily loss rate"
                  value={fmt(simulationResult.daily_loss_rate_usd)}
                  sub="demurrage + holding"
                  color="amber"
                />
                <MetricCard
                  label="Avg delay"
                  value={`${simulationResult.avg_delay_days}d`}
                  sub="per rerouted vessel"
                  color="blue"
                />
                <MetricCard
                  label="Exposed vessels"
                  value={`${simulationResult.exposed_count}`}
                  sub="no safe route"
                  color={simulationResult.exposed_count > 0 ? 'red' : 'slate'}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {['Cargo at risk', 'Daily loss rate', 'Avg delay', 'Exposed vessels'].map(l => (
                  <div key={l} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs text-slate-600 mb-1">{l}</div>
                    <div className="h-5 w-16 bg-slate-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* -- Affected vessels list -- */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pt-3 pb-2 sticky top-0 bg-white z-10 border-b border-slate-100">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                Affected vessels
                {allAffected.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-slate-500 normal-case">
                    {allAffected.length} total
                  </span>
                )}
              </div>
            </div>

            {allAffected.length === 0 && !simulationResult && (
              <div className="px-4 py-8 text-center">
                <div className="text-slate-600 text-xs">No simulation active</div>
              </div>
            )}
            {simulationResult && allAffected.length === 0 && (
              <div className="px-4 py-8 text-center">
                <div className="text-green-500 text-sm">✓</div>
                <div className="text-slate-400 text-xs mt-1">No vessels affected by this scenario</div>
              </div>
            )}

            <div className="px-3 py-2 space-y-1.5">
              {allAffected.map((v, i) => (
                <div
                  key={v.shipment_id + i}
                  className={`rounded-xl border px-3 py-2.5 transition-all ${
                    v.status === 'exposed'
                      ? 'border-red-800/50 bg-red-950/30'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                        v.status === 'exposed'
                          ? 'bg-red-900/60 text-red-600 border-red-700/50'
                          : 'bg-amber-900/50 text-amber-600 border-amber-700/40'
                      }`}>
                        {v.status === 'exposed' ? 'EXPOSED' : 'REROUTABLE'}
                      </span>
                    </div>
                    <button
                      onClick={() => setDrawerShipment(vesselToShipment(v))}
                      className="text-[10px] text-blue-600 hover:text-blue-300 transition-colors"
                    >
                      View detail -
                    </button>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    {v.origin} → {v.destination}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {v.current_route} - <span className={v.status === 'exposed' ? 'text-red-600' : 'text-blue-600'}>{v.recommended_route}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                    <span className={v.delay_added_days > 0 ? 'text-amber-600 font-semibold' : 'text-slate-600'}>
                      {fmtDelay(v.delay_added_days)}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span>{fmt(v.cost_impact_usd)}</span>
                    {v.co2_delta_tonnes !== 0 && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className={v.co2_delta_tonnes > 0 ? 'text-orange-400' : 'text-green-400'}>
                          {v.co2_delta_tonnes > 0 ? '+' : ''}{v.co2_delta_tonnes.toFixed(0)}t CO₂
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* -- Analysis Insights button -- */}
          <div className="border-t border-slate-200 p-4 flex-shrink-0 bg-white">
            <button
              onClick={() => {
                setIsModalOpen(true)
                if (!briefGenerated) generateBrief()
              }}
              disabled={!simulationResult || isSimulating}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2
                bg-violet-600 border-violet-700 text-white
                hover:bg-violet-700 hover:border-violet-800 shadow-sm
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {briefGenerated ? 'View Analysis Insights' : 'Generate Analysis Insights'}
            </button>
          </div>

        </aside>
      </div>

      {/* -- Shipment Drawer overlay -- */}
      {drawerShipment && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerShipment(null)}
          />
          <div className="w-96 bg-white border-l border-slate-300 overflow-y-auto">
            <ShipmentDrawer
              shipment={drawerShipment}
              onClose={() => setDrawerShipment(null)}
            />
          </div>
        </div>
      )}

      {/* -- Error toast -- */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-950 border border-red-700 text-red-300 text-xs px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} className="text-red-600 hover:text-red-200">×</button>
        </div>
      )}

      <AnalysisModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} result={simulationResult} geminiBrief={briefText} isLoading={geminiLoading} />
    </div>
  )
}