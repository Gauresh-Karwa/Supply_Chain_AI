"""
POST /scenarios/simulate  — Global Strategic Scenario Engine
Runs the constraint + decision engine across the entire active fleet
and returns fleet-level exposure metrics plus a Gemini executive brief.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from google import genai

from app.core.database import supabase
from app.core.config import GEMINI_API_KEY
from app.engine.constraint_engine import get_constraint_statuses, get_feasible_routes
from app.engine.decision_engine import score_route

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

# ── Known route name labels ────────────────────────────────────────────────────
ROUTE_LABELS: dict[str, str] = {
    "suez_canal":        "via Suez Canal",
    "bab_el_mandeb":     "via Bab-el-Mandeb",
    "cape_of_good_hope": "via Cape of Good Hope",
    "hormuz_strait":     "via Strait of Hormuz",
    "malacca_strait":    "via Strait of Malacca",
    "taiwan_strait":     "via Taiwan Strait",
    "south_china_sea":   "via South China Sea",
    "panama_canal":      "via Panama Canal",
    "english_channel":   "via English Channel",
    "bosphorus_strait":  "via Bosphorus Strait",
}

DEFAULT_CARGO_VALUE_USD = 15_000_000  # per vessel if no cost analysis
DEFAULT_DEMURRAGE_RATE  = 25_000      # USD/day per affected vessel


class SimulateRequest(BaseModel):
    blocked_regions:    list[str] = []
    restricted_regions: list[str] = []
    scenario_name:      str = "Custom Scenario"
    save_simulation:    bool = False


def _route_label(waypoints: list[str]) -> str:
    """Derive a human-readable route name from its waypoint list."""
    key_map = {
        "Suez_Canal":        "via Suez Canal",
        "Cape_of_Good_Hope": "via Cape of Good Hope",
        "Hormuz_Strait":     "via Strait of Hormuz",
        "Malacca_Strait":    "via Strait of Malacca",
        "Taiwan_Strait":     "via Taiwan Strait",
        "Bab_el_Mandeb":     "via Bab-el-Mandeb",
        "Panama_Canal":      "via Panama Canal",
        "English_Channel":   "via English Channel",
        "Bosphorus_Strait":  "via Bosphorus Strait",
    }
    for wp in waypoints:
        if wp in key_map:
            return key_map[wp]
    if waypoints:
        return f"via {waypoints[0].replace('_', ' ')}"
    return "Direct route"


def _build_scenario_constraints(
    base_statuses: dict,
    blocked_regions: list[str],
    restricted_regions: list[str],
) -> dict:
    """Overlay scenario blocks/restrictions on top of real-world constraints."""
    merged = dict(base_statuses)
    for r in restricted_regions:
        merged[r] = "restricted"
    for r in blocked_regions:
        merged[r] = "blocked"   # blocked always wins
    return merged


def _co2(route: dict) -> float:
    dist = route.get("distance_km", 0)
    teu = 18000 if dist > 15000 else (12000 if dist > 8000 else 8000)
    return round(dist * teu * 0.000016, 2)


def _build_gemini_prompt(
    scenario_name: str,
    affected_count: int,
    exposed_count: int,
    reroutable_count: int,
    total_count: int,
    total_value: float,
    daily_loss: float,
    avg_delay: float,
    top_vessels: list[dict],
) -> str:
    vessel_lines = []
    for v in top_vessels[:3]:
        vessel_lines.append(
            f"  - {v['origin']} → {v['destination']}: "
            f"{v['current_route']} → {v['recommended_route']} "
            f"(+{v['delay_added_days']:.1f} days, "
            f"cost impact ${v['cost_impact_usd']:,.0f})"
        )
    vessels_str = "\n".join(vessel_lines) if vessel_lines else "  - No critical vessels identified."

    return f"""You are the Chief Risk Officer at a major global shipping company.
A crisis has just occurred: {scenario_name}.

Current fleet exposure:
- {affected_count} vessels affected out of {total_count} active
- {exposed_count} vessels have no safe alternative route
- {reroutable_count} vessels can be rerouted
- Total cargo value at risk: ${total_value / 1_000_000:.1f}M
- Estimated daily financial loss: ${daily_loss / 1_000:.0f}k
- Average rerouting delay: {avg_delay:.1f} days

Most critical vessels:
{vessels_str}

Write a point-wise executive advisory brief:
1. Situation summary (what happened, scale of impact)
2. Immediate financial exposure
3. Three specific recommended actions in priority order
4. One strategic consideration for the next 48 hours

