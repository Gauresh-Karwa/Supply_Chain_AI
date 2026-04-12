from datetime import datetime, timedelta
from app.core.database import supabase


def compute_inventory_alerts():
    """Recompute all inventory alerts based on current shipment predictions.
    Called by the scheduler every 15 minutes after risk refresh."""

    print(f"[inventory] Running alert computation at {datetime.utcnow().isoformat()}")

    # Fetch all inventory items
    items_res = supabase.table("inventory_items").select("*").execute()
    items = items_res.data

    if not items:
        print("[inventory] No inventory items registered.")
        return

    # Fetch all active shipments (already have predicted_delay_days)
    ship_res = supabase.table("shipments").select("*").neq("status", "delivered").execute()
    shipments_by_id = {s["id"]: s for s in ship_res.data}

    resolved_old = []
    new_alerts = []

    for item in items:
        item_id = item["id"]
        linked_ship_id = item.get("linked_shipment_id")
        current_stock = float(item.get("current_stock_units") or 0)
        daily_consumption = float(item.get("daily_consumption") or 1)
        incoming_qty = float(item.get("incoming_quantity") or 0)
        reorder_point = float(item.get("reorder_point") or 0)

        # Days until stockout (how long current stock lasts)
        days_until_stockout = current_stock / daily_consumption if daily_consumption > 0 else 9999

        # Find linked shipment
        shipment = shipments_by_id.get(linked_ship_id) if linked_ship_id else None

        if not shipment:
            # No linked shipment — just check if stock is low
            if days_until_stockout < 7:
                new_alerts.append({
                    "inventory_item_id": item_id,
                    "alert_type": "low_stock_no_shipment",
                    "days_until_stockout": round(days_until_stockout, 1),
                    "days_until_arrival": None,
                    "buffer_days": None,
                    "shipment_risk_score": None,
                    "message": (
                        f"Item \"{item.get('user_label', item_id)}\" has only "
                        f"{days_until_stockout:.1f} days of stock remaining with no linked inbound shipment."
                    ),
                    "resolved": False,
                    "created_at": datetime.utcnow().isoformat()
                })
            continue

        # Calculate days until shipment arrival
        departure_time_str = shipment.get("departure_time", datetime.utcnow().isoformat())
        try:
            departure = datetime.fromisoformat(departure_time_str)
        except Exception:
            departure = datetime.utcnow()

        base_time_days = 0  # We don't have route directly, use predicted delay as proxy
        predicted_delay = float(shipment.get("predicted_delay_days") or 0)
        risk_score = float(shipment.get("risk_score") or 0)

        # Arrival = departure + base_transit + delay
        # We estimate base transit from departure vs now as a proxy
        elapsed_days = max(0, (datetime.utcnow() - departure).total_seconds() / 86400)
        # Rough estimate: assume average 20-day transit, minus elapsed
        estimated_remaining_transit = max(0, 20 - elapsed_days)
        days_until_arrival = estimated_remaining_transit + predicted_delay

        # Buffer = how much time we have AFTER stock runs out before ship arrives
        buffer_days = days_until_stockout - days_until_arrival

        # Determine alert type
        if buffer_days < 0:
            alert_type = "stockout_risk"
            message = (
                f"CRITICAL: \"{item.get('user_label', 'Item')}\" (SKU: {item.get('sku', 'N/A')}) "
                f"will stock out in {days_until_stockout:.1f} days, but the supply shipment "
                f"is estimated to arrive in {days_until_arrival:.1f} days. "
                f"You are {abs(buffer_days):.1f} days short. "
                f"Linked vessel has a {risk_score*100:.0f}% risk score. Place an emergency order immediately."
            )
        elif buffer_days < 3:
            alert_type = "low_buffer"
            message = (
                f"WARNING: \"{item.get('user_label', 'Item')}\" has only {buffer_days:.1f} days "
                f"of buffer between stock depletion and shipment arrival. "
                f"Predicted delay is {predicted_delay:.1f} days on the linked vessel. Monitor closely."
            )
        else:
            alert_type = "safe"
            message = (
                f"\"{item.get('user_label', 'Item')}\" is safe. "
                f"{buffer_days:.1f} days of buffer before stockout risk."
            )

        new_alerts.append({
            "inventory_item_id": item_id,
            "alert_type": alert_type,
            "days_until_stockout": round(days_until_stockout, 1),
            "days_until_arrival": round(days_until_arrival, 1),
            "buffer_days": round(buffer_days, 1),
            "shipment_risk_score": round(risk_score, 3),
            "message": message,
            "resolved": False,
            "created_at": datetime.utcnow().isoformat()
        })
        resolved_old.append(item_id)

    # Mark old alerts as resolved for these items
    if resolved_old:
        supabase.table("inventory_alerts")\
            .update({"resolved": True})\
            .in_("inventory_item_id", resolved_old)\
            .eq("resolved", False)\
            .execute()

    # Insert new alerts
    if new_alerts:
        supabase.table("inventory_alerts").insert(new_alerts).execute()

    print(f"[inventory] Generated {len(new_alerts)} alerts for {len(items)} items.")
