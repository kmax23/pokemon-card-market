// script.js

// THEME TOGGLE — place near the top of script.js (or in its own small module)
// Immediately run so theme is correct before UI paints
(function () {
    const KEY = "theme";
    const checkbox = document.getElementById("themeToggle");

    // If checkbox isn't in DOM yet, wait for DOMContentLoaded then run
    function attach() {
        const cb = checkbox || document.getElementById("themeToggle");
        if (!cb) {
            console.warn("Theme toggle not found (#themeToggle).");
            return;
        }

        const apply = (theme) => {
            if (theme === "dark") {
                document.documentElement.classList.add("dark");
                cb.checked = true;
            } else {
                document.documentElement.classList.remove("dark");
                cb.checked = false;
            }
        };

        // Initialize from localStorage, else system preference
        const saved = localStorage.getItem(KEY);
        if (saved === "dark" || saved === "light") {
            apply(saved);
        } else {
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            apply(prefersDark ? "dark" : "light");
        }

        // Toggle handler
        cb.addEventListener("change", () => {
            const theme = cb.checked ? "dark" : "light";
            apply(theme);
            localStorage.setItem(KEY, theme);
            console.log(`Theme set to ${theme}`);
        });

        // Optional: update if user changes system preference and they haven't explicitly set a preference
        if (window.matchMedia) {
            const mq = window.matchMedia("(prefers-color-scheme: dark)");
            mq.addEventListener?.("change", (e) => {
                if (!localStorage.getItem(KEY)) {
                    apply(e.matches ? "dark" : "light");
                }
            });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach);
    else attach();
})();

// -------------------------
// 1. SUPABASE INIT
// -------------------------
const supabaseUrl = "https://qptdfdlkrifcombblzaw.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdGRmZGxrcmlmY29tYmJsemF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTA1NTEsImV4cCI6MjA3MjY2NjU1MX0.uEasItbNGXXNwl5bb_8YHYgaUkh9rUC9chfisMaaA-o";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// -------------------------
// Fetch data from card_prices and sealed_prices views
// -------------------------
async function fetchPrices() {
    const { data, error } = await supabaseClient
        .from("daily_index_prices")
        .select("date, total_price")
        .order("date", { ascending: true });

    if (error) {
        console.error("Error fetching daily_index_prices:", error);
        return [];
    }

    return data.map(row => ({
        date: row.date,
        total: row.total_price
    }));
}

async function testFetch() {
    const { data, error } = await supabaseClient
        .from("daily_index_prices")
        .select("*")
        .limit(5);
    console.log({ data, error });
}
testFetch();


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
// 5. FETCH CARDS (optimized)
// -------------------------
async function loadCards() {
    try {
        const { data, error } = await supabaseClient
            .from("card_prices")
            .select("card_id, card_name, set_name, rarity, market_price, date")
            .order("date", { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) return;

        // Group by card_id
        const grouped = {};
        data.forEach(d => {
            const id = d.card_id ?? d.card_id?.toString();
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push({
                date: d.date,
                market_price: parseFloat(d.market_price ?? 0)
            });
        });

        cardsData = Object.values(
            data.reduce((acc, row) => {
                if (!acc[row.card_id]) {
                    acc[row.card_id] = {
                        card_id: row.card_id,
                        card_name: row.card_name,
                        set_name: row.set_name,
                        rarity: row.rarity,
                        prices: []
                    };
                }
                acc[row.card_id].prices.push({
                    date: row.date,
                    market_price: parseFloat(row.market_price)
                });
                return acc;
            }, {})
        ).map(c => {
            // Sort prices ascending
            c.prices.sort((a, b) => new Date(a.date) - new Date(b.date));

            const latest = c.prices[c.prices.length - 1];

            // Find the previous price from a different day than latest
            const previous = c.prices
                .slice(0, -1)               // exclude latest
                .reverse()                   // start from most recent
                .find(p => new Date(p.date).toDateString() !== new Date(latest.date).toDateString())
                || null;

            // Compute daily % change
            const pctChange = previous
                ? ((latest.market_price - previous.market_price) / previous.market_price) * 100
                : null;

            return {
                ...c,
                latest,
                previous,
                pctChange
            };
        });


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
        .map(c => ({ ...c, pctChange: ((c.latest.market_price - c.previous.market_price) / c.previous.market_price) * 100 }))
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

function displayCards() {
    const tbody = document.getElementById("cardTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = cardsData.slice(start, end);

    pageData.forEach(c => {
        // Ensure latest and previous exist
        const latest = c.prices[c.prices.length - 1];
        const previous = c.prices.length > 1 ? c.prices[c.prices.length - 2] : latest;

        const pctChange = previous.market_price
            ? ((latest.market_price - previous.market_price) / previous.market_price) * 100
            : 0;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.card_name}</td>
            <td>${c.set_name || "-"}</td>
            <td>${c.rarity || "-"}</td>
            <td>$${c.latest.market_price.toFixed(2)}</td>
            <td>${c.pctChange !== null ? c.pctChange.toFixed(2) + "%" : "—"}</td>
            <td><canvas id="spark-${c.card_id}" width="100" height="30"></canvas></td>
        `;
        tbody.appendChild(tr);

        const ctx = document.getElementById(`spark-${c.card_id}`).getContext("2d");
        new Chart(ctx, {
            type: "line",
            data: {
                labels: c.prices.map(p => p.date),
                datasets: [{
                    data: c.prices.map(p => p.market_price),
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
// 9. TICKER (optimized)
// -------------------------
function populateTicker() {
    try {
        const ticker = document.getElementById("tickerContent");
        if (!ticker) return;
        ticker.innerHTML = "";

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - 30);
        targetDate.setHours(0, 0, 0, 0);

        const topCards = cardsData
            .map(c => {
                const prevPrice = c.prices
                    .filter(p => new Date(p.date) <= targetDate)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

                if (!prevPrice || prevPrice.market_price === 0) return null;

                const pctChange = ((c.latest.market_price - prevPrice.market_price) / prevPrice.market_price) * 100;

                return {
                    name: c.card_name,
                    pctChange
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.pctChange - a.pctChange)
            .slice(0, 50);

        // Render ticker
        ticker.innerHTML = "";
        topCards.forEach(c => {
            const span = document.createElement("span");
            span.className = "tickerItem " + (c.pctChange >= 0 ? "positive" : "negative");
            span.textContent = `${c.card_name}: ${c.previous ? ((c.latest.market_price - c.previous.market_price) / c.previous.market_price * 100).toFixed(2) + "%" : "—"}`;
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
    const data = await fetchPrices();
    const ctx = document.getElementById("indexChart").getContext("2d");

    // Prepare dataset for progressive animation
    const chartData = data.map(d => d.total);

    // Animation configuration
    const totalDuration = 10000;
    const delayBetweenPoints = totalDuration / chartData.length;
    const previousY = (ctx) =>
        ctx.index === 0
            ? ctx.chart.scales.y.getPixelForValue(100)
            : ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1].getProps(['y'], true).y;

    const animation = {
        x: {
            type: 'number',
            easing: 'linear',
            duration: delayBetweenPoints,
            from: NaN,
            delay(ctx) {
                if (ctx.type !== 'data' || ctx.xStarted) return 0;
                ctx.xStarted = true;
                return ctx.index * delayBetweenPoints;
            }
        },
        y: {
            type: 'number',
            easing: 'linear',
            duration: delayBetweenPoints,
            from: previousY,
            delay(ctx) {
                if (ctx.type !== 'data' || ctx.yStarted) return 0;
                ctx.yStarted = true;
                return ctx.index * delayBetweenPoints;
            }
        }
    };

    new Chart(ctx, {
        type: "line",
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: "Pokémon Market Index",
                data: chartData,
                borderColor: colors.bulbasaurTeal,
                backgroundColor: colors.electricHover,
                fill: true,
                tension: 0.2,
                radius: 0
            }]
        },
        options: {
            animation,
            responsive: true,
            plugins: {
                tooltip: {
                    mode: "index",
                    intersect: false,
                },
                legend: {
                    display: true
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Date" },
                },
                y: {
                    title: { display: true, text: "Total Price (USD)" },
                    beginAtZero: false
                }
            }
        }
    });
}

// -------------------------
// 11. FETCH SETS
// -------------------------
async function loadSets() {
    try {
        const { data, error } = await supabaseClient
            .from("daily_set_prices") // <-- your Supabase table for sets
            .select(`
                set_id,
                date,
                avg_price,
                set:sets(name, release_date, block)
            `)
            .order("date", { ascending: false });

        if (error) throw error;

        const grouped = {};
        data.forEach(d => {
            if (!grouped[d.set_id]) grouped[d.set_id] = [];
            grouped[d.set_id].push(d);
        });

        const setsData = Object.entries(grouped).map(([id, prices]) => ({
            set_id: id,
            set: prices[0].set,
            prices: prices.sort((a, b) => new Date(a.date) - new Date(b.date)),
            latest: prices[0],
            previous: prices[1] || null
        }));

        displaySets(setsData);
    } catch (err) {
        console.error("Error loading sets:", err);
    }
}

function displaySets(setsData) {
    const tbody = document.getElementById("setsTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    setsData.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${s.set.name}</td>
            <td>${s.set.release_date || "—"}</td>
            <td>$${s.latest.avg_price.toFixed(2)}</td>
            <td>${s.previous ? ((s.latest.avg_price - s.previous.avg_price) / s.previous.avg_price * 100).toFixed(2) + "%" : "—"}</td>
            <td><canvas id="spark-set-${s.set_id}" width="100" height="30"></canvas></td>
        `;
        tbody.appendChild(tr);

        const ctx = document.getElementById(`spark-set-${s.set_id}`).getContext("2d");
        new Chart(ctx, {
            type: "line",
            data: {
                labels: s.prices.map(p => p.date),
                datasets: [{
                    data: s.prices.map(p => p.avg_price),
                    borderColor: colors.bulbasaurTeal,
                    backgroundColor: "rgba(77,182,172,0.2)",
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
        });
    });
}

// -------------------------
// 12. FETCH SEALED PRODUCTS
// -------------------------
async function loadSealed() {
    try {
        const { data, error } = await supabaseClient
            .from("daily_sealed_prices") // <-- your Supabase table for sealed
            .select(`
                product_id,
                date,
                market_price,
                product:sealed(name, type, release_set)
            `)
            .order("date", { ascending: false });

        if (error) throw error;

        const grouped = {};
        data.forEach(d => {
            if (!grouped[d.product_id]) grouped[d.product_id] = [];
            grouped[d.product_id].push(d);
        });

        const sealedData = Object.entries(grouped).map(([id, prices]) => ({
            product_id: id,
            product: prices[0].product,
            prices: prices.sort((a, b) => new Date(a.date) - new Date(b.date)),
            latest: prices[0],
            previous: prices[1] || null
        }));

        displaySealed(sealedData);
    } catch (err) {
        console.error("Error loading sealed products:", err);
    }
}

function displaySealed(sealedData) {
    const tbody = document.getElementById("sealedTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    sealedData.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${p.product.name}</td>
            <td>${p.product.type}</td>
            <td>${p.product.release_set || "—"}</td>
            <td>$${p.latest.market_price.toFixed(2)}</td>
            <td>${p.previous ? ((p.latest.market_price - p.previous.market_price) / p.previous.market_price * 100).toFixed(2) + "%" : "—"}</td>
            <td><canvas id="spark-sealed-${p.product_id}" width="100" height="30"></canvas></td>
        `;
        tbody.appendChild(tr);

        const ctx = document.getElementById(`spark-sealed-${p.product_id}`).getContext("2d");
        new Chart(ctx, {
            type: "line",
            data: {
                labels: p.prices.map(pr => pr.date),
                datasets: [{
                    data: p.prices.map(pr => pr.market_price),
                    borderColor: colors.charizardRed,
                    backgroundColor: "rgba(255,28,28,0.2)",
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
        });
    });
}

// -------------------------
// INIT
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
    if (document.body.contains(document.getElementById("indexChart"))) {
        renderCardIndexChart();
    }
    if (document.body.contains(document.getElementById("cardTableBody"))) {
        loadCards();
    } else if (document.body.contains(document.getElementById("setsTableBody"))) {
        loadSets();
    } else if (document.body.contains(document.getElementById("sealedTableBody"))) {
        loadSealed();
    }
});

// Mobile menu toggle
const hamburger = document.getElementById("hamburger");
const navMenu = document.querySelector("#navbar nav ul");

if (hamburger) {
    hamburger.addEventListener("click", () => {
        hamburger.classList.toggle("active");
        navMenu.classList.toggle("show");
    });
}