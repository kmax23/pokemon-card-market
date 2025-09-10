// script.js

const colors = {
    pikachuYellow: "#FFEB3B",
    charizardRed: "#FF1C1C",
    bulbasaurTeal: "#4DB6AC",
    pokeballBlue: "#3B4CCA",
    electricHover: "#rgba(255,238,88,0.2)"
};

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

async function populateTicker() {
    const { data } = await supabase
        .from("daily_prices")
        .select(`card_id, market, card_name`)
        .order("percentage_change", {ascending: false })
        .limit(50);

    const ticker = document.getElementById("tickerContent");
    data.forEach(card => {
        const span = document.createElement("span");
        span.className = "tickerItem";
        span.textContent = `${card.card_name}: ${card.percentage_change.toFixed(2)}%`;
        ticker.appendChild(span);
    });
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
                borderColor: colors.bulbasaurTeal,
                backgroundColor: colors.electricHover,
                fill: false,
                tension: 0.2,
                borderWidth: 3,
                pointBackgroundColor: colors.pikachuYellow,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                tooltip: {mode: 'index', intersect: false }
            },
            scales: {
                x: { display: true },
                y: { beginAtZero: false, ticks: { color: colors.pokeballBlue } }
            }
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
async function renderCardIndexChart() {
    const { data } = await supabase
        .from("daily_prices")
        .select("date, market");

    const labels = data.map(d => d.date);
    const values = data.map(d => d.market);

    new Chart(document.getElementById("indexChart"), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: "Pokémon Card Index",
                data: values,
                borderColor: colors.pikachuYellow,
                backgroundColor: colors.electricHover,
                fill: true,
                tension: 0.2,
                borderWidth: 3,
                pointBackgroundColor: colors.pikachuYellow,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { ticks: { color: colors.pokeballBlue } },
                y: { ticks: { color: colors.pokeballBlue } }
            }
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

// THEME TOGGLE: robust init + localStorage + button text
function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) {
    console.warn("themeToggle button not found");
    return;
  }

  const setBtnText = () => {
    btn.textContent = document.documentElement.classList.contains("dark") ? "Light" : "Dark";
  };

  // initialize button text
  setBtnText();

  btn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    setBtnText();
  });
}

// ensure it runs after DOM is ready (works whether script is loaded in head or end of body)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeToggle);
} else {
  initThemeToggle();
}

