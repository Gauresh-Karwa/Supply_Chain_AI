"""
Filters routes based on geopolitical and environmental constraints.
Blocked routes are removed. Restricted routes are penalised.
Fallback mode: if zero feasible routes exist, returns least-bad
blocked routes with a warning — never leaves user with a dead end.
"""
from app.core.database import supabase


def get_constraint_statuses() -> dict:
    result = supabase.table("constraints_table").select(
        "region_id, status"
    ).execute()
    return {row["region_id"]: row["status"] for row in result.data}


def get_feasible_routes(origin: str, destination: str,
                        constraint_statuses: dict) -> list:
    result = supabase.table("routes").select("*").eq(
        "origin", origin
    ).eq("destination", destination).execute()

    routes   = result.data
    feasible = []
    blocked  = []

    for route in routes:
        passes_through = route.get("passes_through", [])

        has_blocked = any(
            constraint_statuses.get(r) == "blocked"
            for r in passes_through
        )

        if has_blocked:
            # Count how many blocked regions — used for fallback penalty
            n_blocked = sum(
                1 for r in passes_through
                if constraint_statuses.get(r) == "blocked"
            )
            route["filtered_reason"] = "blocked_region"
            route["is_feasible"]     = False
            route["n_blocked"]       = n_blocked
            # Still penalise reliability and cost for scoring in fallback
            route["reliability_score"] = round(
                route["reliability_score"] * 0.3, 3
            )
            route["cost_estimate"] = round(
                route["cost_estimate"] * 2.5, 3
            )
            blocked.append(route)
            continue

        # Restricted region penalty
        n_restricted = sum(
            1 for r in passes_through
            if constraint_statuses.get(r) == "restricted"
        )
        if n_restricted > 0:
            route["reliability_score"] = round(
                route["reliability_score"] * (1 - 0.15 * n_restricted), 3
            )
            route["cost_estimate"] = round(
                route["cost_estimate"] * (1 + 0.20 * n_restricted), 3
            )
            route["penalty_applied"] = True
        else:
            route["penalty_applied"] = False

        route["is_feasible"]     = True
        route["filtered_reason"] = None
        feasible.append(route)

    # ── Fallback mode ─────────────────────────────────────────────────
    # If ALL routes are blocked, return least-bad blocked routes
    # with a critical warning rather than an empty result.
    # Production heads need a recommendation, not a dead end.
    if not feasible and blocked:
        # Sort blocked routes by number of blocked regions (fewest first)
        blocked.sort(key=lambda r: r.get("n_blocked", 99))
        for route in blocked:
            route["is_feasible"]    = True   # override for scoring
            route["fallback_mode"]  = True
            route["warning"]        = (
                "No fully safe routes available. "
                "This route passes through a blocked maritime region. "
                "Proceed with extreme caution and seek operational approval."
            )
        return blocked

    # Normal mode — return feasible + blocked (blocked shown as unavailable)
    return feasible + blocked