import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY")

# Prediction thresholds
RISK_THRESHOLD_HIGH   = 0.70   # above this → high risk alert
RISK_THRESHOLD_MEDIUM = 0.45   # above this → medium risk

# Decision engine weights
W1_DELAY_RISK   = 0.40
W2_RELIABILITY  = 0.30
W3_COST         = 0.15
W4_TIME         = 0.15

# Port coordinates — used for weather + zone lookup for new ports
PORT_COORDS = {
    "Shanghai":   {"lat": 31.2304,  "lon": 121.4737},
    "Singapore":  {"lat":  1.3521,  "lon": 103.8198},
    "Rotterdam":  {"lat": 51.9244,  "lon":   4.4777},
    "Dubai":      {"lat": 25.2048,  "lon":  55.2708},
    "Mumbai":     {"lat": 18.9388,  "lon":  72.8354},
    "Colombo":    {"lat":  6.9271,  "lon":  79.8612},
    "Busan":      {"lat": 35.1796,  "lon": 129.0756},
    "Hong_Kong":  {"lat": 22.3193,  "lon": 114.1694},
    "Hamburg":    {"lat": 53.5753,  "lon":   9.9954},
    "Antwerp":    {"lat": 51.2194,  "lon":   4.4025},
    "Piraeus":    {"lat": 37.9475,  "lon":  23.6413},
    "Karachi":    {"lat": 24.8607,  "lon":  67.0011},
    "Djibouti":   {"lat": 11.5720,  "lon":  43.1456},
    "Port_Klang": {"lat":  3.0319,  "lon": 101.3805},
}

# Chokepoint mapping — region_id → feature column name
CHOKEPOINT_MAP = {
    "suez_canal":        "passes_suez",
    "hormuz_strait":     "passes_hormuz",
    "malacca_strait":    "passes_malacca",
    "bab_el_mandeb":     "passes_bab_el_mandeb",
    "cape_of_good_hope": "passes_cape",
    "taiwan_strait":     "passes_taiwan_strait",
    "south_china_sea":   "passes_south_china_sea",
}