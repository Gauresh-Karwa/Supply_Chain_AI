from datetime import datetime
import random
from app.core.database import supabase
from app.core.config import PORT_COORDS

# A static mapping of baseline popularity for large ports
PORT_BASE_WEIGHTS = {
    'Shanghai': 90, 'Singapore': 85, 'Rotterdam': 80, 'Ningbo': 80,
    'Los_Angeles': 75, 'Busan': 70, 'Hong_Kong': 65, 'Hamburg': 60,
    'Dubai': 55, 'New_York': 50, 'Antwerp': 50, 'Mumbai': 40
}

def generate_port_congestion():
    """Run via scheduler to refresh global port congestion states."""
    print(f"[congestion] Regenerating port congestion matrix at {datetime.utcnow().isoformat()}")
    
    # 1. Grab all active shipments to factor into the noise simulation
    active = supabase.table("shipments").select("destination").neq("status", "delivered").execute()
    incoming_counts = {}
    for row in active.data:
        incoming_counts[row["destination"]] = incoming_counts.get(row["destination"], 0) + 1

    now = datetime.utcnow()
    # Basic sinusoidal noise based on hours to simulate "Time of Day" traffic spikes
    hour_noise = (random.random() * 0.2) + (abs(now.hour - 12) / 12) * 0.3
    
    updates = []
    
    for port in PORT_COORDS.keys():
        # Heuristic 1: Base size
        base_traffic = PORT_BASE_WEIGHTS.get(port, 20)
        
        # Heuristic 2: Known incoming from our fleet
        fleet_incoming = incoming_counts.get(port, 0)
        
        # Heuristic 3: Temporary random spikes (e.g. weather blockage backlog)
        random_spike = random.randint(0, 30) if random.random() > 0.8 else 0
        
        # Calculate scores
        # Wait hours is loosely correlated to congestion score
        raw_score = base_traffic * (0.5 + hour_noise) + (fleet_incoming * 5) + random_spike
        congestion_score = round(min(max(raw_score, 0), 100), 1)
        
        # Vessels waiting: rough proxy
        vessels = int(congestion_score * random.uniform(0.8, 1.2))
        
        # Average wait in hours
        avg_wait = round((congestion_score / 10) * random.uniform(1.0, 3.5), 1)
        
        updates.append({
            "port_name": port,
            "vessels_waiting": vessels,
            "avg_wait_hours": avg_wait,
            "congestion_score": congestion_score,
            "last_updated": now.isoformat()
        })
        
    # Upsert to Supabase
    try:
        supabase.table("port_congestion").upsert(updates).execute()
        print(f"[congestion] Successfully updated {len(updates)} ports.")
    except Exception as e:
        print(f"[congestion] Error updating port congestion: {e}")

