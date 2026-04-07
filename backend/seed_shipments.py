import sys
import os
sys.path.append(os.path.dirname(__file__))

from app.core.database import supabase
from datetime import datetime, timedelta
import random
import uuid

shipments = [
    {"origin": "Shanghai",  "destination": "Rotterdam",  "departure_time": "2025-06-10T08:00:00"},
    {"origin": "Shanghai",  "destination": "Rotterdam",  "departure_time": "2025-07-01T10:00:00"},
    {"origin": "Mumbai",    "destination": "Rotterdam",  "departure_time": "2025-06-15T06:00:00"},
    {"origin": "Mumbai",    "destination": "Dubai",      "departure_time": "2025-06-20T09:00:00"},
    {"origin": "Mumbai",    "destination": "Dubai",      "departure_time": "2025-07-05T07:00:00"},
    {"origin": "Singapore", "destination": "Rotterdam",  "departure_time": "2025-06-12T11:00:00"},
    {"origin": "Singapore", "destination": "Dubai",      "departure_time": "2025-06-25T08:00:00"},
    {"origin": "Busan",     "destination": "Rotterdam",  "departure_time": "2025-06-18T07:00:00"},
    {"origin": "Shanghai",  "destination": "Dubai",      "departure_time": "2025-06-22T09:00:00"},
    {"origin": "Shanghai",  "destination": "Hamburg",    "departure_time": "2025-07-10T06:00:00"},
    {"origin": "Colombo",   "destination": "Rotterdam",  "departure_time": "2025-06-14T10:00:00"},
    {"origin": "Colombo",   "destination": "Dubai",      "departure_time": "2025-06-28T08:00:00"},
    {"origin": "Karachi",   "destination": "Rotterdam",  "departure_time": "2025-06-16T07:00:00"},
    {"origin": "Karachi",   "destination": "Dubai",      "departure_time": "2025-06-30T09:00:00"},
    {"origin": "Dubai",     "destination": "Rotterdam",  "departure_time": "2025-06-11T08:00:00"},
    {"origin": "Mumbai",    "destination": "Singapore",  "departure_time": "2025-07-02T10:00:00"},
    {"origin": "Shanghai",  "destination": "Singapore",  "departure_time": "2025-06-19T06:00:00"},
    {"origin": "Busan",     "destination": "Singapore",  "departure_time": "2025-06-24T11:00:00"},
    {"origin": "Djibouti",  "destination": "Rotterdam",  "departure_time": "2025-06-17T07:00:00"},
    {"origin": "Hamburg",   "destination": "Piraeus",    "departure_time": "2025-06-13T09:00:00"},
]

supabase.table("shipments").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

for s in shipments:
    supabase.table("shipments").insert({
        "origin":               s["origin"],
        "destination":          s["destination"],
        "departure_time":       s["departure_time"],
        "transport_mode":       "sea",
        "status":               "on_time",
        "risk_score":           0.0,
        "predicted_delay_days": 0.0,
        "anomaly_flag":         False,
        "updated_at":           datetime.utcnow().isoformat(),
    }).execute()

print(f"Seeded {len(shipments)} demo shipments")