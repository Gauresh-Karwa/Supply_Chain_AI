from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.core.database import supabase

router = APIRouter(prefix="/shipments", tags=["Shipments"])


class ShipmentCreate(BaseModel):
    origin:         str
    destination:    str
    departure_time: str
    transport_mode: str = "sea"


@router.get("")
async def list_shipments():
    result = supabase.table("shipments").select("*").order(
        "updated_at", desc=True
    ).execute()
    return {"shipments": result.data, "count": len(result.data)}


@router.get("/{shipment_id}")
async def get_shipment(shipment_id: str):
    result = supabase.table("shipments").select("*").eq(
        "id", shipment_id
    ).execute()
    if not result.data:
        raise HTTPException(404, "Shipment not found")
    return result.data[0]


@router.post("")
async def create_shipment(body: ShipmentCreate):
    data = {
        "origin":         body.origin,
        "destination":    body.destination,
        "departure_time": body.departure_time,
        "transport_mode": body.transport_mode,
        "status":         "on_time",
        "risk_score":     0.0,
        "predicted_delay_days": 0.0,
        "anomaly_flag":   False,
        "updated_at":     datetime.utcnow().isoformat(),
    }
    result = supabase.table("shipments").insert(data).execute()
    return result.data[0]