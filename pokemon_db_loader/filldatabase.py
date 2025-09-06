import requests
import psycopg2
from psycopg2.extras import execute_values
import time
from dotenv import load_dotenv
import os

# ---------- LOAD CONFIG ----------
load_dotenv()

API_KEY = os.getenv("API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
SUPABASE_DB_NAME = os.getenv("SUPABASE_DB_NAME")
SUPABASE_DB_USER = os.getenv("SUPABASE_DB_USER")
SUPABASE_DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")
SUPABASE_DB_PORT = int(os.getenv("SUPABASE_DB_PORT"))

HEADERS = {"X-Api-Key": API_KEY}
BASE_URL = "https://api.pokemontcg.io/v2"

# ---------- DATABASE CONNECTION ----------
conn = psycopg2.connect(
    host=SUPABASE_DB_URL,
    dbname=SUPABASE_DB_NAME,
    user=SUPABASE_DB_USER,
    password=SUPABASE_DB_PASSWORD,
    port=SUPABASE_DB_PORT,
    sslmode='require'
)
cursor = conn.cursor()

# ---------- CREATE TABLES ----------
tables_sql = [
    """
    CREATE TABLE IF NOT EXISTS supertypes (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rarities (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS types (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS subtypes (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sets (
        id TEXT PRIMARY KEY,
        name TEXT,
        series TEXT,
        printed_total INT,
        total INT,
        release_date DATE,
        ptcgo_code TEXT,
        updated_at TIMESTAMP,
        logo_url TEXT,
        symbol_url TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        name TEXT,
        supertype_id INT REFERENCES supertypes(id),
        rarity_id INT REFERENCES rarities(id),
        hp INT,
        artist TEXT,
        flavor_text TEXT,
        regulation_mark TEXT,
        set_id TEXT REFERENCES sets(id),
        number TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS card_types (
        card_id TEXT REFERENCES cards(id),
        type_id INT REFERENCES types(id),
        PRIMARY KEY (card_id, type_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS card_subtypes (
        card_id TEXT REFERENCES cards(id),
        subtype_id INT REFERENCES subtypes(id),
        PRIMARY KEY (card_id, subtype_id)
    )
    """
]

for sql in tables_sql:
    cursor.execute(sql)
conn.commit()

# ---------- UTILITY FUNCTIONS ----------
def upsert_simple_table(table, items):
    sql = f"""
        INSERT INTO {table} (name) VALUES %s
        ON CONFLICT (name) DO NOTHING
    """
    execute_values(cursor, sql, [(item,) for item in items])
    conn.commit()

def get_id_from_name(table, name):
    cursor.execute(f"SELECT id FROM {table} WHERE name=%s", (name,))
    res = cursor.fetchone()
    if res:
        return res[0]
    # Insert if not exists
    cursor.execute(f"INSERT INTO {table} (name) VALUES (%s) RETURNING id", (name,))
    conn.commit()
    return cursor.fetchone()[0]

def insert_sets(sets):
    sql = """
        INSERT INTO sets (id, name, series, printed_total, total, release_date, ptcgo_code, updated_at, logo_url, symbol_url)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    data = [
        (
            s['id'],
            s['name'],
            s.get('series'),
            s.get('printedTotal'),
            s.get('total'),
            s.get('releaseDate'),
            s.get('ptcgoCode'),
            s.get('updatedAt'),
            s.get('images', {}).get('logo'),
            s.get('images', {}).get('symbol')
        ) for s in sets
    ]
    execute_values(cursor, sql, data)
    conn.commit()

def insert_card(card):
    supertype_id = get_id_from_name('supertypes', card.get('supertype')) if card.get('supertype') else None
    rarity_id = get_id_from_name('rarities', card.get('rarity')) if card.get('rarity') else None

    cursor.execute("""
        INSERT INTO cards (id, name, supertype_id, rarity_id, hp, artist, flavor_text, regulation_mark, set_id, number)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING
    """, (
        card['id'],
        card['name'],
        supertype_id,
        rarity_id,
        int(card['hp']) if card.get('hp') and card['hp'].isdigit() else None,
        card.get('artist'),
        card.get('flavorText'),
        card.get('regulationMark'),
        card['set']['id'] if card.get('set') else None,
        card.get('number')
    ))

    # Insert types
    for t in card.get('types', []):
        type_id = get_id_from_name('types', t)
        cursor.execute("INSERT INTO card_types (card_id, type_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                       (card['id'], type_id))
    
    # Insert subtypes
    for st in card.get('subtypes', []):
        subtype_id = get_id_from_name('subtypes', st)
        cursor.execute("INSERT INTO card_subtypes (card_id, subtype_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                       (card['id'], subtype_id))
    conn.commit()

# ---------- FETCH AND STORE STATIC TABLES ----------
print("Fetching supertypes...")
r = requests.get(f"{BASE_URL}/supertypes", headers=HEADERS)
upsert_simple_table('supertypes', r.json().get('data', []))

print("Fetching rarities...")
r = requests.get(f"{BASE_URL}/rarities", headers=HEADERS)
upsert_simple_table('rarities', r.json().get('data', []))

print("Fetching types...")
r = requests.get(f"{BASE_URL}/types", headers=HEADERS)
upsert_simple_table('types', r.json().get('data', []))

print("Fetching subtypes...")
r = requests.get(f"{BASE_URL}/subtypes", headers=HEADERS)
upsert_simple_table('subtypes', r.json().get('data', []))

# ---------- FETCH AND STORE SETS ----------
print("Fetching sets...")
r = requests.get(f"{BASE_URL}/sets", headers=HEADERS)
sets_data = r.json().get('data', [])
insert_sets(sets_data)
print(f"Inserted {len(sets_data)} sets.")

# ---------- FETCH AND STORE CARDS ----------
page = 1
page_size = 250
total_cards = 0

while True:
    print(f"Fetching cards page {page}...")
    r = requests.get(f"{BASE_URL}/cards", headers=HEADERS, params={'page': page, 'pageSize': page_size})
    if r.status_code != 200:
        print(f"Stopped at page {page}, status code: {r.status_code}")
        break
    
    try:
        data = r.json()
    except ValueError:
        print(f"Failed to parse JSON on page {page}")
        break
    
    cards = data.get('data', [])
    if not cards:
        break

    for card in cards:
        insert_card(card)

    total_cards += len(cards)
    print(f"Inserted {len(cards)} cards (total {total_cards}).")

    if page * page_size >= data.get('totalCount', 0):
        break

    page += 1
    time.sleep(1)  # avoid rate limit

print("Done inserting all cards.")
cursor.close()
conn.close()
