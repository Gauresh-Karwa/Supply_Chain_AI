"""
Wraps SHAP values into plain English using Gemini API.
"""
from google import genai
from app.core.config import GEMINI_API_KEY

FEATURE_LABELS = {
    "distance_km":             "route distance",
    "base_time_hrs":           "expected transit time",
    "reliability_score":       "route historical reliability",
    "weather_severity_origin": "weather conditions at origin port",
    "weather_severity_route":  "weather conditions along route",
    "n_restricted_regions":    "number of restricted maritime regions",
    "n_blocked_regions":       "number of blocked maritime regions",
    "constraint_penalty":      "geopolitical constraint severity",
    "passes_suez":             "Suez Canal transit",
    "passes_hormuz":           "Strait of Hormuz transit",
    "passes_malacca":          "Strait of Malacca transit",
    "passes_bab_el_mandeb":    "Bab-el-Mandeb Strait transit",
    "passes_cape":             "Cape of Good Hope route",
    "passes_taiwan_strait":    "Taiwan Strait transit",
    "passes_south_china_sea":  "South China Sea transit",
    "departure_month":         "month of departure",
    "is_peak_season":          "peak shipping season",
    "is_monsoon_season":       "monsoon season",
    "zone_id":                 "logistics zone",
    "zone_risk_score":         "zone historical risk level",
    "anomaly_flag":            "abnormal conditions detected",
}

STATUS_LABELS = {
    "at_risk": "HIGH RISK",
    "watch":   "MEDIUM RISK",
    "on_time": "LOW RISK",
}


def generate_explanation(prediction: dict, route: dict) -> dict:
    risk_score = prediction["risk_score"]
    delay_days = prediction["delay_days"]
    status     = prediction["status"]
    top_shap   = prediction["top_shap"]

    drivers = []
    for item in top_shap[:3]:
        label     = FEATURE_LABELS.get(item["feature"], item["feature"])
        direction = "increasing" if item["direction"] == "increases_risk" else "decreasing"
        drivers.append(
            f"- {label} is {direction} delay risk "
            f"(impact score: {abs(item['shap_value']):.3f})"
        )
    drivers_text = "\n".join(drivers)

    prompt_text = f"""You are a maritime logistics analyst writing a brief risk summary for a shipping manager.

Shipment details:
- Route: {route.get('origin')} → {route.get('destination')}
- Risk level: {STATUS_LABELS.get(status, status)} ({risk_score:.0%} probability of delay)
- Predicted delay if disrupted: {delay_days:.1f} days
- Distance: {route.get('distance_km', 0):,} km
- Route reliability score: {route.get('reliability_score', 0):.0%}

Top factors driving this risk assessment:
{drivers_text}

Write 2-3 sentences plain English explanation of why this shipment is at risk and what a logistics manager should consider.
Be specific about the maritime factors involved.
Do not use technical ML terms like SHAP or model.
End with one clear recommended action."""

    try:
        client   = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt_text
        )
        explanation = response.text.strip()
    except Exception:
        explanation = (
            f"This shipment has a {risk_score:.0%} probability of delay "
            f"with a predicted delay of {delay_days:.1f} days if disrupted. "
            f"Key risk factors include geopolitical constraints and route conditions."
        )

    return {
        "gemini_explanation": explanation,
        "risk_drivers": [
            {
                "factor":    FEATURE_LABELS.get(item["feature"], item["feature"]),
                "impact":    abs(item["shap_value"]),
                "direction": item["direction"],
            }
            for item in top_shap[:3]
        ],
        "risk_level":      STATUS_LABELS.get(status, status),
        "risk_percentage": f"{risk_score:.0%}",
        "predicted_delay": f"{delay_days:.1f} days" if delay_days > 0 else "None",
    }