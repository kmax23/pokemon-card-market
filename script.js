// script.js

// -------------------------
// THEME TOGGLE
// -------------------------
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
// Fetch TCGplayer articles for home page
// -------------------------
function loadArticles() {
    let currentArticlePage = 1;
    const articlesPerPage = 24;

    const grid = document.querySelector(".articles-grid");
    if (!grid) return;

    fetch('articles.json')
        .then(response => response.json())
        .then(articles => {
            // Sort newest to oldest by date if your JSON has a sortable "date" field
            // articles.sort((a, b) => new Date(b.date) - new Date(a.date));

            function renderArticles() {
                const start = (currentArticlePage - 1) * articlesPerPage;
                const end = start + articlesPerPage;
                const grid = document.querySelector(".articles-grid");
                grid.innerHTML = "";

                articles.slice(start, end).forEach(article => {
                    const card = document.createElement("a");
                    card.classList.add("article-card");
                    card.href = article.link;
                    card.target = "_blank";
                    card.innerHTML = `
                    <div class="article-card__image">
                        <img src="${article.image}" alt="${article.title}">
                    </div>
                    <div class="article-card__content">
                        <h3 class="article-card__title">${article.title}</h3>
                        <p class="article-card__description">${article.description}</p>
                    </div>
                    <div class="article-card__footer">
                        <span class="article-card__author">By ${article.author}</span>
                        <span class="article-card__date">${article.date}</span>
                    </div>
                `;
                    grid.appendChild(card);
                });

                document.getElementById('page-number').textContent = currentArticlePage;
            }

            // Pagination buttons
            const nextButton = document.getElementById("next");
            if (nextButton) {
                nextButton.addEventListener("click", () => {
                    if (currentArticlePage * articlesPerPage < articles.length) {
                        currentArticlePage++;
                        renderArticles();
                    }
                });
            }

            const prevButton = document.getElementById("prev");
            if (prevButton) {
                prevButton.addEventListener("click", () => {
                    if (currentArticlePage > 1) {
                        currentArticlePage--;
                        renderArticles();
                    }
                });
            }

            renderArticles();
        })
}

// -------------------------
// Fetch data from card_prices and sealed_prices views
// -------------------------
async function fetchPrices() {
    const { data, error } = await supabaseClient
        .from("daily_index_prices_mv")
        .select("date, total_price")
        .order("date", { ascending: true });

    if (error) {
        console.error("Error fetching daily_index_prices_mv:", error);
        return { prices: [], lastUpdated: null };
    }

    const prices = data.map(row => ({
        date: row.date,
        total: row.total_price
    }));

    const lastUpdated = prices.length ? prices[prices.length - 1].date : null;

    console.log("Last Updated:", lastUpdated);

    return { prices, lastUpdated };
}

async function fetchCardHistory(cardId) {
    const { data, error } = await supabaseClient
        .from("card_prices")
        .select("date, market_price")
        .eq("card_id", cardId)
        .order("date", { ascending: true })
        .limit(90);

    if (error) {
        console.error(`Error fetching history for card ${cardId}:`, error);
        return [];
    }

    return data;
}

async function fetchTopMoversData() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

    const { data, error } = await supabaseClient
        .from("card_prices")
        .select("card_id, card_name, set_name, rarity, market_price, date")
        .order("date", { ascending: true });

    if (error) {
        console.error("Error fetching top movers data:", error);
        return [];
    }

    const cardsMap = {};
    data.forEach(row => {
        if (!cardsMap[row.card_id]) cardsMap[row.card_id] = [];
        cardsMap[row.card_id].push(row);
    });

    const topMoversData = Object.values(cardsMap).map(prices => {
        const latest = prices[prices.length - 1];
        const pastPrice = prices.find(p => new Date(p.date) <= ninetyDaysAgoISO) || prices[0];

        const pctChange = pastPrice.market_price
            ? ((latest.market_price - pastPrice.market_price) / pastPrice.market_price) * 100
            : 0;

        return {
            card_id: latest.card_id,
            card_name: latest.card_name,
            set_name: latest.set_name,
            rarity: latest.rarity,
            latest_price: latest.market_price,
            past_price: pastPrice.market_price,
            pctChange
        };
    });

    return topMoversData;
}

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
// LOAD ALL CARDS (with last 90 days)
// -------------------------
function populateRarities() {
    const raritySelect = document.getElementById("filterRarity");
    if (!raritySelect || !cardsData.length) return;

    const rarities = [...new Set(cardsData.map(c => c.rarity).filter(Boolean))].sort();

    raritySelect.innerHTML = '<option value="">All</option>';

    rarities.forEach(r => {
        const option = document.createElement("option");
        option.value = r.toLowerCase().trim();
        option.textContent = r;
        raritySelect.appendChild(option);
    })
}