Write for a CEO audience. Be specific, not generic.
Use the vessel and route data above.
Please format the entire response using clear and concise bullet points. Provide the answer in valid markdown format.
"""

@router.post("/simulate")
async def simulate_scenario(req: SimulateRequest):
    try:
        # ── 1. Fetch all active shipments ──────────────────────────────────────
        shipments_res = supabase.table("shipments").select("*").execute()
        shipments = [s for s in shipments_res.data
                     if s.get("status") not in ("delivered",)]

        if not shipments:
            return {
                "scenario_name":      req.scenario_name,
                "affected_count":     0,
                "reroutable_count":   0,
                "exposed_count":      0,
                "unaffected_count":   0,
                "total_value_at_risk_usd": 0,
                "daily_loss_rate_usd": 0,
                "avg_delay_days":     0,
                "affected_vessels":   [],
                "exposed_vessels":    [],
                "gemini_brief":       "No active shipments found in the fleet.",
            }

        # ── 2. Build scenario constraint overlay ───────────────────────────────
        base_constraints = get_constraint_statuses()
        scenario_constraints = _build_scenario_constraints(
            base_constraints, req.blocked_regions, req.restricted_regions
        )

        # ── 3. Fetch all routes once (avoids N+1 queries) ─────────────────────
        routes_res = supabase.table("routes").select("*").execute()
        all_routes = routes_res.data

        def get_routes_for_pair(origin: str, dest: str) -> list[dict]:
            return [r for r in all_routes
                    if r["origin"] == origin and r["destination"] == dest]

        # ── 4. Evaluate each shipment ──────────────────────────────────────────
        departure_date = datetime.utcnow()
        affected_vessels  = []
        exposed_vessels   = []
        unaffected_count  = 0

        for ship in shipments:
            origin = ship["origin"]
            dest   = ship["destination"]
            routes = get_routes_for_pair(origin, dest)

            if not routes:
                unaffected_count += 1
                continue

            # Determine which route the shipment is currently on:
            # use base constraints to identify the "current" best route
            base_feasible = [
                r for r in routes
                if not any(
                    base_constraints.get(reg) == "blocked"
                    for reg in r.get("passes_through", [])
                )
            ]
            current_route = base_feasible[0] if base_feasible else routes[0]
            current_route_label = _route_label(current_route.get("waypoints", []))

            # Check if this shipment is affected by the scenario
            current_passes = current_route.get("passes_through", [])
            is_affected = any(
                reg in req.blocked_regions or reg in req.restricted_regions
                for reg in current_passes
            )

            if not is_affected:
                # Also check if any route for this pair is blocked (might trap it)
                all_affected = all(
                    any(
                        scenario_constraints.get(reg) == "blocked"
                        for reg in r.get("passes_through", [])
                    )
                    for r in routes
                )
                if not all_affected:
                    unaffected_count += 1
                    continue

            # ── Run scenario constraint engine for this shipment ───────────────
            scenario_feasible = []
            scenario_blocked  = []

            for route in routes:
                passes = route.get("passes_through", [])
                has_blocked = any(
                    scenario_constraints.get(r) == "blocked" for r in passes
                )
                if has_blocked:
                    scenario_blocked.append(route)
                else:
                    scenario_feasible.append(route)

            # ── Score feasible routes via decision engine ──────────────────────
            if scenario_feasible:
                scored = []
                for r in scenario_feasible:
                    try:
                        sr = score_route(r, departure_date, scenario_constraints)
                        scored.append(sr)
                    except Exception:
                        scored.append(r)

                scored.sort(
                    key=lambda x: x.get("composite_score", x.get("reliability_score", 0))
                )
                best_alt = scored[0]
                alt_label = _route_label(best_alt.get("waypoints", []))

                # Delay added = difference in base_time_hrs converted to days
                base_days = current_route.get("base_time_hrs", 0) / 24
                alt_days  = best_alt.get("base_time_hrs", 0) / 24
                delay_added = max(0, round(alt_days - base_days, 1))

                # CO2 delta
                co2_delta = round(
                    _co2(best_alt) - _co2(current_route), 2
                )

                # Cost impact: delay × demurrage rate
                cost_impact = round(delay_added * DEFAULT_DEMURRAGE_RATE, 0)

                vessel_entry = {
                    "shipment_id":        ship["id"],
                    "origin":             origin,
                    "destination":        dest,
                    "current_route":      current_route_label,
                    "recommended_route":  alt_label,
                    "delay_added_days":   delay_added,
                    "cost_impact_usd":    cost_impact,
                    "co2_delta_tonnes":   co2_delta,
                    "risk_score":         ship.get("risk_score", 0),
                    "status":             "reroutable",
                }
                affected_vessels.append(vessel_entry)

            else:
                # All routes blocked — vessel is EXPOSED
                vessel_entry = {
                    "shipment_id":       ship["id"],
                    "origin":            origin,
                    "destination":       dest,
                    "current_route":     current_route_label,
                    "recommended_route": "No safe route available",
                    "delay_added_days":  0,
                    "cost_impact_usd":   DEFAULT_DEMURRAGE_RATE * 14,  # 2-week estimate
                    "co2_delta_tonnes":  0,
                    "risk_score":        ship.get("risk_score", 1.0),
                    "status":            "exposed",
                }
                exposed_vessels.append(vessel_entry)

        # ── 5. Aggregate fleet metrics ─────────────────────────────────────────
        all_affected  = affected_vessels + exposed_vessels
        affected_count  = len(all_affected)
        reroutable_count = len(affected_vessels)
        exposed_count   = len(exposed_vessels)

        total_value = affected_count * DEFAULT_CARGO_VALUE_USD
        daily_loss  = affected_count * DEFAULT_DEMURRAGE_RATE

        delays = [v["delay_added_days"] for v in affected_vessels if v["delay_added_days"] > 0]
        avg_delay = round(sum(delays) / len(delays), 1) if delays else 0.0

        total_count = len(shipments)

        # Sort by cost impact (highest first) for advisory
        top_vessels = sorted(
            all_affected,
            key=lambda v: v["cost_impact_usd"],
            reverse=True
        )

        # ── 6. Gemini executive brief ──────────────────────────────────────────
        gemini_brief = ""
        if affected_count > 0:
            prompt = _build_gemini_prompt(
                scenario_name    = req.scenario_name,
                affected_count   = affected_count,
                exposed_count    = exposed_count,
                reroutable_count = reroutable_count,
                total_count      = total_count,
                total_value      = total_value,
                daily_loss       = daily_loss,
                avg_delay        = avg_delay,
                top_vessels      = top_vessels,
            )
            try:
                client   = genai.Client(api_key=GEMINI_API_KEY)
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                )
                gemini_brief = response.text.strip()
            except Exception as e:
                print(f"[scenarios] Gemini error: {e}")
                gemini_brief = (
                    f"Crisis assessment: {req.scenario_name} has placed {affected_count} vessels "
                    f"at operational risk, with {exposed_count} exposed to complete route blockage. "
                    f"Estimated fleet cargo value at risk stands at ${total_value / 1_000_000:.1f}M "
                    f"with a daily loss rate of ${daily_loss / 1_000:.0f}k. "
                    f"Immediate actions: (1) Reroute {reroutable_count} vessels via alternative corridors, "
                    f"(2) Issue force majeure notices for {exposed_count} exposed vessels, "
                    f"(3) Activate contingency contracts with alternative carriers. "
                    f"Strategic consideration: Monitor the situation for 48 hours before committing to "
                    f"full fleet rerouting, as resolution may negate the need for costly diversions."
                )
        else:
            gemini_brief = (
                f"Scenario assessment complete: {req.scenario_name} does not currently affect any "
                f"active fleet vessels. All {total_count} shipments are on unaffected routes. "
                f"Continue normal monitoring."
            )

        # ── 7. Optional save to Supabase ───────────────────────────────────────
        if req.save_simulation:
            try:
                supabase.table("scenario_simulations").insert({
                    "scenario_name":          req.scenario_name,
                    "blocked_regions":        req.blocked_regions,
                    "restricted_regions":     req.restricted_regions,
                    "affected_count":         affected_count,
                    "exposed_count":          exposed_count,
                    "total_value_at_risk_usd": total_value,
                    "daily_loss_rate_usd":    daily_loss,
                    "gemini_brief":           gemini_brief,
                    "created_at":             datetime.utcnow().isoformat(),
                }).execute()
            except Exception as e:
                print(f"[scenarios] Save error (non-fatal): {e}")

        return {
            "scenario_name":          req.scenario_name,
            "affected_count":         affected_count,
            "reroutable_count":       reroutable_count,
            "exposed_count":          exposed_count,
            "unaffected_count":       unaffected_count,
            "total_value_at_risk_usd": total_value,
            "daily_loss_rate_usd":    daily_loss,
            "avg_delay_days":         avg_delay,
            "affected_vessels":       affected_vessels,
            "exposed_vessels":        exposed_vessels,
            "gemini_brief":           gemini_brief,
        }
    except Exception as e:
        print(f"[scenarios] Simulation crash: {e}")
        raise HTTPException(status_code=500, detail=str(e))
