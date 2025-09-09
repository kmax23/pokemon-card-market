// script.js

// Fetch cards from Supabase
async function fetchCards(limit=250) {
    const { data, error } = await supabase
        .from("cards")
        .select(`
            id,
            name,
            number,
            hp,
            artist,
            flavor_text,
            regulation_mark,
            sets!cards_set_id_fkey(id, name),
            rarities!cards_rarity_id_fkey(name),
            supertypes!cards_supertype_id_fkey(name),
            prices(market,price_type,updated_at)
        `).limit(limit);

    if (error) {
        console.error("Error fetching cards:", error);
        return [];
    } else {
        console.log("Fetched cards:", data);
    }

    return data;
}

// Render the card table
function renderCardTable(cards) {
    const tableBody = document.querySelector("#cardTable tbody");
    tableBody.innerHTML = "";

    cards.forEach(card => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = card.name;

        const setCell = document.createElement("td");
        setCell.textContent = card.sets ? card.sets.name : "";

        const rarityCell = document.createElement("td");
        rarityCell.textContent = card.rarities ? card.rarities.name : "";

        const priceCell = document.createElement("td");
        // 👇 Placeholder until we add a `prices` table
        if (card.prices && card.prices.length > 0) {
            priceCell.textContent = `$${card.prices[0].market.toFixed(2)}`;
        } else {
            priceCell.textContent = "N/A";
        }

        row.appendChild(nameCell);
        row.appendChild(setCell);
        row.appendChild(rarityCell);
        row.appendChild(priceCell);

        tableBody.appendChild(row);
    });
}

function attachRowHover(cards) {
    const rows = document.querySelectorAll("#cardTable tbody tr");

    rows.forEach((row, i) => {
        row.addEventListener("mouseenter", async () => {
            const card = cards[i];

            const { data, error } = await supabase
                .from("daily_prices")
                .select("date, market")
                .eq("card_id", card.id)
                .order("date", { ascending: true });

            if (error) {
                console.error("Error fetching price history:", error);
                return;
            }

            renderPriceChart(card.name, data);
        });
    });
}

let hoverChartInstance = null;

function renderPriceChart(cardName, prices) {
    const ctx = document.getElementById("hoverChart").getContext("2d");

    // Destroy previous chart if it exists
    if (hoverChartInstance) {
        hoverChartInstance.destroy();
    }

    const labels = prices.map(p => p.date);
    const values = prices.map(p => p.market);

    hoverChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: `${cardName} Price`,
                data: values,
                borderColor: "#38D9A9",
                fill: false
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: true } },
            scales: { y: { beginAtZero: false } }
        }
    });
}

function calculateTotalValue(cards) {
    return cards.reduce((sum, card) => {
        if (card.prices && card.prices.length > 0) {
            return sum + card.prices[0].market;
        }
        return sum;
    }, 0);
}

// Render a simple chart using HP (placeholder until we wire up prices)
function renderCardChart(cards) {
    const ctx = document.getElementById("indexChart").getContext("2d");

    const totalValue = calculateTotalValue(cards);
    const values = cards.map(c => c.hp || 0);

    new Chart(ctx, {
        type: "line",
        data: {
            labels: ["Total Market Value"],
            datasets: [{
                label: "Pokemon Card Index",
                data: [totalValue],
                backgroundColor: "#38D9A9"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Initialize
async function init() {
    const cards = await fetchCards();
    renderCardTable(cards);
    attachRowHover(cards);
    renderCardChart(cards);
}

window.addEventListener("DOMContentLoaded", init);
