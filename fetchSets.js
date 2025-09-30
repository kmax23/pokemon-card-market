const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const PTCG_BASE = "https://api.pokemontcg.io/v2";
const API_KEY = "ae52bd98-3712-42b9-a7fa-8d1e03f2ff21";

const BASE_DIR = "C:/Users/dcald/Documents/pokemon-price-site/set-assets";
const LOGO_DIR = path.join(BASE_DIR, "logos");
const SYMBOL_DIR = path.join(BASE_DIR, "symbols");

[LOGO_DIR, SYMBOL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function safeFetch(url, options = {}, retries = 3, backoff = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            console.warn(`Fetch error (status ${res.status}) on ${url}, attempt ${attempt}`);
        } catch (err) {
            console.warn(`Fetch exception on ${url}, attempt ${attempt}:`, err.message);
        }
        if (attempt < retries) {
            await new Promise(r => setTimeout(r, backoff * attempt)); // increasing delay
        }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function fetchAllSets() {
    let allSets = [];
    let page = 1;
    const pageSize = 25; // try smaller size

    while (true) {
        const url = `${PTCG_BASE}/sets?page=${page}&pageSize=${pageSize}`;
        console.log(`Fetching page ${page} (pageSize ${pageSize})...`);

        const res = await safeFetch(url, {
            headers: { "X-Api-Key": API_KEY }
        });

        const json = await res.json();
        const sets = json.data;
        if (!sets || sets.length === 0) break;

        allSets = allSets.concat(sets);

        console.log("First few sets on this page:", sets.slice(0, 5).map(s => ({ id: s.id, name: s.name })));

        page++;

        if (sets.length < pageSize) break;

        // short delay so not hammering the API
        await new Promise(r => setTimeout(r, 300));
    }

    return allSets;
}

async function downloadImage(url, filepath) {
    try {
        const res = await safeFetch(url, {}, 2);
        const buffer = await res.buffer();
        fs.writeFileSync(filepath, buffer);
        console.log(`✅ Saved ${filepath}`);
    } catch (err) {
        console.error(`Failed to download image ${url}:`, err.message);
    }
}

(async () => {
    try {
        const sets = await fetchAllSets();
        console.log(`Fetched total ${sets.length} sets.`);

        for (const set of sets) {
            const id = set.id;

            if (set.images?.logo) {
                const logoPath = path.join(LOGO_DIR, `${id}.png`);
                await downloadImage(set.images.logo, logoPath);
            }
            if (set.images?.symbol) {
                const symbolPath = path.join(SYMBOL_DIR, `${id}.png`);
                await downloadImage(set.images.symbol, symbolPath);
            }
        }

        console.log("Done downloading logos and symbols.");
    } catch (err) {
        console.error("Script failed:", err.message);
    }
})();