import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { tmpdir } from 'os';
import path, { join } from 'path';
import fs from 'fs/promises';
import { unpack } from "7zip-min";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const START_DATE = new Date("2024-02-08");
const END_DATE = new Date(); // today

let validSetIds = new Set();
const productTypeMap = new Map();

// ------------------------ Helper Functions ------------------------

// Helper: format YYYY-MM-DD
function fmt(date) {
    return date.toISOString().split("T")[0];
}

// Decide whether to store daily or weekly
function shouldStoreDaily(date) {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    return date >= threeMonthsAgo;
}

// Helper to normalize week string
function getWeekStartDate(d) {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setUTCDate(diff));
    return monday.toISOString().split("T")[0];
}

// Check if productId belongs to cards or sealed_products
async function classifyProduct(productId) {
    return productTypeMap.get(productId) || null;
}

// Recursively get all files in a directory
async function getAllFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? getAllFiles(res) : res;
        })
    );

    return Array.prototype.concat(...files);
}

// Extract .7z archive to a temp folder
async function extract7z(src, dateStr) {
    const dest = join(tmpdir(), `prices-${dateStr}`);
    await fs.mkdir(dest, { recursive: true });

    return new Promise((resolve, reject) => {
        unpack(src, dest, (err) => {
            if (err) return reject(err);
            resolve(dest);
        });
    });
}

// ------------------------ Preload Functions ------------------------

async function loadValidSetIds() {
    // Adjust 'id' -> 'group_id' if your DB uses that column name
    const { data, error } = await supabase.from('sets').select('id');
    if (error) throw new Error("Failed to load sets: " + error.message);
    return new Set((data || []).map(s => String(s.id)));
}

async function preloadProducts() {
    console.log("📥 Preloading products from Supabase...");

    async function fetchAll(table) {
        let data = [];
        let from = 0;
        const batchSize = 1000; // fetch 1k at a time
        while (true) {
            const { data: batch, error } = await supabase
                .from(table)
                .select('id')
                .range(from, from + batchSize - 1);

            if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
            data.push(...batch);
            if (batch.length < batchSize) break;
            from += batchSize;
        }
        return data;
    }

    const [cards, sealed] = await Promise.all([
        fetchAll("cards"),
        fetchAll("sealed_products")
    ]);

    for (const c of cards) productTypeMap.set(c.id, "card");
    for (const s of sealed) productTypeMap.set(s.id, "sealed");

    console.log("Example product IDs in preload map:", Array.from(productTypeMap.keys()).slice(0, 10));

    console.log(`✅ Preloaded ${cards.length} cards, ${sealed.length} sealed products`);
}

// ------------------------ Main Processing ------------------------

