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
}

export interface Explanation {
  gemini_explanation: string
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