export interface Shipment {
  id: string
  origin: string
  destination: string
  departure_time: string
  transport_mode: string
  risk_score: number
  predicted_delay_days: number
  anomaly_flag: boolean
  status: 'on_time' | 'watch' | 'at_risk' | 'delivered'
  updated_at: string
  cargo_type?: string
  cargo_value_usd?: number
  daily_delay_cost_usd?: number
}

export interface Route {
  id: string
  origin: string
  destination: string
  waypoints: string[]
  distance_km: number
  base_time_hrs: number
  reliability_score: number
  cost_estimate: number
  passes_through: string[]
  transport_mode: string
  co2_emissions_tonnes?: number
}

export interface Constraint {
  region_id: string
  region_name: string
  status: 'open' | 'restricted' | 'blocked'
  type: string
  notes: string
  updated_at: string
}

export interface ShapItem {
  feature: string
  value: number
  shap_value: number
  direction: 'increases_risk' | 'decreases_risk'
}

export interface Prediction {
  risk_score: number
  delay_days: number
  status: string
  top_shap: ShapItem[]
  weather?: {
    origin_score: number
    route_score: number
    is_forecast: boolean
  }
}

export interface Explanation {
  gemini_explanation: string
  structured?: {
    situation: string
    risk_driver: string
    recommendation: string
    confidence: 'high' | 'medium' | 'low'
  }
  risk_drivers: { factor: string; impact: number; direction: string }[]
  risk_level: string
  risk_percentage: string
  predicted_delay: string
}

export interface PredictResponse {
  fallback_mode: boolean
  warning: string | null
  recommendation: Route & { composite_score: number; rank: number }
  prediction: Prediction
  explanation: Explanation
  alternatives: (Route & { composite_score: number; risk_score: number; delay_days: number; rank: number })[]
  blocked_routes: { origin: string; destination: string; reason: string }[]
  constraint_snapshot: Record<string, string>
}

// -- Risk Simulation / Scenario Engine ------------------------------------------
export interface AffectedVessel {
  shipment_id: string
  origin: string
  destination: string
  current_route: string
  recommended_route: string
  delay_added_days: number
  cost_impact_usd: number
  co2_delta_tonnes: number
  risk_score: number
  status: 'reroutable' | 'exposed'
}

export interface CascadePort {
  port:                    string
  rerouted_vessels:        number
  congestion_increase_pct: number
  alert_level:             'high' | 'medium'
  message:                 string
}

export interface SimulationResult {
  scenario_name: string
  affected_count: number
  reroutable_count: number
  exposed_count: number
  unaffected_count: number
  total_value_at_risk_usd: number
  daily_loss_rate_usd: number
  avg_delay_days: number
  affected_vessels: AffectedVessel[]
  exposed_vessels: AffectedVessel[]
  gemini_brief: string
  cascade_effects: CascadePort[]
}