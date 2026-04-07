from fastapi import APIRouter, HTTPException
from app.core.database import supabase

router = APIRouter(prefix="/routes", tags=["Routes"])


@router.get("")
async def list_routes():
    result = supabase.table("routes").select("*").execute()
    return {"routes": result.data, "count": len(result.data)}


@router.get("/{origin}/{destination}")
async def get_routes_for_pair(origin: str, destination: str):
    result = supabase.table("routes").select("*").eq(
        "origin", origin
    ).eq("destination", destination).execute()
    if not result.data:
        raise HTTPException(404, f"No routes found: {origin} → {destination}")
    return {"routes": result.data, "count": len(result.data)}