function populateSets() {
    const setSelect = document.getElementById("filterSet");
    if (!setSelect || !cardsData.length) return;

    const sets = [...new Set(cardsData.map(c => c.set_name).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    setSelect.innerHTML = '<option value="">All</option>';

    sets.forEach(s => {
        const option = document.createElement("option");
        option.value = s.toLowerCase().trim();
        option.textContent = s;
        setSelect.appendChild(option);
    });
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("PokemonDB", 1); // version 1

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Create an object store for cards
            if (!db.objectStoreNames.contains("cards")) {
                db.createObjectStore("cards", { keyPath: "card_id" });
            }
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function saveCardsToDB(cards) {
    const db = await openDatabase();
    const tx = db.transaction("cards", "readwrite");
    const store = tx.objectStore("cards");

    // Clear old data
    store.clear();

    // Add new cards
    cards.forEach(card => store.put(card));

    return tx.complete; // Promise resolves when transaction is done
}

async function loadCardsFromDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("cards", "readonly");
        const store = tx.objectStore("cards");
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadAllCards() {
    // Show loader
    const loader = document.getElementById("loading-overlay");
    if (loader) loader.style.display = "flex";

    // 1. Check sessionStorage first
    const cached = await loadCardsFromDB();
    if (cached && cached.length > 0) {
        console.log("Loaded cards from IndexedDB");
        cardsData = cached;

        // Hide loader
        if (loader) loader.style.display = "none";
        return;
    }

    // 2. Otherwise, fetch from Supabase'
    console.log("Fetching cards from Supabase...");

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

    let allRows = [];
    let from = 0;
    const batchSize = 10000;

    while (true) {
        const { data, error } = await supabaseClient
            .from("card_prices")
            .select("card_id, card_name, set_name, rarity, market_price, date")
            .order("date", { ascending: true })
            .gte("date", ninetyDaysAgoISO)
            .range(from, from + batchSize - 1);

        if (error) {
            console.error("Error loading card prices:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        from += data.length;
        if (data.length < batchSize) break;
    }

    const cardsMap = {};
    allRows.forEach(row => {
        if (!cardsMap[row.card_id]) cardsMap[row.card_id] = [];
        cardsMap[row.card_id].push(row);
    });

    cardsData = Object.values(cardsMap).map(prices => {
        const sortedPrices = prices.sort((a, b) => new Date(a.date) - new Date(b.date));
        const latest = sortedPrices[sortedPrices.length - 1];
        const pastPrice = sortedPrices.find(p => new Date(p.date) <= ninetyDaysAgoISO) || sortedPrices[0];

        const pctChange = pastPrice.market_price
            ? ((latest.market_price - pastPrice.market_price) / pastPrice.market_price) * 100
            : 0;

        return {
            card_id: latest.card_id,
            card_name: latest.card_name,
            set_name: latest.set_name,
            rarity: latest.rarity,
            latest_price: latest.market_price,
            past_price: pastPrice.market_price,
            pctChange,
            history: sortedPrices
        };
    });

    // 3. Save processed data to sessionStorage
    await saveCardsToDB(cardsData);
    console.log("Saved cards to IndexedDB");

    // Hide loader
    if (loader) loader.style.display = "none";
}

// -------------------------
// DISPLAY TOP GAINERS / LOSERS
// -------------------------
function displayTopMovers() {
    const sorted = [...cardsData].sort((a, b) => b.pctChange - a.pctChange);
    const gainers = sorted.slice(0, 10);
    const losers = sorted.slice(-10).reverse();

    const gainersEl = document.getElementById("topGainers");
    const losersEl = document.getElementById("topLosers");
    if (!gainersEl || !losersEl) return;

    gainersEl.innerHTML = "";
    losersEl.innerHTML = "";

    gainers.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.card_name} (+${c.pctChange.toFixed(2)}%)`;
        gainersEl.appendChild(li);
    });

    losers.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.card_name} (${c.pctChange.toFixed(2)}%)`;
        losersEl.appendChild(li);
    });
}

// -------------------------
// DISPLAY CARDS TABLE
// -------------------------
let filteredCards = [];

function applyFilters() {
    const searchValue = document.getElementById("searchName")?.value.toLowerCase().trim() || "";
    const setValue = (document.getElementById("filterSet")?.value || "").toLowerCase().trim();
    const rarityValue = (document.getElementById("filterRarity")?.value || "").toLowerCase().trim();

    filteredCards = cardsData.filter(c => {
        const matchesName = c.card_name.toLowerCase().includes(searchValue);
        const matchesRarity = rarityValue ? (c.rarity || "").toLowerCase().trim() === rarityValue : true;
        const matchesSet = setValue ? (c.set_name || "").toLowerCase().trim() === setValue : true;
        return matchesName && matchesRarity && matchesSet;
    });

    currentPage = 1;
    displayCards();
}

document.getElementById("searchName")?.addEventListener("input", applyFilters);
document.getElementById("filterSet")?.addEventListener("change", applyFilters);
document.getElementById("filterRarity")?.addEventListener("change", applyFilters);

function displayCards() {
    const tbody = document.getElementById("cardTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const dataToShow = filteredCards.length ? filteredCards : cardsData;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = dataToShow.slice(start, end);

    pageData.forEach(c => {
        const pctChange = c.pctChange ?? 0;
        const pctChangeFormatted = pctChange.toFixed(2) + "%";
        const changeColor = pctChange >= 0 ? "green" : "red";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.card_name}</td>
            <td>${c.set_name || "-"}</td>
            <td>${c.rarity || "-"}</td>
            <td>$${c.latest_price.toFixed(2)}</td>
            <td id="change-${c.card_id}" style="color: ${changeColor};">${pctChangeFormatted}%</td>
            <td><canvas id="spark-${c.card_id}" width="120" height="30"></canvas></td>
        `;

        tbody.appendChild(tr);

        if (c.history && c.history.length >= 2) {
            const ctx = document.getElementById(`spark-${c.card_id}`).getContext("2d");
            new Chart(ctx, {
                type: "line",
                data: {
                    labels: c.history.map(h => h.date),
                    datasets: [{
                        data: c.history.map(h => parseFloat(h.market_price)),
                        borderColor: colors.pokeballBlue,
                        backgroundColor: "rgba(59,76,202,0.2)",
                        tension: 0.3,
                        pointRadius: 0,
                        fill: false
                    }]
                },
                options: {
                    responsive: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                }
            });
        }
    });

    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${Math.ceil(dataToShow.length / pageSize)}`;
}

// -------------------------
// PAGINATION
// -------------------------
document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; displayCards(); }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < Math.ceil(cardsData.length / pageSize)) { currentPage++; displayCards(); }
});

