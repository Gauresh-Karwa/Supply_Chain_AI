import json
import sys
import os
sys.path.append(os.path.dirname(__file__))

from app.core.database import supabase

def seed_routes():
    with open("../data/routes.json") as f:
        routes = json.load(f)
    
    # Clear existing data first so running seed.py twice doesn't duplicate
    supabase.table("routes").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    
    result = supabase.table("routes").insert(routes).execute()
    print(f"Seeded {len(result.data)} routes")

def seed_constraints():
    with open("../data/constraints.json") as f:
        constraints = json.load(f)
    
    supabase.table("constraints_table").delete().neq("region_id", "___").execute()
    
    result = supabase.table("constraints_table").insert(constraints).execute()
    print(f"Seeded {len(result.data)} constraints")

if __name__ == "__main__":
    seed_routes()
    seed_constraints()
    print("Done")