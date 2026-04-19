from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.core.database import supabase
from app.engine.inventory_engine import compute_inventory_alerts

router = APIRouter(prefix="/inventory", tags=["Inventory"])


class InventoryItemCreate(BaseModel):
    user_label: str
    sku: Optional[str] = ""
    current_stock_units: float
    daily_consumption: float
    linked_shipment_id: Optional[str] = None
    incoming_quantity: float = 0
    reorder_point: float = 0
    unit_cost_usd: Optional[float] = 0


class InventoryItemUpdate(BaseModel):
    user_label: Optional[str] = None
    current_stock_units: Optional[float] = None
    daily_consumption: Optional[float] = None
    linked_shipment_id: Optional[str] = None
    incoming_quantity: Optional[float] = None
    reorder_point: Optional[float] = None
    unit_cost_usd: Optional[float] = None


@router.get("/items")
async def list_items():
    try:
        result = supabase.table("inventory_items").select("*").order(
            "created_at", desc=True
        ).execute()
        if result.data:
            return {"items": result.data}
    except Exception as e:
        print(f"[inventory] Fallback to demo ledger. DB error: {e}")
        
    # DB empty / RLS blocked — serve in-memory demo inventory
    from app.core.demo_ledger import get_demo_inventory
    return {"items": get_demo_inventory(), "_source": "demo"}


@router.post("/items")
async def create_item(body: InventoryItemCreate):
    data = body.model_dump()
    data["created_at"] = datetime.utcnow().isoformat()
    data["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("inventory_items").insert(data).execute()
    # Immediately compute alerts for the new item
    compute_inventory_alerts()
    return result.data[0]


@router.patch("/items/{item_id}")
async def update_item(item_id: str, body: InventoryItemUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("inventory_items").update(updates).eq("id", item_id).execute()
    if not result.data:
        raise HTTPException(404, "Item not found")
    compute_inventory_alerts()
    return result.data[0]


@router.delete("/items/{item_id}")
async def delete_item(item_id: str):
    supabase.table("inventory_items").delete().eq("id", item_id).execute()
    # Resolve related alerts
    supabase.table("inventory_alerts").update({"resolved": True}).eq(
        "inventory_item_id", item_id
    ).execute()
    return {"message": "Deleted"}


@router.get("/alerts")
async def list_alerts():
    result = supabase.table("inventory_alerts").select("*").eq(
        "resolved", False
    ).order("created_at", desc=True).execute()
    return {"alerts": result.data}


@router.post("/alerts/refresh")
async def refresh_alerts():
    compute_inventory_alerts()
    result = supabase.table("inventory_alerts").select("*").eq(
        "resolved", False
    ).order("created_at", desc=True).execute()
    return {"message": "Alerts recomputed", "alerts": result.data}
