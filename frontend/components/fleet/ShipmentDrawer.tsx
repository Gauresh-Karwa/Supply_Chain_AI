'use client'
import { useEffect, useState } from 'react'
import { Shipment, PredictResponse } from '@/types'
import { predictRoute, stripMarkdown } from '@/lib/api'
import ShapChart from '@/components/intelligence/ShapChart'

interface Props {
  shipment: Shipment
  onClose:  () => void
}

export default function ShipmentDrawer({ shipment, onClose }: Props) {
  const [data,    setData]    = useState<PredictResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const date = new Date(shipment.departure_time).toISOString().split('T')[0]
    setLoading(true)
    setData(null)
    setError('')
    predictRoute(shipment.origin, shipment.destination, date)
      .then(setData)
      .catch(() => setError('Could not load analysis for this route.'))
      .finally(() => setLoading(false))
  }, [shipment.id])

  function routeLabel(waypoints: string[]): string {
    const keyMap: Record<string, string> = {
      'Suez_Canal':        'Suez Canal',
      'Cape_of_Good_Hope': 'Cape of Good Hope',
      'Hormuz_Strait':     'Strait of Hormuz',
      'Malacca_Strait':    'Strait of Malacca',
    }
    const key = waypoints.find(w => keyMap[w])
    return key
      ? `Route via ${keyMap[key]}`
      : `Route via ${waypoints[0]?.replace(/_/g, ' ') ?? '—'}`
  }

  return (
    <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {shipment.origin} → {shipment.destination}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Shipment analysis</div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 text-xl leading-none ml-4"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading && (
          <div className="text-center py-12 text-sm text-slate-400">
            Analysing route...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">

            {data.fallback_mode && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                ⚠ {data.warning}
              </div>
            )}

            {/* Risk score */}
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Disruption risk</div>
              <div className={`text-4xl font-bold ${
                data.prediction.risk_score >= 0.70 ? 'text-red-600'
                : data.prediction.risk_score >= 0.45 ? 'text-amber-600'
                : 'text-green-600'
              }`}>
                {Math.round(data.prediction.risk_score * 100)}%
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {data.prediction.risk_score >= 0.70 ? 'Needs attention'
                 : data.prediction.risk_score >= 0.45 ? 'Under watch'
                 : 'On schedule'}
              </div>
              {data.prediction.delay_days > 0 && (
                <div className="text-xs text-slate-500 mt-2 bg-white rounded-lg px-3 py-1.5 border border-slate-200 inline-block">
                  Estimated delay if disrupted: <strong>{data.prediction.delay_days.toFixed(1)} days</strong>
                </div>
              )}
            </div>

            {/* Gemini explanation */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-xs font-semibold text-blue-700 mb-2">What this means</div>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {stripMarkdown(data.explanation.gemini_explanation)}
              </p>
            </div>

            {/* SHAP chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-700 mb-3">
                What is driving this risk
              </div>
              <ShapChart items={data.prediction.top_shap} />
            </div>

            {/* Recommended route */}
            <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-blue-700 mb-1">Recommended route</div>
              <div className="text-sm font-bold text-slate-800 mb-2">
                {routeLabel(data.recommendation.waypoints)}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500 items-center">
                <span>{data.recommendation.distance_km.toLocaleString()} km</span>
                <span>{Math.round(data.recommendation.base_time_hrs / 24)} days transit</span>
                <span>{Math.round(data.recommendation.reliability_score * 100)}% reliability</span>
                {data.recommendation.co2_emissions_tonnes !== undefined && (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {data.recommendation.co2_emissions_tonnes.toLocaleString()} tCO₂
                  </span>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}