// -------------------------
// TICKER (uses 90-day pctChange)
// -------------------------
function populateTicker() {
    const ticker = document.getElementById("tickerContent");
    if (!ticker) return;
    ticker.innerHTML = "";

    const topCards = cardsData
        .sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
        .slice(0, 50);

    topCards.forEach(c => {
        const span = document.createElement("span");
        span.className = "tickerItem " + (c.pctChange >= 0 ? "positive" : "negative");
        span.textContent = `${c.card_name}: ${c.pctChange.toFixed(2)}%`;
        ticker.appendChild(span);
    });
}

// -------------------------
// 10. INDEX CHART
// -------------------------
let indexChartInstance;

async function renderCardIndexChart() {
    const { prices, lastUpdated } = await fetchPrices();
    const ctx = document.getElementById("indexChart").getContext("2d");

    if (indexChartInstance) {
        indexChartInstance.destroy();
    }

    // Prepare dataset for progressive animation
    const chartData = prices.map(d => d.total);

    // Animation configuration
    const totalDuration = 10000;
    const delayBetweenPoints = chartData.length ? totalDuration / chartData.length : 0;
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

    const lastUpdatedPlugin = {
        id: 'lastUpdatedPlugin',
        afterDraw: (chart) => {
            if (!lastUpdated) return;
            const { ctx, chartArea } = chart;
            ctx.save();
            ctx.fillStyle = colors.charizardRed; // or any color you want
            ctx.font = 'bold 12px Fredoka One, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            const text = `Last Updated: ${new Date(lastUpdated).toLocaleString()}`;
            ctx.fillText(text, chartArea.right, chartArea.top - 10); // slightly above chart area
            ctx.restore();
        }
    };

    indexChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: prices.map(d => d.date),
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
        },
        plugins: [lastUpdatedPlugin]
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
document.addEventListener("DOMContentLoaded", async () => {
    await loadAllCards();
    populateTicker();

    // Home Page
    if (document.body.contains(document.getElementById("indexSection"))) {
        loadArticles();
        renderCardIndexChart();
    }

    if (document.body.contains(document.getElementById("cardTableBody"))) {
        populateRarities();
        populateSets();
        displayCards();
        displayTopMovers();
    }
});

// -------------------------
// MOBILE MENU TOGGLE
// -------------------------
const hamburger = document.getElementById("hamburger");
const navMenu = document.querySelector("#navbar nav ul");

if (hamburger) {
    hamburger.addEventListener("click", () => {
        hamburger.classList.toggle("active");
        navMenu.classList.toggle("show");
    });
}