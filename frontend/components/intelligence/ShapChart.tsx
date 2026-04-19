import { ShapItem } from '@/types'

const FEATURE_LABELS: Record<string, { label: string; detail: string }> = {
  n_blocked_regions:       { label: 'Blocked maritime regions',    detail: 'Regions on this route currently under full blockade' },
  n_restricted_regions:    { label: 'Restricted maritime regions', detail: 'Regions with reduced safe passage' },
  reliability_score:       { label: 'Historical route reliability', detail: 'How often this route completes on schedule' },
  constraint_penalty:      { label: 'Geopolitical risk level',     detail: 'Composite score of all active constraints on route' },
  weather_severity_route:  { label: 'Weather along route',         detail: 'Current precipitation and wind speed severity' },
  weather_severity_origin: { label: 'Weather at origin port',      detail: 'Departure port weather conditions' },
  distance_km:             { label: 'Route distance',              detail: 'Longer routes carry more cumulative risk' },
  base_time_hrs:           { label: 'Transit time',                detail: 'More time at sea means more exposure windows' },
  passes_suez:             { label: 'Suez Canal transit',          detail: 'Route passes through the Suez Canal chokepoint' },
  passes_hormuz:           { label: 'Strait of Hormuz',            detail: 'Route passes through Hormuz — critical oil corridor' },
  passes_malacca:          { label: 'Strait of Malacca',           detail: '40% of global trade passes through this corridor' },
  passes_bab_el_mandeb:    { label: 'Bab-el-Mandeb Strait',        detail: 'Currently active Houthi missile threat zone' },
  passes_cape:             { label: 'Cape of Good Hope',           detail: 'Safe alternative but adds 8–12 days transit' },
  passes_taiwan_strait:    { label: 'Taiwan Strait',               detail: 'Military tension zone — PLA naval exercises' },
  passes_south_china_sea:  { label: 'South China Sea',             detail: 'Territorial dispute zone with piracy risk' },
  departure_month:         { label: 'Departure timing',            detail: 'Seasonal factors affecting this route this month' },
  is_peak_season:          { label: 'Peak shipping season',        detail: 'Oct–Dec: highest global congestion period' },
  is_monsoon_season:       { label: 'Monsoon season',              detail: 'Jun–Sep: increased Indian Ocean weather risk' },
  zone_risk_score:         { label: 'Regional risk history',       detail: 'Historical delay rate for this geographic zone' },
  anomaly_flag:            { label: 'Anomalous conditions',        detail: 'Current conditions are significantly above baseline' },
  zone_id:                 { label: 'Logistics zone',              detail: 'Geographic risk cluster assignment' },
}

interface Props {
  items: ShapItem[]
}

export default function ShapChart({ items }: Props) {
  const increasing = items
    .filter(i => i.direction === 'increases_risk' && Math.abs(i.shap_value) > 0.01)
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, 4)

  const decreasing = items
    .filter(i => i.direction === 'decreases_risk' && Math.abs(i.shap_value) > 0.01)
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, 4)

  const maxAbs = Math.max(...items.map(i => Math.abs(i.shap_value)), 0.01)

  const baseRisk = 0.5  // SHAP values are relative to the base rate

  return (
    <div>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
        Each bar shows how much a specific factor shifted the risk score for this shipment,
        relative to an average route. Longer bars = stronger influence on the final prediction.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Increasing risk */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            Pushing risk higher
          </div>
          {increasing.length === 0 ? (
            <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No significant risk-increasing factors</p>
          ) : (
            increasing.map((item, i) => {
              const pct   = Math.abs(item.shap_value) / maxAbs * 100
              const meta  = FEATURE_LABELS[item.feature]
              const label = meta?.label ?? item.feature
              const detail = meta?.detail ?? ''
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{label}</span>
                    <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
                      +{(item.shap_value * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#fee2e2', borderRadius: 99, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#dc2626', borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{detail}</div>
                </div>
              )
            })
          )}
        </div>

        {/* Decreasing risk */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
            Protecting this shipment
          </div>
          {decreasing.length === 0 ? (
            <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No significant protective factors</p>
          ) : (
            decreasing.map((item, i) => {
              const pct   = Math.abs(item.shap_value) / maxAbs * 100
              const meta  = FEATURE_LABELS[item.feature]
              const label = meta?.label ?? item.feature
              const detail = meta?.detail ?? ''
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{label}</span>
                    <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>
                      {(item.shap_value * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#dcfce7', borderRadius: 99, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#16a34a', borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{detail}</div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <p style={{ fontSize: 10, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
          Powered by SHAP (SHapley Additive exPlanations) — an industry-standard explainability method that shows exactly which input features drove this prediction and by how much. Each value represents the marginal contribution of that feature to the final risk score.
        </p>
      </div>
    </div>
  )
}