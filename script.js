// script.js

// -------------------------
// 1. SUPABASE INIT
// -------------------------
const supabaseUrl = "https://qptdfdlkrifcombblzaw.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdGRmZGxrcmlmY29tYmJsemF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTA1NTEsImV4cCI6MjA3MjY2NjU1MX0.uEasItbNGXXNwl5bb_8YHYgaUkh9rUC9chfisMaaA-o";
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// -------------------------
// 2. COLORS
// -------------------------
const colors = {
    pikachuYellow: "#FFEB3B",
    charizardRed: "#FF1C1C",
    bulbasaurTeal: "#4DB6AC",
    pokeballBlue: "#3B4CCA",
    electricHover: "rgba(255,238,88,0.2)"
};

// -------------------------
// 3. GLOBAL VARIABLES
// -------------------------
let cardsData = [];
let currentPage = 1;
const pageSize = 50;
let hoverChartInstance = null;

// -------------------------
// 4. THEME TOGGLE
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
    const themeToggle = document.getElementById("themeToggle");
    if (localStorage.getItem("theme") === "dark") {
        document.documentElement.classList.add("dark");
        themeToggle.checked = true;
    }

    themeToggle.addEventListener("change", () => {
        if (themeToggle.checked) {
            document.documentElement.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    });
});

// -------------------------
// 5. FETCH CARDS
// -------------------------
async function loadCards() {
    try {
        const { data, error } = await supabase
            .from("daily_card_prices")
            .select(`
                card_id,
                date,
                avg_price,
                card:cards(name, set, rarity)
            `)
            .order('date', { ascending: false });

        if (error) throw error;

        const grouped = {};
        data.forEach(d => {
            if (!grouped[d.card_id]) grouped[d.card_id] = [];
            grouped[d.card_id].push(d);
        });

        cardsData = Object.entries(grouped).map(([id, prices]) => ({
            card_id: id,
            card: prices[0].card,
            prices: prices.sort((a, b) => new Date(a.date) - new Date(b.date)),
            latest: prices[0],
            previous: prices[1] || null
        }));

        displayTopMovers();
        displayCards();
        populateTicker();
        renderCardIndexChart();
    } catch (err) {
        console.error("Error loading cards:", err);
    }
}

// -------------------------
// 6. TOP GAINERS & LOSERS
// -------------------------
function displayTopMovers() {
    const sorted = cardsData
        .filter(c => c.previous)
        .map(c => ({ ...c, pctChange: ((c.latest.avg_price - c.previous.avg_price) / c.previous.avg_price) * 100 }))
        .sort((a, b) => b.pctChange - a.pctChange);

    const gainers = sorted.slice(0, 10);
    const losers = sorted.slice(-10).reverse();

    const gainersEl = document.getElementById("topGainers");
    const losersEl = document.getElementById("topLosers");
    if (!gainersEl || !losersEl) return;

    gainersEl.innerHTML = "";
    losersEl.innerHTML = "";

    gainers.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.card.name} (+${c.pctChange.toFixed(2)}%)`;
        gainersEl.appendChild(li);
    });

    losers.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.card.name} (${c.pctChange.toFixed(2)}%)`;
        losersEl.appendChild(li);
    });
}

// -------------------------
// 7. CARDS TABLE & SPARKLINES
// -------------------------
function displayCards() {
    const tbody = document.getElementById("cardTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = cardsData.slice(start, end);

    pageData.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.card.name}</td>
            <td>${c.card.set}</td>
            <td>${c.card.rarity}</td>
            <td>$${c.latest.avg_price.toFixed(2)}</td>
            <td>${c.previous ? ((c.latest.avg_price - c.previous.avg_price) / c.previous.avg_price * 100).toFixed(2) + "%" : "—"}</td>
            <td><canvas id="spark-${c.card_id}" width="100" height="30"></canvas></td>
        `;
        tbody.appendChild(tr);

        const ctx = document.getElementById(`spark-${c.card_id}`).getContext("2d");
        new Chart(ctx, {
            type: "line",
            data: {
                labels: c.prices.map(p => p.date),
                datasets: [{
                    data: c.prices.map(p => p.avg_price),
                    borderColor: colors.pokeballBlue,
                    backgroundColor: "rgba(59,76,202,0.2)",
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
        });
    });

    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${Math.ceil(cardsData.length / pageSize)}`;
}

// -------------------------
// 8. PAGINATION
// -------------------------
document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; displayCards(); }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < Math.ceil(cardsData.length / pageSize)) { currentPage++; displayCards(); }
});

// -------------------------
// 9. TICKER
// -------------------------
async function populateTicker() {
    try {
        const { data } = await supabase
            .from("daily_prices")
            .select(`card_id, market, card_name, percentage_change`)
            .order("percentage_change", { ascending: false })
            .limit(50);

        const ticker = document.getElementById("tickerContent");
        if (!ticker) return;
        ticker.innerHTML = "";
        data.forEach(card => {
            const span = document.createElement("span");
            span.className = "tickerItem";
            span.textContent = `${card.card_name}: ${card.percentage_change.toFixed(2)}%`;
            ticker.appendChild(span);
        });
    } catch (err) {
        console.error("Error populating ticker:", err);
    }
}

// -------------------------
// 10. INDEX CHART
// -------------------------
async function renderCardIndexChart() {
    try {
        const { data } = await supabase.from("daily_prices").select("date, market");
        if (!data || data.length === 0) return;

        const ctx = document.getElementById("indexChart");
        if (!ctx) return;

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.date),
                datasets: [{
                    label: "Pokémon Card Index",
                    data: data.map(d => d.market),
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
                plugins: { legend: { display: true }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { ticks: { color: colors.pokeballBlue } },
                    y: { ticks: { color: colors.pokeballBlue } }
                }
            }
        });
    } catch (err) {
        console.error("Error rendering index chart:", err);
    }
}

// -------------------------
// INIT
// -------------------------
document.addEventListener("DOMContentLoaded", loadCards);

// Mobile menu toggle
const hamburger = document.getElementById("hamburger");
const navMenu = document.querySelector("#navbar nav ul");

hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("show");
});