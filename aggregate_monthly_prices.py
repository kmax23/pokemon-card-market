from datetime import datetime, timedelta
from supabase import create_client
from generate_prices_json import aggregate_monthly_prices

# ---------- Supabase setup ----------
SUPABASE_URL = "https://qptdfdlkrifcombblzaw.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdGRmZGxrcmlmY29tYmJsemF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTA1NTEsImV4cCI6MjA3MjY2NjU1MX0.uEasItbNGXXNwl5bb_8YHYgaUkh9rUC9chfisMaaA-o"  # Replace with your anon key
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

if __name__ == "__main__":
    aggregate_monthly_prices()
    print(f"Monthly aggregation completed at {datetime.now()}")