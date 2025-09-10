import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function importSets() {
    console.log("Fetching sets from tcgcsv...");
    const response = await fetch('https://tcgcsv.com/tcgplayer/3/groups');
    const data = await response.json();
    console.log("Raw data from tcgcsv:", data);

    const sets = data.results;

    if (!sets || !Array.isArray(sets)) {
        console.error("No sets found or response format changed!", data);
        return;
    }

    console.log(`Found ${sets.length} sets`);

    let successCount = 0;
    for (const set of sets) {
        const { error } = await supabase.from("sets").upsert(
            {
                id: set.groupId,
                name: set.name,
                abbreviation: set.abbreviation,
                release_date: set.publishedOn,
                category_id: set.categoryId,
                product_url: set.url,
            },
            { onConflict: "id" }
        );

        if (error) {
            console.error(`❌ Error inserting set ${set.name}:`, error.message);
        } else {
            successCount++;
            console.log(`✅ Inserted/updated set: ${set.name}`);
        }
    }

    console.log(`Done. Imported/updated ${successCount} sets total.`);
}

importSets().catch((err) => {
    console.error("Unexpected error:", err);
});