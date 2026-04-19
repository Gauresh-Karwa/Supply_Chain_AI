"""
In-memory demo cost analyses and inventory items.
Served as fallback when Supabase returns empty results.
"""
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any

_DEMO_ANALYSES: List[Dict[str, Any]] = []
_DEMO_INVENTORY: List[Dict[str, Any]] = []


# ─── Cost Analysis Demo Data ──────────────────────────────────────────────────

_RAW_ANALYSES = [
    # (title, company, origin, dest, cargo_val, demurrage, penalty_pct, holding_pct, delay_days, created_days_ago)
    ("Red Sea Diversion — Q1",       "Demo Company",          "Shanghai",    "Rotterdam",   3_200_000, 18_000, 0.5, 1.0, 5.2, 45),
    ("Hormuz Contingency",           "Demo Company",          "Mumbai",      "Dubai",       1_800_000, 12_000, 0.3, 0.8, 4.1, 38),
    ("Shanghai → Hamburg Reroute",   "Demo Company",          "Shanghai",    "Hamburg",     4_500_000, 22_000, 0.6, 1.2, 7.2, 31),
    ("Colombo Port Delay",           "Demo Company",          "Colombo",     "Rotterdam",   2_100_000, 14_000, 0.4, 1.0, 5.6, 29),
    ("Djibouti Emergency Ops",       "Demo Company",          "Djibouti",    "Rotterdam",   2_900_000, 20_000, 0.5, 1.1, 7.2, 24),
    ("Busan → Rotterdam Q2",         "Demo Company",          "Busan",       "Rotterdam",   3_600_000, 19_000, 0.5, 1.0, 3.8, 18),
    ("Dubai → Europe Alt Route",     "Demo Company",          "Dubai",       "Rotterdam",   2_750_000, 16_500, 0.4, 0.9, 4.0, 15),
    ("Karachi Corridor Hedge",       "Demo Company",          "Karachi",     "Rotterdam",   1_950_000, 13_000, 0.3, 0.8, 2.1, 11),
    ("Singapore → Dubai Reroute",    "Demo Company",          "Singapore",   "Dubai",       2_200_000, 11_500, 0.3, 0.7, 2.5, 9),
    ("LA → New York Disruption",     "Demo Company",          "Los_Angeles", "New_York",    2_850_000, 17_000, 0.5, 1.0, 3.4, 7),
    ("Shanghai → Rotterdam Late",    "Demo Company",          "Shanghai",    "Rotterdam",   3_100_000, 18_500, 0.5, 1.0, 1.8, 4),
    ("Mumbai → Singapore Hedge",     "Demo Company",          "Mumbai",      "Singapore",   1_400_000,  9_000, 0.2, 0.6, 0.5, 2),
]


def _compute_savings(cargo: float, dem: float, pen_pct: float, hold_pct: float, days: float) -> float:
    dem_cost  = dem * days
    hold_cost = cargo * (hold_pct / 100) / 30 * days
    pen_cost  = cargo * (pen_pct / 100) * days
    return round(dem_cost + hold_cost + pen_cost, 2)


def _make_analyses() -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    results = []
    for title, company, origin, dest, cargo, dem, pen, hold, delay, ago in _RAW_ANALYSES:
        savings = _compute_savings(cargo, dem, pen, hold, delay)
        results.append({
            "id":                   str(uuid.uuid5(uuid.NAMESPACE_DNS, f"demo-ca-{title}")),
            "analysis_title":       title,
            "company_name":         company,
            "shipment_id":          str(uuid.uuid5(uuid.NAMESPACE_DNS, f"ship-{origin}-{dest}-{ago}")),
            "origin":               origin,
            "destination":          dest,
            "current_route_id":     None,
            "recommended_route_id": None,
            "cargo_value_usd":      cargo,
            "daily_demurrage_usd":  dem,
            "penalty_rate_pct":     pen,
            "holding_rate_pct":     hold,
            "delay_days_avoided":   delay,
            "total_savings_usd":    savings,
            "co2_delta_tonnes":     round(delay * 1.4, 1),
            "created_at":           (now - timedelta(days=ago)).isoformat(),
        })
    return results


# ─── Inventory Demo Data ──────────────────────────────────────────────────────

_RAW_INVENTORY = [
    # (label, sku, stock, daily, reorder, unit_cost, created_days_ago)
    ("Engine Components — Type A",   "ENG-447A", 1200,  30,  200, 85.00,  90),
    ("Hydraulic Seals Kit",          "HYD-221",   450,  18,  100, 42.50,  85),
    ("Navigation Electronics",       "NAV-089",   320,   8,   80, 320.00, 80),
    ("Turbine Blade Set",            "TRB-554",   180,   5,   50, 650.00, 75),
    ("Marine Fuel Filters",          "FLT-312",  2400,  80,  400, 12.00,  70),
    ("Safety Equipment — SOLAS",     "SAF-100",   560,  12,  120, 95.00,  65),
    ("Propeller Shaft Bearings",     "BRG-778",   240,   6,   60, 145.00, 60),
    ("Radar Module v3",              "RAD-903",    90,   2,   25, 1850.00, 55),
    ("Deck Winch Cable (100m)",      "CAB-445",   180,   4,   40, 220.00, 50),
    ("Exhaust Gas Scrubber Parts",   "EXH-667",   320,   8,   80, 175.00, 45),
    ("Ballast Water Treatment Reag.","BWT-231",  1800,  45,  300, 28.00,  40),
    ("GMDSS Communication Kit",      "GMD-512",    55,   1,   15, 2400.00, 35),
    ("Anchor Chain Links (Grade 3)", "ACH-089",   800,  20,  150, 38.00,  30),
    ("Fire Suppression Cylinders",   "FRS-344",   140,   3,   35, 280.00, 25),
    ("Sewage Treatment Chemicals",   "STC-190",  3200, 110,  600, 8.50,   20),
]


def _make_inventory_items() -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    return [
        {
            "id":                   str(uuid.uuid5(uuid.NAMESPACE_DNS, f"demo-inv-{sku}")),
            "user_label":           label,
            "sku":                  sku,
            "current_stock_units":  stock,
            "daily_consumption":    daily,
            "linked_shipment_id":   None,
            "incoming_quantity":    round(stock * 0.8),
            "reorder_point":        reorder,
            "unit_cost_usd":        cost,
            "created_at":           (now - timedelta(days=ago)).isoformat(),
        }
        for label, sku, stock, daily, reorder, cost, ago in _RAW_INVENTORY
    ]


# ─── Initialisation ───────────────────────────────────────────────────────────

def init_demo_ledger() -> None:
    global _DEMO_ANALYSES, _DEMO_INVENTORY
    _DEMO_ANALYSES = _make_analyses()
    _DEMO_INVENTORY = _make_inventory_items()
    print(f"[demo] {len(_DEMO_ANALYSES)} cost analyses | {len(_DEMO_INVENTORY)} inventory items ready")


def get_demo_analyses() -> List[Dict[str, Any]]:
    if not _DEMO_ANALYSES:
        init_demo_ledger()
    return _DEMO_ANALYSES


def get_demo_inventory() -> List[Dict[str, Any]]:
    if not _DEMO_INVENTORY:
        init_demo_ledger()
    return _DEMO_INVENTORY
