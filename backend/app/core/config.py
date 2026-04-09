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
W1_DELAY_RISK   = 0.35
W2_RELIABILITY  = 0.25
W3_COST         = 0.12
W4_TIME         = 0.12
W5_EMISSIONS    = 0.16

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
    "Los_Angeles":{"lat": 34.0522,  "lon": -118.2437},
    "New_York":   {"lat": 40.7128,  "lon": -74.0060},
    "Santos":     {"lat":-23.9618,  "lon": -46.3333},
    "Sydney":     {"lat":-33.8688,  "lon": 151.2093},
    "Melbourne":  {"lat":-37.8136,  "lon": 144.9631},
    "Tokyo":      {"lat": 35.6895,  "lon": 139.6917},
    "Yokohama":   {"lat": 35.4437,  "lon": 139.6380},
    "Shenzhen":   {"lat": 22.5431,  "lon": 114.0579},
    "Ningbo":     {"lat": 29.8683,  "lon": 121.5440},
    "Qingdao":    {"lat": 36.0671,  "lon": 120.3826},
    "Kaohsiung":  {"lat": 22.6273,  "lon": 120.3014},
    "Houston":    {"lat": 29.7604,  "lon": -95.3698},
    "Savannah":   {"lat": 32.0809,  "lon": -81.0912},
    "Miami":      {"lat": 25.7617,  "lon": -80.1918},
    "Seattle":    {"lat": 47.6062,  "lon": -122.3321},
    "Vancouver":  {"lat": 49.2827,  "lon": -123.1207},
    "Valparaiso": {"lat":-33.0456,  "lon": -71.6202},
    "Callao":     {"lat":-12.0671,  "lon": -77.1352},
    "Buenos_Aires":{"lat":-34.6037, "lon": -58.3816},
    "Felixstowe": {"lat": 51.9612,  "lon": 1.3524},
    "Algeciras":  {"lat": 36.1408,  "lon": -5.4562},
    "Valencia":   {"lat": 39.4699,  "lon": -0.3763},
    "Genoa":      {"lat": 44.4056,  "lon": 8.9463},
    "Alexandria": {"lat": 31.2001,  "lon": 29.9187},
    "Cape_Town":  {"lat":-33.9249,  "lon": 18.4241},
    "Vladivostok":{"lat": 43.1198,  "lon": 131.8869},
    "St_Petersburg":{"lat":59.9311, "lon": 30.3609},
    "Auckland":   {"lat":-36.8485,  "lon": 174.7633},
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
    "panama_canal":      "passes_panama_canal",
    "english_channel":   "passes_english_channel",
    "bosphorus_strait":  "passes_bosphorus_strait",
}