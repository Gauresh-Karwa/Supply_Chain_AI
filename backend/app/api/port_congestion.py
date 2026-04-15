from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.core.database import supabase
from app.engine.congestion_engine import generate_port_congestion

router = APIRouter(prefix="/port-congestion", tags=["Port Congestion"])


class PortOverrideCreate(BaseModel):
    port_name: str
    vessels_waiting: int
    avg_wait_hours: float
    congestion_score: float
    notes: Optional[str] = ""


@router.get("")
async def list_congestion():
    """Return current congestion data for all ports, sorted by score descending."""
    result = supabase.table("port_congestion").select("*").order(
        "congestion_score", desc=True
    ).execute()
    return {"ports": result.data, "count": len(result.data)}


@router.post("/refresh")
async def refresh_congestion():
    """Manual trigger to regenerate congestion data immediately."""
    generate_port_congestion()
    result = supabase.table("port_congestion").select("*").order(
        "congestion_score", desc=True
    ).execute()
    return {"message": "Congestion data refreshed.", "ports": result.data}


@router.post("/override")
async def override_port(body: PortOverrideCreate):
    """
    Manually override or insert a port's congestion data.
    Uses upsert on port_name so it replaces an existing entry.
    """
    data = {
        "port_name":       body.port_name,
        "vessels_waiting": body.vessels_waiting,
        "avg_wait_hours":  body.avg_wait_hours,
        "congestion_score": body.congestion_score,
        "last_updated":    datetime.utcnow().isoformat(),
        "is_manual":       True,
        "notes":           body.notes or "",
    }
    result = supabase.table("port_congestion").upsert(
        data, on_conflict="port_name"
    ).execute()
    if not result.data:
        raise HTTPException(500, "Could not save port override")
    return result.data[0]


@router.delete("/{port_name}")
async def delete_port_entry(port_name: str):
    """Delete a specific port's congestion entry by port name."""
    result = supabase.table("port_congestion").delete().eq(
        "port_name", port_name
    ).execute()
    if not result.data:
        raise HTTPException(404, f"Port '{port_name}' not found")
    return {"message": f"Deleted {port_name}"}
