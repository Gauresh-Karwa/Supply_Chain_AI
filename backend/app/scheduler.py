from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.database import supabase
from app.engine.constraint_engine import get_constraint_statuses, get_feasible_routes
from app.engine.decision_engine import score_route
from app.core.config import RISK_THRESHOLD_HIGH

scheduler = AsyncIOScheduler()


async def refresh_shipment_risks():
    """Re-score all active shipments and update Supabase."""
    print(f"[scheduler] Running risk refresh at {datetime.utcnow().isoformat()}")

    result = supabase.table("shipments").select("*").neq(
        "status", "delivered"
    ).execute()

    shipments           = result.data
    constraint_statuses = get_constraint_statuses()

    updated = 0
    for shipment in shipments:
        try:
            departure_time = datetime.fromisoformat(
                shipment.get("departure_time", datetime.utcnow().isoformat())
            )

            routes = get_feasible_routes(
                shipment["origin"],
                shipment["destination"],
                constraint_statuses
            )

            feasible = [r for r in routes if r.get("is_feasible", False)]
            if not feasible:
                continue

            # Score best feasible route
            scored     = score_route(feasible[0], departure_time, constraint_statuses)
            prediction = scored["prediction"]

            # Determine new status
            if prediction["risk_score"] >= RISK_THRESHOLD_HIGH:
                new_status = "at_risk"
            elif prediction["risk_score"] >= 0.45:
                new_status = "watch"
            else:
                new_status = "on_time"

            # Update Supabase — triggers Realtime subscription on frontend
            supabase.table("shipments").update({
                "risk_score":           prediction["risk_score"],
                "predicted_delay_days": prediction["delay_days"],
                "anomaly_flag":         prediction["top_shap"][0]["shap_value"] > 0,
                "status":               new_status,
                "updated_at":           datetime.utcnow().isoformat(),
            }).eq("id", shipment["id"]).execute()

            updated += 1

        except Exception as e:
            print(f"[scheduler] Error on shipment {shipment['id']}: {e}")

    print(f"[scheduler] Updated {updated}/{len(shipments)} shipments")

    # Phase 7: Trigger port congestion generation
    from app.engine.congestion_engine import generate_port_congestion
    generate_port_congestion()

    # Phase 8: Recompute inventory alerts using fresh delay data
    from app.engine.inventory_engine import compute_inventory_alerts
    compute_inventory_alerts()


def start_scheduler():
    scheduler.add_job(
        refresh_shipment_risks,
        trigger="interval",
        minutes=15,
        id="risk_refresh",
        replace_existing=True,
    )
    scheduler.start()
    print("[scheduler] Started — risk refresh every 15 minutes")