import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Debug: Print available environment keys (not values) to see what Railway is passing
env_keys = list(os.environ.keys())
print(f"[database] Detected env keys: {', '.join([k for k in env_keys if 'SUPABASE' in k or 'GEMINI' in k])}")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(f"[database] ERROR: Missing SUPABASE_URL: {bool(SUPABASE_URL)}, Missing SUPABASE_KEY: {bool(SUPABASE_KEY)}")
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in Railway variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("[database] Supabase client initialized successfully")