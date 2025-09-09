import os
import re
import random
import time
import requests
from datetime import datetime, timezone, date, timedelta
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

# ---------- Supabase setup ----------
SUPABASE_URL = "https://qptdfdlkrifcombblzaw.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdGRmZGxrcmlmY29tYmJsemF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTA1NTEsImV4cCI6MjA3MjY2NjU1MX0.uEasItbNGXXNwl5bb_8YHYgaUkh9rUC9chfisMaaA-o"  # Replace with your anon key
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

PRICE_TYPE = "Ungraded"
MAX_THREADS = 5
RETRY_LIMIT = 3

# ---------- Fetch cards ----------
def sanitize(text):
    """Sanitize names for PriceCharting URLs."""
    if not text:
        return ""
    text = text.lower()
    text = text.replace("'", "")      # remove apostrophes
    text = text.replace(" ", "-")
    text = text.replace("  ", "-")    # spaces to hyphens
    text = re.sub(r"[^a-z0-9\-&]", "", text)  # remove other special chars
    return text

def build_pricecharting_url(card):
    """Build PriceCharting URL for normal and Promo cards."""
    card_name = sanitize(card["name"])
    card_number = sanitize(card.get("number", ""))
    set_name_raw = card.get("set_name", "")

    if "promo" in set_name_raw.lower():
        url = f"https://www.pricecharting.com/game/pokemon-promo/{card_name}-{card_number}"
    else:
        set_name = sanitize(set_name_raw)
        url = f"https://www.pricecharting.com/game/pokemon-{set_name}/{card_name}-{card_number}"
    return url

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0"})

def fetch_price(card):
    url = build_pricecharting_url(card)
    for attempt in range(RETRY_LIMIT):
        try:
            r = session.get(url, timeout=(3,5))
            if r.status_code == 200:
                match = re.search(r'<span class="price js-price">\s*\$(.*?)\s*</span>', r.text)
                if match:
                    return float(match.group(1).replace(",", ""))
        except Exception:
            pass
        time.sleep(0.5)  # short delay between retries
    return None

def safe_upsert(table_name, data, on_conflict):
    """Upsert to Supabase with retry and exponential backoff."""
    for attempt in range(RETRY_LIMIT):
        try:
            res = supabase.table(table_name).upsert(data, on_conflict=on_conflict).execute()
            if res.data is not None:
                return res.data
        except Exception as e:
            print(f"Supabase error on {table_name}: {e}")
        sleep_time = (2 ** attempt) + random.random()  # exponential backoff + jitter
        time.sleep(sleep_time)
    print(f"Failed to upsert {data} to {table_name} after {RETRY_LIMIT} attempts.")
    return None

def process_card(card):
    card_name = card["name"]
    set_info = card.get("sets")
    set_name = set_info["name"] if set_info else "Unknown Set"
    card["set_name"] = set_name
    price = fetch_price(card)

    if price is None:
        return f"No price found for {card_name} ({set_name})"

    # Upsert Supabase prices table
    price_data = {
        "card_id": card["id"],
        "price_type": PRICE_TYPE,
        "market": price,
        "source": "PriceCharting",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    supabase.table("prices").upsert(price_data, on_conflict="card_id,price_type").execute()

    # Upsert daily prices
    daily_price_data = {
        "card_id": card["id"],
        "date": date.today().isoformat(),
        "market": price
    }
    supabase.table("daily_prices").upsert(daily_price_data, on_conflict="card_id,date").execute()

    return f"Updated {card_name} ({set_name}): ${price}"

def aggregate_monthly_prices():
    today = datetime.now().date()
    first_day_this_month = today.replace(day=1)
    last_month_end = first_day_this_month - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    # Fetch daily prices for last month
    daily_data = supabase.table("daily_prices") \
        .select("card_id, market") \
        .gte("date", last_month_start.isoformat()) \
        .lte("date", last_month_end.isoformat()) \
        .execute()

    # Calculate averages per card
    monthly_avg = {}
    for row in daily_data.data:
        monthly_avg.setdefault(row["card_id"], []).append(row["market"])

    # Upsert monthly averages
    for card_id, prices in monthly_avg.items():
        avg_price = sum(prices) / len(prices)
        supabase.table("monthly_avg_prices").upsert({
            "card_id": card_id,
            "year": last_month_end.year,
            "month": last_month_end.month,
            "avg_price": avg_price
        }, on_conflict="card_id,year,month").execute()

    # Delete daily prices older than 3 months
    three_months_ago = today - timedelta(days=90)
    supabase.table("daily_prices").delete().lt("date", three_months_ago.isoformat()).execute()

# ---------- MAIN ----------
def main():
    all_cards = []
    batch_size = 1000
    offset = 0

    while True:
        # Fetch all cards with set info from Supabase
        batch = supabase.table("cards").select("id, name, number, sets!cards_set_id_fkey(name)").range(offset, offset + batch_size -1).execute()

        data = batch.data
        if not data:
            break

        all_cards.extend(data)

        offset += batch_size

    if not all_cards:
        print("No cards found in Supabase.")
        return
    
    print(f"Fetched {len(all_cards)} cards from Supabase.")
    
    count = 1
    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        futures = {executor.submit(process_card, card): card for card in all_cards}
        for future in tqdm(as_completed(futures), total=len(all_cards), desc="Fetching prices"):
            try:
                result = future.result(timeout=15)
                if result:
                    tqdm.write(result)
            except Exception as e:
                tqdm.write(f"Error in worker: {e}")


if __name__ == "__main__":
    main()