async function downloadAndExtract(dateStr) {
    const url = `https://tcgcsv.com/archive/tcgplayer/prices-${dateStr}.ppmd.7z`;
    console.log(`📥 Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
        console.warn(`⚠️ Skip ${dateStr} (not found)`);
        return null;
    }

    const buffer = await res.arrayBuffer();
    console.log(`   ↳ Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    const tmpFile = join(tmpdir(), `prices-${dateStr}.7z`);
    await fs.writeFile(tmpFile, Buffer.from(buffer));

    console.log("   ↳ Extracting archive...");
    const dest = await extract7z(tmpFile, dateStr);

    return dest;
}

async function processDate(date) {
    const dateStr = fmt(date);
    console.log(`\n📅 Processing ${dateStr}`);

    const extractedPath = await downloadAndExtract(dateStr);
    if (!extractedPath) return;

    const allFiles = await getAllFiles(extractedPath);

    // Filter Pokémon price files only
    const pokemonFiles = allFiles.filter((filePath) => {
        const parts = path.normalize(filePath).split(path.sep).filter(Boolean);
        const dateIndex = parts.indexOf(dateStr);
        if (dateIndex === -1) return false;
        const category = parts[dateIndex + 1]; // should be '3' for Pokemon
        const groupId = parts[dateIndex + 2]; // should be your set id (from DB)
        if (category === '3' && groupId && !validSetIds.has(String(groupId))) {
            console.log(`   ⚠️ Ignored groupId ${groupId} (not in Supabase)`);
        }
        return category === '3' && groupId && validSetIds.has(String(groupId)) && parts[parts.length - 1] === 'prices';
    });

    console.log(`   ↳ Found ${pokemonFiles.length} Pokémon price files`);
    if (!pokemonFiles.length) {
        console.log(`No Pokemon price files found for ${dateStr} (filtered or none exist)`);
    } else {
        console.log(`Processing ${pokemonFiles.length} Pokemon files for ${dateStr}`);
    }

    const cardRows = [];
    const sealedRows = [];

    for (let i = 0; i < pokemonFiles.length; i++) {
        const file = pokemonFiles[i];
        console.log(`      → Reading file ${i + 1}/${pokemonFiles.length}`);

        let text;
        try {
            text = await fs.readFile(file, "utf-8");
        } catch (err) {
            console.warn(`⚠️ Failed to read ${file}: ${err.message}`);
            continue;
        }

        let json;
        try {
            json = JSON.parse(text);
        } catch (err) {
            console.warn(`⚠️ Failed to parse JSON in ${file}: ${err.message}`);
            continue;
        }

        if (!json.success || !json.results) continue;

        for (const p of json.results) {
            if (!p || !p.productId) continue;

            if (!p) {
                console.warn(`⚠️ Skipping undefined entry in ${file}`);
                continue;
            }

            const type = await classifyProduct(p.productId);
            if (!type) continue;

            const row = {
                date: dateStr,
                granularity: "daily",
                low_price: p.lowPrice ?? null,
                mid_price: p.midPrice ?? null,
                high_price: p.highPrice ?? null,
                market_price: p.marketPrice ?? null,
                avg_price: p.marketPrice ?? p.midPrice ?? null,
            };

            if (type === "card") cardRows.push({ ...row, card_id: p.productId });
            else if (type === "sealed") sealedRows.push({ ...row, sealed_product_id: p.productId });
        }
    }

    console.log(`   ↳ Prepared ${cardRows.length} card rows, ${sealedRows.length} sealed rows`);

    // Weekly aggregation if needed
    let finalCardRows = cardRows;
    let finalSealedRows = sealedRows;

    if (!shouldStoreDaily(date)) {
        finalCardRows = aggregateWeekly(cardRows, "card_id");
        finalSealedRows = aggregateWeekly(sealedRows, "sealed_product_id");
    }

    // Insert into Supabase
    if (finalCardRows.length) {
        const { error } = await supabase.from("daily_card_prices").upsert(finalCardRows, { onConflict: "card_id,date"});
        if (error) console.error(`❌ Error inserting cards ${dateStr}:`, error.message);
        else console.log(`✅ Inserted ${data?.length || finalCardRows.length} card rows`);
    }

    if (finalSealedRows.length) {
        const { error } = await supabase.from("daily_sealed_prices").upsert(finalSealedRows, { onConflict: "sealed_product_id,date"});
        if (error) console.error(`❌ Error inserting sealed ${dateStr}:`, error.message);
        else console.log(`✅ Inserted ${data?.length || finalSealedRows.length} sealed rows`);
    }
}

// Weekly aggregation helper
function aggregateWeekly(rows, idField) {
    const byWeek = {};

    for (const row of rows) {
        const weekStart = getWeekStartDate(new Date(row.date));
        if (!byWeek[weekStart]) byWeek[weekStart] = {};
        if (!byWeek[weekStart][row[idField]]) byWeek[weekStart][row[idField]] = [];
        byWeek[weekStart][row[idField]].push(row);
    }

    const result = [];
    for (const [weekStart, products] of Object.entries(byWeek)) {
        for (const [id, rows] of Object.entries(products)) {
            const avg = (field) => {
                rows.map(r => r[field]).filter(v => v !== null).reduce((a, b) => a + b, 0) /
                rows.map(r => r[field]).filter(v => v !== null).length || null;
            };
            const obj = { date: weekStart, granularity: "weekly", ...Object.fromEntries([[idField, Number(id)]]), low_price: avg("low_price"), mid_price: avg("mid_price"), high_price: avg("high_price"), market_price: avg("market_price"), avg_price: avg("avg_price") };
            result.push(obj);
        }
    }
    return result;
}

// ------------------------ Main ------------------------

async function run() {
    console.log("🚀 Starting backfill process...");
    validSetIds = await loadValidSetIds();
    await preloadProducts();

    for (let d = new Date(START_DATE); d <= END_DATE; d.setDate(d.getDate() + 1)) {
        try {
            await processDate(new Date(d));
        } catch (err) {
            console.error(`Error processing ${fmt(d)}:`, err.message);
        }
    }
    console.log("🎉 Backfill complete!");
}

run();
