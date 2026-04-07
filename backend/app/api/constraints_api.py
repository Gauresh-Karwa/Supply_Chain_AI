from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.database import supabase
from datetime import datetime

router = APIRouter(prefix="/constraints", tags=["Constraints"])


class ConstraintUpdate(BaseModel):
    status: str  # open / restricted / blocked


@router.get("")
async def list_constraints():
    result = supabase.table("constraints_table").select("*").execute()
    return {"constraints": result.data}


@router.put("/{region_id}")
async def update_constraint(region_id: str, body: ConstraintUpdate):

    if body.status not in ["open", "restricted", "blocked"]:
        raise HTTPException(400, "status must be open, restricted, or blocked")

    result = supabase.table("constraints_table").update({
        "status":     body.status,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("region_id", region_id).execute()

    if not result.data:
        raise HTTPException(404, f"Region {region_id} not found")

    return {
        "region_id": region_id,
        "new_status": body.status,
        "message": f"{region_id} updated to {body.status}"
    }