from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.core.database import supabase

router = APIRouter(prefix="/cost-analysis", tags=["Cost Analysis"])

class CostAnalysisCreate(BaseModel):
    analysis_title: Optional[str] = "Untitled Analysis"
    company_name: Optional[str] = "Internal Fleet"
    shipment_id: str
    origin: str
    destination: str
    current_route_id: Optional[str] = None
    recommended_route_id: Optional[str] = None
    cargo_value_usd: float
    daily_demurrage_usd: float
    penalty_rate_pct: float
    holding_rate_pct: float
    delay_days_avoided: float
    total_savings_usd: float
    co2_delta_tonnes: float

@router.get("")
async def list_analyses():
    result = supabase.table("cost_analyses").select("*").order(
        "created_at", desc=True
    ).execute()
    return {"analyses": result.data, "count": len(result.data)}

@router.post("")
async def create_analysis(body: CostAnalysisCreate):
    data = body.model_dump()
    data["created_at"] = datetime.utcnow().isoformat()
    result = supabase.table("cost_analyses").insert(data).execute()
    return result.data[0]

@router.delete("/{analysis_id}")
async def delete_analysis(analysis_id: str):
    result = supabase.table("cost_analyses").delete().eq("id", analysis_id).execute()
    if not result.data:
        raise HTTPException(404, "Analysis not found")
    return {"message": "Deleted", "id": analysis_id}

