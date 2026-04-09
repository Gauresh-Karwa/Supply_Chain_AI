'use client'
import { useState, useEffect } from 'react'
import { predictRoute, fetchRoutes, stripMarkdown } from '@/lib/api'
import { PredictResponse, Route } from '@/types'
import RiskGauge from './RiskGauge'
import ShapChart from './ShapChart'

function routeLabel(waypoints: string[]): string {
  const keyMap: Record<string, string> = {
    'Suez_Canal':        'Route via Suez Canal',
    'Cape_of_Good_Hope': 'Route via Cape of Good Hope',
    'Hormuz_Strait':     'Route via Strait of Hormuz',
    'Malacca_Strait':    'Route via Strait of Malacca',
  }
  const key = waypoints.find(w => keyMap[w])
  return key ? keyMap[key] : `Route via ${waypoints[0]?.replace(/_/g, ' ') ?? '—'}`
}

export default function RouteAssessor() {
  const [allRoutes,  setAllRoutes]  = useState<Route[]>([])
  const [origin,     setOrigin]     = useState('')
  const [dest,       setDest]       = useState('')
  const [date,       setDate]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<PredictResponse | null>(null)
  const [error,      setError]      = useState('')

  // Load all routes once on mount
  useEffect(() => {
    fetchRoutes().then(d => setAllRoutes(d.routes || []))
  }, [])

  // All unique origins
  const origins = [...new Set(allRoutes.map(r => r.origin))].sort()

  // Destinations available from selected origin
  const destinations = origin
    ? [...new Set(
        allRoutes
          .filter(r => r.origin === origin)
          .map(r => r.destination)
      )].sort()
    : []

  function handleOriginChange(val: string) {
    setOrigin(val)
    setDest('')       // reset destination when origin changes
    setResult(null)
    setError('')
  }

  async function handleAssess() {
    if (!origin || !dest || !date) { setError('Please fill in all fields.'); return }
    setError(''); setLoading(true); setResult(null)
    try {
      setResult(await predictRoute(origin, dest, date))
    } catch {
      setError('Could not assess this route. Please check the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Route details</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Origin port</label>
            <select
              value={origin}
              onChange={e => handleOriginChange(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">Select origin</option>
              {origins.map(p => (
                <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Destination port</label>
            <select
              value={dest}
              onChange={e => { setDest(e.target.value); setResult(null) }}
              disabled={!origin}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {origin ? 'Select destination' : 'Select origin first'}
              </option>
              {destinations.map(p => (
                <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Planned departure</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button
          onClick={handleAssess}
          disabled={loading || !origin || !dest || !date}
          className="bg-blue-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Analysing...' : 'Assess disruption risk →'}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {result.fallback_mode && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
              ⚠ {result.warning}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center">
              <div className="text-xs font-medium text-slate-500 mb-1">Disruption risk</div>
              <RiskGauge score={result.prediction.risk_score} />
              {result.prediction.delay_days > 0 && (
                <div className="text-center mt-2">
                  <div className="text-xs text-slate-400">Estimated delay</div>
                  <div className="text-sm font-bold text-slate-700">
                    {result.prediction.delay_days.toFixed(1)} days
                  </div>
                </div>
              )}
            </div>

            <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-xs font-semibold text-blue-700 mb-2">Analysis summary</div>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {stripMarkdown(result.explanation.gemini_explanation)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.explanation.risk_drivers.slice(0, 3).map((d, i) => (
                  <span key={i} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                    d.direction === 'increases_risk'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-green-50 text-green-600 border-green-200'
                  }`}>
                    {d.direction === 'increases_risk' ? '↑' : '↓'} {d.factor}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-blue-300 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-full font-semibold">
                  Recommended
                </span>
                <div className="text-sm font-bold text-slate-800 mt-2">
                  {routeLabel(result.recommendation.waypoints)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Score</div>
                <div className="text-sm font-bold text-slate-700">
                  {result.recommendation.composite_score.toFixed(3)}
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-slate-500 flex-wrap items-center mt-3">
              <span>{result.recommendation.distance_km.toLocaleString()} km</span>
              <span>{Math.round(result.recommendation.base_time_hrs / 24)} days transit</span>
              <span>{Math.round(result.recommendation.reliability_score * 100)}% reliability</span>
              {result.recommendation.co2_emissions_tonnes !== undefined && (
                <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {result.recommendation.co2_emissions_tonnes.toLocaleString()} tCO₂
                </span>
              )}
            </div>
          </div>

          {result.alternatives.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Alternative routes</div>
              <div className="space-y-2">
                {result.alternatives.map((alt, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="text-xs font-medium text-slate-700">
                        {routeLabel(alt.waypoints)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex gap-2 items-center">
                        <span>{alt.distance_km.toLocaleString()} km · {Math.round(alt.base_time_hrs / 24)} days</span>
                        {alt.co2_emissions_tonnes !== undefined && (
                          <span className="text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {alt.co2_emissions_tonnes.toLocaleString()} tCO₂
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-semibold ${
                        alt.risk_score >= 0.70 ? 'text-red-600'
                        : alt.risk_score >= 0.45 ? 'text-amber-600'
                        : 'text-green-600'
                      }`}>
                        {Math.round(alt.risk_score * 100)}% risk
                      </div>
                      <div className="text-xs text-slate-400">score {alt.composite_score.toFixed(3)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-700 mb-3">
              What is driving this risk assessment
            </div>
            <ShapChart items={result.prediction.top_shap} />
          </div>

          {result.blocked_routes.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-500 mb-1">Routes unavailable</div>
              {result.blocked_routes.map((r, i) => (
                <div key={i} className="text-xs text-slate-400">
                  Route through blocked region — not recommended under current conditions
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}