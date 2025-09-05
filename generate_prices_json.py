import json, requests, csv, os, time
from io import StringIO
from bs4 import BeautifulSoup

pokemon_sets = ['sword-&-shield']  # Add more sets as needed
prices_file = 'prices.json'
delay = 2  # seconds between requests

def download_csv(set_name):
    url = f"https://tcgcsv.com/tcgplayer/3/2585/products"
    r = requests.get(url)
    if r.status_code != 200:
        return None
    return StringIO(r.text)

def build_url(name, set_name, number):
    def fmt(text):
        text = text.lower().replace(' ', '-')
        for ch in ['/', '!', '?', ':', '.', ',']:
            text = text.replace(ch, '')
        return text
    return f"https://www.pricecharting.com/game/pokemon-{fmt(set_name)}/{fmt(name)}-{number}"

def scrape_price(name, set_name, number):
    url = build_url(name, set_name, number)
    headers = {'User-Agent': 'Mozilla/5.0'}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        return None
    soup = BeautifulSoup(r.text, 'html.parser')
    price_tag = soup.find('span', class_='price')
    if price_tag:
        try:
            return float(price_tag.text.replace('$','').replace(',',''))
        except:
            return None
    return None

# Load existing prices if they exist
if os.path.exists(prices_file):
    with open(prices_file, 'r') as f:
        prices = json.load(f)
else:
    prices = []

all_cards = []

# Download CSV and prepare card list
for set_name in pokemon_sets:
    csv_file = download_csv(set_name)
    if not csv_file:
        continue
    reader = csv.DictReader(csv_file)
    for row in reader:
        all_cards.append({
            "name": row['Name'],
            "set": row['Set'],
            "number": row['Number'],
            "sealed": False,          # change later for sealed product
            "affiliateLink": "#"
        })

# Scrape prices
for card in all_cards:
    existing = next((c for c in prices if c['name']==card['name'] and c['set']==card['set'] and c['number']==card['number']), None)
    previous = existing['currentPrice'] if existing else None
    current = scrape_price(card['name'], card['set'], card['number'])
    if current:
        card['previousPrice'] = previous if previous else current
        card['currentPrice'] = current
    else:
        card['previousPrice'] = previous if previous else 0
        card['currentPrice'] = previous if previous else 0
    prices = [c for c in prices if not (c['name']==card['name'] and c['set']==card['set'] and c['number']==card['number'])]
    prices.append(card)
    print(f"{card['name']} - {card['currentPrice']}$")
    time.sleep(delay)

with open(prices_file, 'w') as f:
    json.dump(prices, f, indent=2)
