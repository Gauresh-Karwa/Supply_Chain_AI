"""
In-memory demo shipments loaded at backend startup.
Served as a fallback when the Supabase DB returns zero rows
(typically because RLS is active and the anon key carries no user session).

The ML decision engine is used to generate realistic risk scores at startup.
If the engine is unavailable, a static pre-computed dataset is used.
"""
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any

_DEMO_SHIPMENTS: List[Dict[str, Any]] = []

# (origin, destination, dep_days_offset, static_risk, static_delay, static_status)
_RAW_ROUTES = [
    ("Shanghai",    "Rotterdam",    -45, 0.78, 4.2, "delayed"),
    ("Shanghai",    "Rotterdam",    -20, 0.52, 1.8, "at_risk"),
    ("Mumbai",      "Rotterdam",    -35, 0.35, 0.0, "on_time"),
    ("Mumbai",      "Dubai",        -10, 0.82, 5.1, "delayed"),
    ("Mumbai",      "Dubai",        -25, 0.44, 1.2, "at_risk"),
    ("Singapore",   "Rotterdam",    -30, 0.61, 2.5, "at_risk"),
    ("Singapore",   "Dubai",        -15, 0.28, 0.0, "on_time"),
    ("Busan",       "Rotterdam",    -40, 0.73, 3.8, "delayed"),
    ("Shanghai",    "Dubai",        -22, 0.39, 0.5, "on_time"),
    ("Shanghai",    "Hamburg",      -50, 0.67, 2.9, "at_risk"),
    ("Colombo",     "Rotterdam",    -28, 0.81, 5.6, "delayed"),
    ("Colombo",     "Dubai",        -12, 0.33, 0.0, "on_time"),
    ("Karachi",     "Rotterdam",    -38, 0.55, 2.1, "at_risk"),
    ("Karachi",     "Dubai",        -18, 0.48, 1.5, "at_risk"),
    ("Dubai",       "Rotterdam",    -42, 0.76, 4.0, "delayed"),
    ("Mumbai",      "Singapore",     -8, 0.22, 0.0, "on_time"),
    ("Shanghai",    "Singapore",     -5, 0.41, 0.8, "on_time"),
    ("Busan",       "Singapore",    -32, 0.63, 2.7, "at_risk"),
    ("Djibouti",    "Rotterdam",    -55, 0.85, 7.2, "delayed"),
    ("Hamburg",     "Piraeus",      -14, 0.18, 0.0, "on_time"),
    ("Los_Angeles", "New_York",     -60, 0.36, 0.0, "on_time"),
    ("Los_Angeles", "New_York",     -25, 0.71, 3.4, "delayed"),
    ("Santos",      "Rotterdam",    -70, 0.42, 0.9, "on_time"),
    ("Sydney",      "Los_Angeles",  -80, 0.58, 2.0, "at_risk"),
    ("Melbourne",   "Singapore",    -45, 0.29, 0.0, "on_time"),
]


def _make_id(i: int, origin: str, dest: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"demo-v3-{i}-{origin}-{dest}"))


def _static_dataset() -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    return [
        {
            "id":                   _make_id(i, o, d),
            "origin":               o,
            "destination":          d,
            "departure_time":       (now + timedelta(days=off)).isoformat(),
            "transport_mode":       "sea",
            "status":               status,
            "risk_score":           risk,
            "predicted_delay_days": delay,
            "anomaly_flag":         risk >= 0.70,
            "updated_at":           now.isoformat(),
            "company_id":           None,
            "created_by":           None,
        }
        for i, (o, d, off, risk, delay, status) in enumerate(_RAW_ROUTES)
    ]


def _ml_scored_dataset() -> List[Dict[str, Any]]:
    """Use the actual constraint + decision engine for real risk scores."""
    from app.engine.decision_engine import score_route
    from app.engine.constraint_engine import get_constraint_statuses, get_feasible_routes

    constraints = get_constraint_statuses()
    now = datetime.utcnow()
    results: List[Dict[str, Any]] = []

    for i, (origin, dest, offset, s_risk, s_delay, _) in enumerate(_RAW_ROUTES):
        dep_dt = now + timedelta(days=offset)
        risk, delay, status = s_risk, s_delay, _

        try:
            routes = get_feasible_routes(origin, dest, constraints)
            if routes:
                scored = score_route(routes[0], dep_dt, constraints)
                pred  = scored.get("prediction", {})
                risk  = round(float(pred.get("risk_score", s_risk)), 3)
                delay = round(float(pred.get("delay_days", s_delay)), 1)
                status = (
                    "delayed" if risk >= 0.70
                    else "at_risk" if risk >= 0.45
                    else "on_time"
                )
        except Exception:
            pass  # keep static values

        results.append({
            "id":                   _make_id(i, origin, dest),
            "origin":               origin,
            "destination":          dest,
            "departure_time":       dep_dt.isoformat(),
            "transport_mode":       "sea",
            "status":               status,
            "risk_score":           risk,
            "predicted_delay_days": delay,
            "anomaly_flag":         risk >= 0.70,
            "updated_at":           now.isoformat(),
            "company_id":           None,
            "created_by":           None,
        })

    return results


def init_demo_shipments() -> None:
    """Call once at app startup to pre-compute demo data."""
    global _DEMO_SHIPMENTS
    try:
        _DEMO_SHIPMENTS = _ml_scored_dataset()
        high = sum(1 for s in _DEMO_SHIPMENTS if s["risk_score"] >= 0.70)
        print(f"[demo] {len(_DEMO_SHIPMENTS)} ML-scored demo shipments ready ({high} high-risk)")
    except Exception as exc:
        print(f"[demo] ML scoring unavailable ({exc}) – using static demo data")
        _DEMO_SHIPMENTS = _static_dataset()


def get_demo_shipments() -> List[Dict[str, Any]]:
    """Return the cached demo shipments (or regenerate if empty)."""
    if not _DEMO_SHIPMENTS:
        init_demo_shipments()
    return _DEMO_SHIPMENTS
