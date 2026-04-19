import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.core.database import supabase
from datetime import datetime

# Get shipment IDs to link inventory items
shipments = supabase.table("shipments").select(
    "id, origin, destination, cargo_type"
).limit(20).execute().data

# Clear existing
supabase.table("inventory_items").delete().neq(
    "id", "00000000-0000-0000-0000-000000000000"
).execute()

items = [
    {
        "user_label":            "Samsung OLED Display Panels",
        "sku":                   "ELEC-OLED-7700",
        "current_stock_units":   2400,
        "daily_consumption":     280,
        "incoming_quantity":     8000,
        "reorder_point":         800,
        "unit_cost_usd":         340,
        "cargo_type":            "electronics",
        "warehouse_location":    "Rotterdam Distribution Centre",
    },
    {
        "user_label":            "BMW Transmission Units",
        "sku":                   "AUTO-TRANS-BMW3",
        "current_stock_units":   180,
        "daily_consumption":     22,
        "incoming_quantity":     600,
        "reorder_point":         80,
        "unit_cost_usd":         4200,
        "cargo_type":            "automotive",
        "warehouse_location":    "Hamburg Automotive Hub",
    },
    {
        "user_label":            "Pfizer API (Pharmaceutical Ingredient)",
        "sku":                   "PHARMA-API-PF22",
        "current_stock_units":   850,
        "daily_consumption":     95,
        "incoming_quantity":     3000,
        "reorder_point":         300,
        "unit_cost_usd":         890,
        "cargo_type":            "pharmaceuticals",
        "warehouse_location":    "Antwerp Cold Storage Facility",
    },
    {
        "user_label":            "Industrial Hydraulic Pumps",
        "sku":                   "MACH-HYD-HP400",
        "current_stock_units":   340,
        "daily_consumption":     18,
        "incoming_quantity":     500,
        "reorder_point":         100,
        "unit_cost_usd":         1850,
        "cargo_type":            "machinery",
        "warehouse_location":    "Piraeus Industrial Zone",
    },
    {
        "user_label":            "H&M Cotton Fabric Rolls",
        "sku":                   "TEXT-COT-HM2024",
        "current_stock_units":   12000,
        "daily_consumption":     850,
        "incoming_quantity":     40000,
        "reorder_point":         4000,
        "unit_cost_usd":         28,
        "cargo_type":            "textiles",
        "warehouse_location":    "Rotterdam Textile Warehouse",
    },
    {
        "user_label":            "Tesla 4680 Battery Cell Modules",
        "sku":                   "ELEC-BAT-TSL4680",
        "current_stock_units":   420,
        "daily_consumption":     60,
        "incoming_quantity":     2000,
        "reorder_point":         200,
        "unit_cost_usd":         2400,
        "cargo_type":            "electronics",
        "warehouse_location":    "Hamburg EV Assembly Plant",
    },
    {
        "user_label":            "Polyethylene Chemical Feedstock",
        "sku":                   "CHEM-PE-FEED001",
        "current_stock_units":   45000,
        "daily_consumption":     3200,
        "incoming_quantity":     120000,
        "reorder_point":         15000,
        "unit_cost_usd":         1.8,
        "cargo_type":            "chemicals",
        "warehouse_location":    "Antwerp Chemical Terminal",
    },
    {
        "user_label":            "Siemens Wind Turbine Gearboxes",
        "sku":                   "ENER-WTG-SIE2024",
        "current_stock_units":   12,
        "daily_consumption":     2,
        "incoming_quantity":     40,
        "reorder_point":         8,
        "unit_cost_usd":         85000,
        "cargo_type":            "energy_equipment",
        "warehouse_location":     "Hamburg Energy Port",
    },
]

for i, item in enumerate(items):
    linked_id = shipments[i]["id"] if i < len(shipments) else None
    supabase.table("inventory_items").insert({
        **item,
        "linked_shipment_id": linked_id,
        "updated_at":         datetime.utcnow().isoformat(),
    }).execute()

print(f"Seeded {len(items)} inventory items")
