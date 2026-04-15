'use client'
import { useState, useEffect } from 'react'
import { Route } from '@/types'
import { fetchRoutes, fetchRoutesForPair, whatIfSimulation, stripMarkdown } from '@/lib/api'
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

function routeDisplayName(route: Route): string {
  const keyMap: Record<string, string> = {
    'Suez_Canal':        'Route via Suez Canal',
    'Cape_of_Good_Hope': 'Route via Cape of Good Hope',
    'Hormuz_Strait':     'Route via Strait of Hormuz',
    'Malacca_Strait':    'Route via Strait of Malacca',
  }
  const key = route.waypoints?.find(w => keyMap[w])
  return key
    ? keyMap[key]
    : `Route via ${route.waypoints?.[0]?.replace(/_/g, ' ') ?? '—'}`
}

export default function RouteCompare() {
  const [origin,  setOrigin]  = useState('')
  const [dest,    setDest]    = useState('')
  const [date,    setDate]    = useState('')
  const [routes,  setRoutes]  = useState<Route[]>([])
  const [routeA,  setRouteA]  = useState('')
  const [routeB,  setRouteB]  = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<any>(null)
  const [error,   setError]   = useState('')

  const [allRoutes, setAllRoutes] = useState<Route[]>([])

  useEffect(() => {
    fetchRoutes().then(d => setAllRoutes(d.routes || []))
  }, [])

  const origins = [...new Set(allRoutes.map(r => r.origin))].sort()
  const destinations = origin
    ? [...new Set(allRoutes.filter(r => r.origin === origin).map(r => r.destination))].sort()
    : []

  useEffect(() => {
    if (origin && dest && origin !== dest) {
      fetchRoutesForPair(origin, dest)
        .then(d => { setRoutes(d.routes || []); setRouteA(''); setRouteB('') })
        .catch(() => setRoutes([]))
    }
  }, [origin, dest])

  async function handleCompare() {
    if (!origin || !dest || !date || !routeA || !routeB) {
      setError('Please fill in all fields.')
      return
    }
    if (routeA === routeB) {
      setError('Please select two different routes.')
      return
    }
    setError(''); setLoading(true); setResult(null)
    try {
      setResult(await whatIfSimulation(origin, dest, date, routeA, routeB))
    } catch {
      setError('Comparison failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const routeAData = routes.find(r => r.id === routeA)
  const routeBData = routes.find(r => r.id === routeB)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Select routes to compare</h2>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Origin port</label>
            <select
              value={origin}
              onChange={e => { setOrigin(e.target.value); setResult(null) }}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
            >
              <option value="">Select origin</option>
              {origins.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Destination port</label>
            <select
              value={dest}
              onChange={e => { setDest(e.target.value); setResult(null) }}
              disabled={!origin}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
            >
              <option value="">Select destination</option>
              {destinations.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Departure date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
            />
          </div>
        </div>

        {routes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Current route</label>
              <select
                value={routeA}
                onChange={e => setRouteA(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
              >
                <option value="">Select route</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{routeDisplayName(r)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Alternate route</label>
              <select
                value={routeB}
                onChange={e => setRouteB(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
              >
                <option value="">Select route</option>
                {routes.filter(r => r.id !== routeA).map(r => (
                  <option key={r.id} value={r.id}>{routeDisplayName(r)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {routes.length === 0 && origin && dest && origin !== dest && (
          <p className="text-xs text-slate-400 mb-3">
            No routes found for this origin-destination pair.
          </p>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <button
          onClick={() => handleCompare()}
          disabled={loading || !origin || !dest || !date || !routeA || !routeB}
          className="bg-blue-600 text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Comparing routes...' : 'Compare routes →'}
        </button>
      </div>

      {result && (
        <div className="space-y-4">

          {/* Side by side */}
          <div className="grid grid-cols-2 gap-4">
            {([
              { label: 'Current route',   data: result.current_route,   info: routeAData },
              { label: 'Alternate route', data: result.alternate_route, info: routeBData },
            ] as const).map(({ label, data, info }, i) => {
              const isRecommended = (i === 1 && result.delta.recommendation === 'switch') || (i === 0 && result.delta.recommendation !== 'switch')
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-xl p-4 ${
                    isRecommended ? 'border-green-300 bg-green-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-xs font-medium text-slate-500">{label}</div>
                    {isRecommended && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-medium">
                        Recommended
                      </span>
                    )}
                  </div>
                  {info && (
                    <div className="text-xs font-semibold text-slate-800 mb-2">
                      {routeDisplayName(info)}
                    </div>
                  )}
                  <div className={`text-3xl font-bold mb-1 ${
                    data.risk_score >= 0.70 ? 'text-red-600'
                    : data.risk_score >= 0.45 ? 'text-amber-600'
                    : 'text-green-600'
                  }`}>
                    {Math.round(data.risk_score * 100)}%
                  </div>
                  <div className="text-xs text-slate-400">disruption risk</div>
                  {data.delay_days > 0 && (
                    <div className="text-xs text-slate-500 mt-1.5">
                      {data.delay_days.toFixed(1)} days estimated delay
                    </div>
                  )}
                  {(data as any).co2_emissions_tonnes !== undefined && (
                    <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {(data as any).co2_emissions_tonnes.toLocaleString()} tCO₂
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Map visualisation for comparison */}
          <div className="h-64 mb-4">
            <RouteMap routes={[
              result.delta.recommendation === 'switch' ? {
                id: 'route-b',
                origin: { ...(PORT_COORDS[origin] || { lon: 0, lat: 0 }), label: origin },
                destination: { ...(PORT_COORDS[dest] || { lon: 0, lat: 0 }), label: dest },
                color: '#10b981',
                label: 'Recommended Route',
                isDashed: false
              } : {
                id: 'route-a',
                origin: { ...(PORT_COORDS[origin] || { lon: 0, lat: 0 }), label: origin },
                destination: { ...(PORT_COORDS[dest] || { lon: 0, lat: 0 }), label: dest },
                color: '#3b82f6',
                label: 'Current Route',
                isDashed: true
              }
            ]} />
          </div>

          {/* Delta */}
          <div className={`rounded-xl p-4 border ${
            result.delta.risk_change < 0
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="text-xs font-semibold mb-2">
              {result.delta.risk_change < 0
                ? '✓ Switching to the alternate route reduces risk'
                : '✗ Switching to the alternate route increases risk'}
            </div>
            <div className="text-xs opacity-80 space-y-1">
              <div>Risk {result.delta.risk_change < 0 ? 'reduces' : 'increases'} by{' '}
                {Math.abs(Math.round(result.delta.risk_change * 100))}%
              </div>
              <div>Delay {result.delta.delay_change_days < 0 ? 'reduces' : 'increases'} by{' '}
                {Math.abs(result.delta.delay_change_days).toFixed(1)} days
              </div>
              {result.delta.co2_change_tonnes !== undefined && (
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  CO₂ footprint {result.delta.co2_change_tonnes < 0 ? 'reduces' : 'increases'} by{' '}
                  {Math.abs(result.delta.co2_change_tonnes).toLocaleString()} tCO₂
                </div>
              )}
            </div>
          </div>

          {/* Gemini analysis */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-blue-700 mb-2">Expert analysis</div>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {stripMarkdown(result.gemini_comparison)}
            </p>
          </div>

        </div>
      )}
    </div>
  )
}