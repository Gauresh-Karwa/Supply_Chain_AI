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
    for item in top_shap[:5]:
        label     = FEATURE_LABELS.get(item["feature"], item["feature"])
        direction = "Elevated risk" if item["direction"] == "increases_risk" else "Reduced risk"
        val       = item["value"]
        drivers.append(f"- {label}: {val} unit impact ({direction})")
    drivers_text = "\n".join(drivers)

    # Extract intelligence notes for Gemini to use
    intel_text = ""
    try:
        from app.engine.constraint_engine import get_constraint_details
        details = get_constraint_details()
        pass_through = route.get("passes_through", [])
        snippets = []
        for pid in pass_through:
            d = details.get(pid)
            if d and d["status"] in ["blocked", "restricted", "under_watch"]:
                snippets.append(f"• {d['region_name']} ({d['status'].upper()}): {d['notes']}")
        if snippets:
            intel_text = "\nCritical Chokepoint Intelligence:\n" + "\n".join(snippets) + "\n"
    except Exception:
        pass

    prompt_text = f"""You are an elite maritime intelligence analyst briefing a Chief Supply Chain Officer (CSCO).

Shipment Route: {route.get('origin')} → {route.get('destination')}
Proprietary Risk Level: {STATUS_LABELS.get(status, status)} ({risk_score:.0%} Probability of Delay)
Predicted Days Lost: {delay_days:.1f} days
Total Nautical Distance: {route.get('distance_km', 0):,} km
Historical Route Reliability: {route.get('reliability_score', 0):.0%}

Primary Predictive Risk Drivers:
{drivers_text}
{intel_text}
Provide a high-fidelity, tactical intelligence report structured as follows:

**Operational Situation**
- Use a 1-sentence analytical overview of the current route status.

**Key Risk Drivers & Tactical Intel**
- List 3-4 detailed bullet points. 
- Use the 'Predictive Risk Drivers' and 'Critical Chokepoint Intelligence' provided.
- CITE specific numbers.
- Sound like a live intelligence wire.

**Strategic Recommendation**
- Provide exactly ONE actionable recommendation based on the risk level.

Maintain a professional, authoritative, and data-driven tone. Avoid all-caps headers or ### markdown. Use bold Title Case headers.
"""

    try:
        client   = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt_text
        )
        explanation = response.text.strip()
    except Exception as e:
        print(f"DEBUG GEMINI ERROR: {str(e)}")
        
        # Highly intelligent local fallback if API key is invalid/exhausted
        intel_text = ""
        try:
            from app.engine.constraint_engine import get_constraint_details
            details = get_constraint_details()
            pass_through = route.get("passes_through", [])
            snippets = []
            for pid in pass_through:
                d = details.get(pid)
                if d and d["status"] in ["blocked", "restricted", "under_watch"]:
                    snippets.append(f"• Due to {d['notes'].lower().rstrip('.')}, the {d['region_name']} is currently {d['status'].upper()}.")
            if snippets:
                intel_text = "\nActive Chokepoint Intelligence:\n" + "\n".join(snippets) + "\n\n"
        except Exception:
            pass

        factor_details = []
        for item in top_shap[:3]:
            label = FEATURE_LABELS.get(item["feature"], item["feature"])
            direction = "Elevated risk" if item["direction"] == "increases_risk" else "Reduced risk"
            factor_details.append(f"{label} ({direction})")
            
        factors_str = "; ".join(factor_details)
        
        if status == "at_risk":
            recommendation = "Immediate review of alternative routing corridors is advised to maintain supply chain flow and bypass these specific highlighted transit bottlenecks."
        elif status == "watch":
            recommendation = "Maintain current routing but monitor tactical intelligence closely; increased buffer inventory at destination is recommended."
        else:
            recommendation = "Proceed with this route as the primary strategic corridor. Current metrics indicate a profile consistent with stable operations."

        explanation = (
            f"**Executive Intelligence Summary**\n"
            f"Shipment {route.get('origin')} → {route.get('destination')} is currently classified as **{STATUS_LABELS.get(status, status)}**. "
            f"The probability of disruption is {risk_score:.0%}, with a predicted strategic delay of {delay_days:.1f} days.\n\n"
            f"**Tactical Risk Drivers**\n"
            f"- Logistics Profile: {factors_str}.\n"
            f"{intel_text}\n"
            f"**Strategic Recommendation**\n"
            f"{recommendation}"
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