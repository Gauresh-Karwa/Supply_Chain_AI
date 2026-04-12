from fastapi import APIRouter
from app.core.database import supabase
from app.engine.congestion_engine import generate_port_congestion

router = APIRouter(prefix="/port-congestion", tags=["Port Congestion"])


@router.get("")
async def list_congestion():
    """Return current congestion data for all ports, newest first."""
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
