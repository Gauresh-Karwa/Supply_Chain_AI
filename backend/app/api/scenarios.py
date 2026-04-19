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
    total_value_usd: float,
    daily_loss_usd: float,
    avg_delay: float,
    routes_summary: str,
) -> str:
    return f"""You are the Chief Risk Officer of a Fortune 500 maritime logistics firm. Write a concise executive advisory brief.

Crisis: {scenario_name}
Fleet impact: {affected_count} of {total_count} vessels affected — {exposed_count} with no safe route, {reroutable_count} reroutable
Cargo value at risk: ${total_value_usd:,.0f}
Daily financial loss: ${daily_loss_usd:,.0f}
Average rerouting delay: {avg_delay:.1f} days
Top impacted routes: {routes_summary}

Output format — write EXACTLY these four labelled sections with NO markdown, NO hashtags, NO asterisks, NO emojis:

SITUATION
Two sentences maximum. State the crisis, the scale of fleet exposure, and the immediate financial figure.

KEY RISKS
Three bullet points, each one sentence. Identify the geopolitical or environmental causes, the most vulnerable route corridors, and the highest-exposure cargo type.

IMMEDIATE ACTIONS
Three numbered actions. Each must be one sentence starting with an imperative verb, with a concrete timeframe (e.g. within 24 hours, within 72 hours).

FINANCIAL EXPOSURE
Two sentences. Give a specific cost range for a 7-day and 14-day crisis duration, referencing demurrage rates. Use dollar figures.

Write in formal, board-level prose. No placeholders. No filler language."""


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

                # In the affected vessel cost calculation — replace flat $18,000/day with cargo-specific rate
                daily_cost = ship.get('daily_delay_cost_usd') or 18000
                cost_impact = round(delay_added * daily_cost, 0)
                cargo_value = ship.get('cargo_value_usd') or 15000000

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
                    "cargo_value_usd":    cargo_value,
                    "daily_delay_cost_usd": daily_cost,
                }
                affected_vessels.append(vessel_entry)

            else:
                daily_cost = ship.get('daily_delay_cost_usd') or 18000
                cargo_value = ship.get('cargo_value_usd') or 15000000
                # All routes blocked — vessel is EXPOSED
                vessel_entry = {
                    "shipment_id":       ship["id"],
                    "origin":            origin,
                    "destination":       dest,
                    "current_route":     current_route_label,
                    "recommended_route": "No safe route available",
                    "delay_added_days":  0,
                    "cost_impact_usd":   daily_cost * 14,  # 2-week estimate
                    "co2_delta_tonnes":  0,
                    "risk_score":        ship.get("risk_score", 1.0),
                    "status":            "exposed",
                    "cargo_value_usd":    cargo_value,
                    "daily_delay_cost_usd": daily_cost,
                }
                exposed_vessels.append(vessel_entry)

        # ── 5. Aggregate fleet metrics ─────────────────────────────────────────
        all_affected  = affected_vessels + exposed_vessels
        affected_count  = len(all_affected)
        reroutable_count = len(affected_vessels)
        exposed_count   = len(exposed_vessels)

        total_value = sum(v.get("cargo_value_usd", 15000000) for v in all_affected)
        daily_loss  = sum(v.get("daily_delay_cost_usd", 18000) for v in all_affected)

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
            # Prepare routes summary for prompt
            top_3 = top_vessels[:3]
            routes_summary = "\n".join([
                f"- {v['origin']} to {v['destination']}: ${v['cost_impact_usd']:,.0f} impact, {v['delay_added_days']}d delay"
                for v in top_3
            ])

            prompt = _build_gemini_prompt(
                scenario_name    = req.scenario_name,
                affected_count   = affected_count,
                exposed_count    = exposed_count,
                reroutable_count = reroutable_count,
                total_count      = total_count,
                total_value_usd  = total_value,
                daily_loss_usd   = daily_loss,
                avg_delay        = avg_delay,
                routes_summary   = routes_summary,
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
                gemini_brief = f"STRATEGIC ADVISORY: Crisis {req.scenario_name} has impacted {affected_count} vessels."
        else:
            gemini_brief = f"No active fleet vessels affected by {req.scenario_name}."

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

        # ── 8. Port cascade computation ────────────────────────────────────────
        def compute_port_cascade(affected: list, exposed: list) -> list:
            """
            When routes are blocked, vessels reroute to alternate paths.
            Destination ports receive increased traffic — compute congestion delta.
            """
            from collections import defaultdict

            all_ships = affected + exposed
            base_traffic     = defaultdict(int)
            rerouted_traffic = defaultdict(int)

            for v in all_ships:
                base_traffic[v["destination"]] += 1

            for v in affected:  # reroutable vessels
                rerouted_traffic[v["destination"]] += 1

            cascade_ports = []
            for port, rerouted in rerouted_traffic.items():
                base = base_traffic.get(port, 0)
                if base == 0:
                    continue
                increase_pct = round((rerouted / max(base, 1)) * 100, 0)
                if increase_pct >= 20:
                    cascade_ports.append({
                        "port":                    port,
                        "rerouted_vessels":        rerouted,
                        "congestion_increase_pct": increase_pct,
                        "alert_level":             "high" if increase_pct >= 50 else "medium",
                        "message": (
                            f"{port}: +{increase_pct:.0f}% projected congestion "
                            f"({rerouted} rerouted vessels incoming)"
                        ),
                    })

            return sorted(cascade_ports, key=lambda x: x["congestion_increase_pct"], reverse=True)

        cascade_effects = compute_port_cascade(affected_vessels, exposed_vessels)

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
            "cascade_effects":        cascade_effects,
        }
    except Exception as e:
        print(f"[scenarios] Simulation crash: {e}")
        raise HTTPException(status_code=500, detail=str(e))
