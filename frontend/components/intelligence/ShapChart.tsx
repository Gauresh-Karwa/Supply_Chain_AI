import { ShapItem } from '@/types'

const FEATURE_LABELS: Record<string, string> = {
  n_blocked_regions:       'Blocked maritime regions',
  n_restricted_regions:    'Restricted maritime regions',
  reliability_score:       'Route reliability history',
  constraint_penalty:      'Geopolitical risk level',
  weather_severity_route:  'Weather along route',
  weather_severity_origin: 'Weather at origin port',
  distance_km:             'Route distance',
  base_time_hrs:           'Transit time',
  passes_suez:             'Suez Canal transit',
  passes_hormuz:           'Strait of Hormuz transit',
  passes_malacca:          'Strait of Malacca transit',
  passes_bab_el_mandeb:    'Bab-el-Mandeb transit',
  passes_cape:             'Cape of Good Hope route',
  passes_taiwan_strait:    'Taiwan Strait transit',
  passes_south_china_sea:  'South China Sea transit',
  departure_month:         'Time of year',
  is_peak_season:          'Peak shipping season',
  is_monsoon_season:       'Monsoon season',
  zone_risk_score:         'Regional risk history',
  anomaly_flag:            'Unusual conditions',
  zone_id:                 'Logistics zone',
}

interface Props {
  items: ShapItem[]
}

export default function ShapChart({ items }: Props) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.shap_value)), 0.01)

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct    = Math.abs(item.shap_value) / maxAbs * 100
        const isRisk = item.direction === 'increases_risk'
        const label  = FEATURE_LABELS[item.feature] || item.feature

        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">{label}</span>
              <span className={`font-medium ${isRisk ? 'text-red-500' : 'text-green-600'}`}>
                {isRisk ? '↑ increases risk' : '↓ reduces risk'}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isRisk ? 'bg-red-400' : 'bg-green-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
        Powered by SHAP — shows which factors are driving the risk score for this specific shipment.
      </p>
    </div>
  )
}