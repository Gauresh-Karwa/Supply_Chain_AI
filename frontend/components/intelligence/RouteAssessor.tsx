'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { predictRoute, fetchRoutes, stripMarkdown, formatExposure } from '@/lib/api'
import { PredictResponse, Route } from '@/types'
import RiskGauge from './RiskGauge'
import ShapChart from './ShapChart'
import RouteMap from './RouteMap'

const PORT_COORDS: Record<string, { lon: number; lat: number }> = {
  'Shanghai':     { lon: 121.5, lat: 31.2 },
  'Singapore':    { lon: 103.8, lat:  1.4 },
  'Rotterdam':    { lon:   4.5, lat: 51.9 },
  'Dubai':        { lon:  55.3, lat: 25.2 },
  'Mumbai':       { lon:  72.8, lat: 18.9 },
  'Colombo':      { lon:  79.9, lat:  6.9 },
  'Busan':        { lon: 129.1, lat: 35.2 },
  'Hong_Kong':    { lon: 114.2, lat: 22.3 },
  'Hamburg':      { lon:  10.0, lat: 53.6 },
  'Antwerp':      { lon:   4.4, lat: 51.2 },
  'Piraeus':      { lon:  23.6, lat: 37.9 },
  'Karachi':      { lon:  67.0, lat: 24.9 },
  'Djibouti':     { lon:  43.1, lat: 11.6 },
  'Port_Klang':   { lon: 101.4, lat:  3.0 },
  'Los_Angeles':  { lon:-118.2, lat: 34.1 },
  'New_York':     { lon: -74.0, lat: 40.7 },
  'Santos':       { lon: -46.3, lat:-24.0 },
  'Sydney':       { lon: 151.2, lat:-33.9 },
  'Cape_Town':    { lon:  18.4, lat:-33.9 },
}

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
  const searchParams = useSearchParams()
  const initOrigin = searchParams.get('origin') || ''
  const initDest = searchParams.get('destination') || ''

  const [allRoutes,  setAllRoutes]  = useState<Route[]>([])
  const [origin,     setOrigin]     = useState(initOrigin)
  const [dest,       setDest]       = useState(initDest)
  const [date,       setDate]       = useState(() => new Date().toISOString().split('T')[0])
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<PredictResponse | null>(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    const o = searchParams.get('origin')
    const d = searchParams.get('destination')
    if (o) setOrigin(o)
    if (d) setDest(d)
  }, [searchParams])

  // Load all routes once on mount
  useEffect(() => {
    fetchRoutes().then(d => setAllRoutes(d.routes || []))
  }, [])

  // Auto-trigger assessment if URL params are present
  useEffect(() => {
    if (initOrigin && initDest) {
      handleAssess()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initOrigin, initDest])

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
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
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
          onClick={() => handleAssess()}
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

          {/* Map visualisation section */}
          <div className="h-64 mb-4">
            <RouteMap routes={[
              {
                id: 'main',
                origin: { ...(PORT_COORDS[result.recommendation.origin] || { lon: 0, lat: 0 }), label: result.recommendation.origin },
                destination: { ...(PORT_COORDS[result.recommendation.destination] || { lon: 0, lat: 0 }), label: result.recommendation.destination },
                color: result.prediction.risk_score >= 0.7 ? '#ef4444' : result.prediction.risk_score >= 0.45 ? '#f59e0b' : '#10b981',
                label: 'Recommended Route',
                isDashed: result.prediction.risk_score >= 0.7
              }
            ]} />
          </div>

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

            <div className={`col-span-2 ${result.explanation.structured ? '' : 'bg-blue-50 border border-blue-100 rounded-xl p-4'}`}>
              {result.explanation.structured ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm h-full">
                  <div className="px-4 py-2 bg-blue-600 flex justify-between items-center">
                    <span className="text-xs font-semibold text-white">AI Risk Assessment</span>
                    <span className="flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                      </span>
                      <span className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">Live</span>
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-2 flex gap-3">
                      <span className="text-xs text-slate-400 w-28 flex-shrink-0 pt-0.5">Situation</span>
                      <span className="text-xs text-slate-800 font-medium">{result.explanation.structured.situation}</span>
                    </div>
                    <div className="px-4 py-2 flex gap-3">
                      <span className="text-xs text-slate-400 w-28 flex-shrink-0 pt-0.5">Key risk factor</span>
                      <span className="text-xs text-red-600 font-medium">{result.explanation.structured.risk_driver}</span>
                    </div>
                    <div className="px-4 py-2 flex gap-3">
                      <span className="text-xs text-slate-400 w-28 flex-shrink-0 pt-0.5">Recommendation</span>
                      <span className="text-xs text-green-700 font-medium">{result.explanation.structured.recommendation}</span>
                    </div>
                    <div className="px-4 py-2 flex gap-3 items-center">
                      <span className="text-xs text-slate-400 w-28 flex-shrink-0">Confidence</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider ${
                        result.explanation.structured.confidence === 'high' ? 'bg-green-100 text-green-700'
                          : result.explanation.structured.confidence === 'medium' ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}>
                        {result.explanation.structured.confidence}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          <div className="bg-white border-2 border-blue-300 rounded-xl p-4">
            <div style={{ marginBottom: 8 }}>
              <span style={{
                fontSize: 10, background: '#1d4ed8', color: 'white',
                padding: '2px 10px', borderRadius: 99, fontWeight: 700,
              }}>
                Recommended — optimised route
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              {routeLabel(result.recommendation.waypoints)}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
              Multi-objective score: {result.recommendation.composite_score.toFixed(3)} — evaluated across{' '}
              {(result.alternatives?.length ?? 0) + 1 + (result.blocked_routes?.length ?? 0)} routes ·
              criteria: risk (35%) · reliability (25%) · carbon (20%) · cost (10%) · speed (10%)
            </div>
            <div className="flex gap-4 text-xs text-slate-500 flex-wrap items-center mt-3">
              <span>{result.recommendation.distance_km.toLocaleString()} km</span>
              <span>{Math.round(result.recommendation.base_time_hrs / 24)} days transit</span>
              <span>{Math.round(result.recommendation.reliability_score * 100)}% reliability</span>
              
              {result.prediction.weather && (
                <span className={`flex items-center gap-1 font-semibold px-2.5 py-1 rounded-full border ${
                  result.prediction.weather.origin_score > 2.5 
                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                  {result.prediction.weather.is_forecast ? 'Live Forecast' : 'Historical Weather'}: {
                    result.prediction.weather.origin_score >= 1.0 ? 'Severe' : 
                    result.prediction.weather.origin_score >= 0.3 ? 'Moderate' : 'Clear'
                  }
                </span>
              )}

              {result.recommendation.co2_emissions_tonnes !== undefined && (
                <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {result.recommendation.co2_emissions_tonnes.toLocaleString()} tCO₂
                </span>
              )}
            </div>
            {(() => {
              const exp = formatExposure(result.prediction.risk_score, result.prediction.delay_days, 18000)
              return exp ? (
                <div style={{
                  marginTop: 8, fontSize: 11, fontWeight: 600, color: '#dc2626',
                  padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, display: 'inline-block'
                }}>
                  {exp} at current delay estimate
                </div>
              ) : null
            })()}
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