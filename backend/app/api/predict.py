"""
POST /predict  — full prediction pipeline
POST /whatif   — alternate route simulation
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from google import genai

from app.engine.constraint_engine import get_constraint_statuses, get_feasible_routes
from app.engine.decision_engine import rank_routes
from app.ml.explainer import generate_explanation
from app.core.config import GEMINI_API_KEY

router = APIRouter(prefix="/predict", tags=["Prediction"])


class PredictRequest(BaseModel):
    origin:         str
    destination:    str
    departure_date: str


class WhatIfRequest(BaseModel):
    origin:             str
    destination:        str
    departure_date:     str
    current_route_id:   str
    alternate_route_id: str


@router.post("")
async def predict_shipment(req: PredictRequest):
    try:
        departure_date = datetime.strptime(req.departure_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "departure_date must be YYYY-MM-DD")

    constraint_statuses = get_constraint_statuses()
    routes = get_feasible_routes(req.origin, req.destination, constraint_statuses)

    if not routes:
        raise HTTPException(404, f"No routes found for {req.origin} → {req.destination}")

    ranked   = rank_routes(routes, departure_date, constraint_statuses)
    feasible = [r for r in ranked if r.get("is_feasible", False)]
    fallback_active = any(r.get("fallback_mode") for r in feasible)

    if not feasible:
        return {
            "status":  "all_routes_blocked",
            "message": "All routes blocked due to geopolitical constraints",
            "blocked_routes": [
                {
                    "origin":      r["origin"],
                    "destination": r["destination"],
                    "reason":      r.get("filtered_reason"),
                }
                for r in ranked
            ],
        }

    best_route  = feasible[0]
    explanation = generate_explanation(best_route["prediction"], best_route)

    return {
        "fallback_mode": fallback_active,
        "warning": feasible[0].get("warning") if fallback_active else None,
        "recommendation": {
            "route_id":          best_route.get("id"),
            "origin":            best_route["origin"],
            "destination":       best_route["destination"],
            "waypoints":         best_route.get("waypoints", []),
            "transport_mode":    best_route["transport_mode"],
            "distance_km":       best_route["distance_km"],
            "base_time_hrs":     best_route["base_time_hrs"],
            "reliability_score": best_route["reliability_score"],
            "composite_score":   best_route["composite_score"],
            "rank":              1,
        },
        "prediction": {
            "risk_score": best_route["prediction"]["risk_score"],
            "delay_days": best_route["prediction"]["delay_days"],
            "status":     best_route["prediction"]["status"],
            "top_shap":   best_route["prediction"]["top_shap"],
        },
        "explanation": explanation,
        "alternatives": [
            {
                "route_id":          r.get("id"),
                "origin":            r["origin"],
                "destination":       r["destination"],
                "waypoints":         r.get("waypoints", []),
                "distance_km":       r["distance_km"],
                "base_time_hrs":     r["base_time_hrs"],
                "reliability_score": r["reliability_score"],
                "composite_score":   r["composite_score"],
                "risk_score":        r["prediction"]["risk_score"],
                "delay_days":        r["prediction"]["delay_days"],
                "rank":              r["rank"],
            }
            for r in feasible[1:3]
        ],
        "blocked_routes": [
            {
                "origin":      r["origin"],
                "destination": r["destination"],
                "reason":      r.get("filtered_reason"),
            }
            for r in ranked if not r.get("is_feasible", True)
        ],
        "constraint_snapshot": {
            k: v for k, v in constraint_statuses.items()
            if v in ["restricted", "blocked"]
        },
    }


@router.post("/whatif")
async def whatif_simulation(req: WhatIfRequest):
    try:
        departure_date = datetime.strptime(req.departure_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "departure_date must be YYYY-MM-DD")

    constraint_statuses = get_constraint_statuses()

    from app.core.database import supabase
    current_res   = supabase.table("routes").select("*").eq(
        "id", req.current_route_id
    ).execute()
    alternate_res = supabase.table("routes").select("*").eq(
        "id", req.alternate_route_id
    ).execute()

    if not current_res.data or not alternate_res.data:
        raise HTTPException(404, "One or both route IDs not found")

    current_route   = current_res.data[0]
    alternate_route = alternate_res.data[0]

    from app.engine.decision_engine import score_route
    current_scored   = score_route(current_route,   departure_date, constraint_statuses)
    alternate_scored = score_route(alternate_route, departure_date, constraint_statuses)

    current_pred   = current_scored["prediction"]
    alternate_pred = alternate_scored["prediction"]

    risk_delta  = round(alternate_pred["risk_score"] - current_pred["risk_score"], 4)
    delay_delta = round(alternate_pred["delay_days"] - current_pred["delay_days"], 2)

    prompt = f"""You are a maritime logistics analyst comparing two shipping routes.

Current route: {current_route['origin']} → {current_route['destination']}
  via: {' → '.join(current_route.get('waypoints', []))}
  Risk score: {current_pred['risk_score']:.0%}
  Predicted delay: {current_pred['delay_days']:.1f} days

Alternate route: {alternate_route['origin']} → {alternate_route['destination']}
  via: {' → '.join(alternate_route.get('waypoints', []))}
  Risk score: {alternate_pred['risk_score']:.0%}
  Predicted delay: {alternate_pred['delay_days']:.1f} days

Risk change: {'improves by' if risk_delta < 0 else 'worsens by'} {abs(risk_delta):.0%}
Delay change: {'reduces by' if delay_delta < 0 else 'increases by'} {abs(delay_delta):.1f} days

Write 2-3 sentences explaining what switching routes means for this shipment.
Be specific about the maritime regions and constraints involved.
Give a clear recommendation."""

    try:
        client     = genai.Client(api_key=GEMINI_API_KEY)
        response   = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        comparison = response.text.strip()
    except Exception:
        comparison = (
            f"Switching to the alternate route "
            f"{'reduces' if risk_delta < 0 else 'increases'} delay risk by "
            f"{abs(risk_delta):.0%} and "
            f"{'reduces' if delay_delta < 0 else 'increases'} predicted delay by "
            f"{abs(delay_delta):.1f} days."
        )

    return {
        "current_route": {
            "route_id":   req.current_route_id,
            "waypoints":  current_route.get("waypoints", []),
            "risk_score": current_pred["risk_score"],
            "delay_days": current_pred["delay_days"],
            "status":     current_pred["status"],
        },
        "alternate_route": {
            "route_id":   req.alternate_route_id,
            "waypoints":  alternate_route.get("waypoints", []),
            "risk_score": alternate_pred["risk_score"],
            "delay_days": alternate_pred["delay_days"],
            "status":     alternate_pred["status"],
        },
        "delta": {
            "risk_change":       risk_delta,
            "delay_change_days": delay_delta,
            "recommendation":    "switch" if risk_delta < 0 else "keep_current",
        },
        "gemini_comparison": comparison,
    }