import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fetchSets() {
    const { data, error } = await supabase.from('sets').select('id,name');
    if (error) throw error;
    return data;
}

async function fetchCardsForSet(id) {
    const url = `https://tcgcsv.com/tcgplayer/3/${id}/products`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch cards for set ${id}`);
    const json = await res.json();
    return json.results;
}

function transformCard(card, setId) {
    const ext = card.extendedData || [];
    const findValue = name => ext.find(e => e.name === name)?.value || null;

    return {
        id: card.productId,
        name: card.cleanName,
        number: findValue("Number"),
        rarity: findValue("Rarity"),
        hp: findValue("HP"),
        card_type: findValue("Card Type"),
        stage: findValue("Stage"),
        card_text: findValue("CardText"),
        attack1: findValue("Attack 1"),
        attack2: findValue("Attack 2"),
        weakness: findValue("Weakness"),
        retreat_cost: findValue("RetreatCost"),
        image_url: card.imageUrl,
        url: card.url,
        set_id: setId
    };
}

function transformSealed(card, setId) {
    return {
        id: card.productId,
        name: card.name,
        image_url: card.imageUrl,
        url: card.url,
        set_id: setId
    }
}

async function insertCards(cards) {
    if (cards.length === 0) return;
    const { error } = await supabase.from('cards').insert(cards);
    if (error) console.error("❌ Error inserting cards:", error);
    else console.log(`✅ Inserted ${cards.length} cards`);
}

async function insertSealed(sealed) {
    if (sealed.length === 0) return;
    const { error } = await supabase.from('sealed_products').insert(sealed);
    if (error) console.error("❌ Error inserting sealed products:", error);
    else console.log(`📦 Inserted ${sealed.length} sealed products`);
}

async function importAllCards() {
    const sets = await fetchSets();

    for (const set of sets) {
        console.log(`Fetching cards for set: ${set.name} (${set.id})`);
        try {
            const rawCards = await fetchCardsForSet(set.id);

            const cards = [];
            const sealed = [];
            rawCards.forEach(raw => {
                const card = transformCard(raw, set.id);

                // If it looks like a sealed product → move to sealed_products
                if (!card.number && !card.rarity && !card.card_type && !card.stage) {
                    sealed.push(transformSealed(raw, set.id));
                } else {
                    cards.push(card);
                }
            });

            await insertCards(cards);
            await insertSealed(sealed);

        } catch (err) {
            console.error(`❌ Error importing set ${set.name}:`, err.message);
        }
    }

    console.log("🎉 All sets processed.");
}

importAllCards();