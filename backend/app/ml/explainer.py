import json
from google import genai
from app.core.config import GEMINI_API_KEY

STATUS_LABELS = {
    "on_time": "Low Risk",
    "watch":   "Elevated Watch",
    "at_risk": "High Disruption Risk",
}

FEATURE_LABELS = {
    "distance_km":            "Route Distance",
    "base_time_hrs":          "Base Transit Time",
    "weather_severity_origin": "Origin Weather Disturbance",
    "weather_severity_route":  "Route Weather Disturbance",
    "passes_suez":            "Suez Canal Transit",
    "passes_hormuz":          "Strait of Hormuz Transit",
    "passes_malacca":         "Strait of Malacca Transit",
    "passes_bab_el_mandeb":   "Bab-el-Mandeb Transit",
    "passes_cape":            "Cape of Good Hope Route",
    "passes_taiwan_strait":   "Taiwan Strait Transit",
    "passes_south_china_sea": "South China Sea Transit",
    "departure_month":        "Time of Year",
    "is_peak_season":         "Peak Season Constraints",
    "is_monsoon_season":      "Monsoon Constraints",
    "zone_risk_score":        "Geopolitical Zone Risk",
    "anomaly_flag":           "Anomaly Pattern Detected",
    "zone_id":                "Geofenced Logistics Zone",
}

def generate_explanation(prediction: dict, route: dict) -> dict:
    risk_score = prediction["risk_score"]
    delay_days = prediction["delay_days"]
    status     = prediction["status"]
    top_shap   = prediction["top_shap"]

    drivers = []
    for item in top_shap[:5]:
        label     = FEATURE_LABELS.get(item["feature"], item["feature"])
        direction = "Elevated risk" if item["direction"] == "increases_risk" else "Reduced risk"
        val       = item["value"]
        drivers.append(f"- {label}: {val} unit impact ({direction})")
    drivers_text = "\n".join(drivers)

    prompt_text = f"""You are a senior maritime risk analyst. Write a concise, professional assessment for a logistics executive.

Route: {route.get('origin')} to {route.get('destination')}
Risk level: {STATUS_LABELS.get(status, status)} — {risk_score:.0%} probability of delay
Predicted delay if disrupted: {delay_days:.1f} days
Route distance: {route.get('distance_km', 0):,} km
Historical on-time reliability: {route.get('reliability_score', 0):.0%}

Top risk factors:
{drivers_text}

Output format — write EXACTLY these four sections. NO markdown, NO asterisks, NO hashtags, NO emojis. Use plain prose only.

ROUTE STATUS
One sentence. State the overall risk level and primary cause in plain language.

OPERATIONAL CONTEXT
Two to three sentences. Explain what is happening on this specific corridor right now — include real geography, active constraints, and why this route is exposed. Do not restate what the risk factors already show.

RECOMMENDED ACTIONS
1. Immediate (within 24 hours): one specific action.
2. Short-term (within 7 days): one monitoring or contingency step.
3. Contingency (if conditions worsen): one structural fallback.

FINANCIAL EXPOSURE
Two sentences. Estimate the specific cost impact of a {delay_days:.1f}-day delay using standard demurrage rates and inventory holding costs. State a dollar range.

Write for a board-level audience. Be specific, not generic."""


    try:
        client   = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt_text
        )
        explanation = response.text.strip()
        structured  = None  # Switch frontend to rich prose mode
        
    except Exception as e:
        print(f"DEBUG GEMINI ERROR: {str(e)}")
        # Safe fallback if API fails
        explanation = f"This shipment has a {risk_score:.0%} probability of delay. Key factor: route conditions."
        structured  = None

    return {
        "gemini_explanation": explanation,
        "structured":         structured,
        "risk_drivers":[
            {
                "factor":    FEATURE_LABELS.get(item["feature"], item["feature"]),
                "impact":    abs(item["shap_value"]),
                "direction": item["direction"],
            }
            for item in top_shap[:3]
        ],
        "risk_level":         STATUS_LABELS.get(status, status),
        "risk_percentage":    f"{risk_score:.0%}",
        "predicted_delay":    f"{delay_days:.1f} days" if delay_days > 0 else "None",
    }