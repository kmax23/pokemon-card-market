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
let setsData = [];
let sealedData = [];
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

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("pokeStocksDB", 1); // version 1

        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            // Create an object store for cards
            if (!db.objectStoreNames.contains("pokemon_data")) {
                db.createObjectStore("pokemon_data", { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

async function saveAllToDB(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("pokemon_data", "readwrite");
        const store = tx.objectStore("pokemon_data");
        store.put({ id: "all", ...data });
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);
    });
}

async function loadAllFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("pokemon_data", "readonly");
        const store = tx.objectStore("pokemon_data");
        const req = store.get("all");
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    });
}

async function loadAllData() {
    const loader = document.getElementById("loading-overlay");
    if (loader) loader.style.display = "flex";

    // 1. Try IndexedDB cache first
    const cached = await loadAllFromDB();
    if (cached?.cards && cached?.sets && cached?.sealed) {
        console.log("Loaded all data from IndexedDB");
        cardsData = cached.cards;
        setsData = cached.sets;
        sealedData = cached.sealed;
        if (loader) loader.style.display = "none";
        return;
    }

    console.log("Fetching cards from Supabase...");

    // --- Cards (last 90 days) ---
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toISOString();

    let allRows = [];
    let from = 0;
    const batchSize = 10000;

    while (true) {
        const { data, error } = await supabaseClient
            .from("card_prices")
            .select("card_id, card_name, set_id, set_name, rarity, market_price, date")
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
            set_id: latest.set_id,
            set_name: latest.set_name,
            rarity: latest.rarity,
            latest_price: latest.market_price,
            past_price: pastPrice.market_price,
            pctChange,
            history: sortedPrices
        };
    });

    // --- Sets ---
    const { data: sets, error: setsError } = await supabaseClient
        .from("set_with_values")
        .select("id, name, release_date, logo_url, symbol_url, market_value_total")
        .order("release_date", { ascending: false });

    if (setsError) {
        console.error("Error loading sets:", setsError);
    }
    setsData = sets || [];

    // --- Sealed Products ---
    const { data: sealed, error: sealedError } = await supabaseClient
        .from("sealed_prices")
        .select("sealed_id, sealed_name, market, date");

    if (sealedError) {
        console.error("Error loading sealed products:", sealedError);
    }
    sealedData = sealed || [];

    // 2. Save everything in one IndexedDB entry
    await saveAllToDB({
        cards: cardsData,
        sets: setsData,
        sealed: sealedData,
        timestamp: Date.now()
    });

    console.log("Saved cards, sets, and sealed to IndexedDB");

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
    if (!tbody) return; tbody.innerHTML = "";
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
         <td id="change-${c.card_id}" style="color: ${changeColor};">${pctChangeFormatted}</td>
         <td><canvas id="spark-${c.card_id}" width="120" height="30"></canvas></td>;
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
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            display: false
                        },
                        y: {
                            display: false
                        }
                    }
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
let pullRates = [];

async function fetchPullRates() {
    try {
        const response = await fetch("pull_rates.json");
        if (!response.ok) throw new Error("Failed to load pull_rates.json");
        pullRates = await response.json();
        console.log("✅ Pull rates loaded:", pullRates);
    } catch (err) {
        console.error("⚠️ Could not load pull rate data:", err);
    }
}
async function loadSets() {
    if (!Array.isArray(setsData)) {
        console.error("❌ setsData is not an array:", setsData);
        return;
    }
    try {
        if (!setsData || !setsData.length) return;
        const grid = document.getElementById("setsGrid");
        if (!grid) return;
        grid.innerHTML = "";

        setsData.forEach(set => {
            const rates = pullRates[String(set.id)] || {};

            const doubleAny = rates["Double Rare"]?.["Any Double Rare"] ?? "--";
            const doubleSpecific = rates["Double Rare"]?.["Specific Double Rare"] ?? "--";
            const ultraAny = rates["Ultra Rare"]?.["Any Ultra Rare"] ?? "--";
            const ultraSpecific = rates["Ultra Rare"]?.["Specific Ultra Rare"] ?? "--";
            const illustrationAny = rates["Illustration Rare"]?.["Any Illustration Rare"] ?? "--";
            const illustrationSpecific = rates["Illustration Rare"]?.["Specific Illustration Rare"] ?? "--";
            const specialIllustrationAny = rates["Special Illustration Rare"]?.["Any Special Illustration Rare"] ?? "--";
            const specialIllustrationSpecific = rates["Special Illustration Rare"]?.["Specific Special Illustration Rare"] ?? "--";
            const megaHyperAny = rates["Mega Hyper Rare"]?.["Any Mega Hyper Rare"] ?? "--";
            const megaHyperSpecific = rates["Mega Hyper Rare"]?.["Specific Mega Hyper Rare"] ?? "--";
            const secretRare = rates["Secret Rare Hit Rate"]?.["Chance of opening at least 1 Mega Hyper Rare, Special Illustration Rare, Illustration Rare, or Ultra Rare"] ?? "--";

            const card = document.createElement("div");
            card.className = "set-card";

            const logoHTML = set.logo_url
                ? `<img class="set-logo" src="${set.logo_url}" alt="${set.name} logo">`
                : `<div class="set-logo-placeholder">No Logo Yet</div>`;

            const symbolHTML = set.symbol_url
                ? `<img class="set-symbol" src="${set.symbol_url}" alt="${set.name} symbol">`
                : `<div class="set-symbol-placeholder">No Symbol Yet</div>`;

            const expandedId = `expanded-${set.id}`;
            const tbodyId = `setCardsBody-${set.id}`;

            card.innerHTML = `
                <!-- ROW 1: Logo -->
                <div class="set-row set-row-logo" style="text-align: center; margin-bottom: 0.5rem;">
                    ${logoHTML}
                </div>
                
                <!-- ROW 2: Symbol + Set Name -->
                <div class="set-row set-row-title" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;">
                    ${symbolHTML}
                    <h3 style="margin: 0;">${set.name}</h3>
                </div>
                
                <!-- ROW 3: Two columns -->
                <div class="set-row set-row-info" style="display: flex; justify-content: space-between; gap: 2rem;">
                    <!-- Left column: Total Market Value + Release Date -->
                    <div class="set-info-left" style="flex: 1; font-size: 1.6rem;">
                        <p><strong>Total Market Value:</strong> $${set.market_value_total?.toLocaleString() ?? "0"}</p>
                        <p><strong>Release Date:</strong> ${set.release_date ?? "—"}</p>
                    </div>

                    <!-- Right column: Pull Rates -->
                    <div class="set-info-right" style="flex: 1; text-align: center;">
                        <div class="pull-rate">
                            <p><strong>Double Rare:</strong><br>Any Double Rare: ${doubleAny}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Specific Double Rare: ${doubleSpecific}</p>
                            <p><strong>Ultra Rare:</strong><br>Any Ultra Rare: ${ultraAny}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Specific Ultra Rare: ${ultraSpecific}</p>
                            <p><strong>Illustration Rare:</strong><br>Any Illustration Rare: ${illustrationAny}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Specific Illustration Rare: ${illustrationSpecific}</p>
                            <p><strong>Special Illustration Rare:</strong><br>Any Special Illustration Rare: ${specialIllustrationAny}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Specific Special Illustration Rare: ${specialIllustrationSpecific}</p>
                            <p><strong>Mega Hyper Rare:</strong><br>Any Mega Hyper Rare: ${megaHyperAny}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Specific Mega Hyper Rare: ${megaHyperSpecific}</p>
                            <p><strong>Secret Rare Hit Rate:</strong> ${secretRare}</p>
                        </div>
                    </div>
                </div>
            `;

            // Toggle open/close on click
            card.addEventListener("click", () => {
                const expanded = card.classList.contains("expanded");
                const expandedCard = document.querySelector(".set-card.expanded");

                // Collapse currently expanded card
                if (expandedCard && expandedCard !== card) {
                    // move it back
                    const placeholder = expandedCard.dataset.placeholder;
                    if (placeholder) {
                        const ref = document.querySelector(`[data-placeholder-id="${placeholder}"]`);
                        if (ref) ref.replaceWith(expandedCard);
                    }
                    expandedCard.classList.remove("expanded");
                    expandedCard.querySelector(".set-cards-container")?.remove();
                }

                if (!expanded) {
                    // Create placeholder where the card was
                    const placeholder = document.createElement("div");
                    placeholder.dataset.placeholderId = Date.now().toString();
                    card.dataset.placeholder = placeholder.dataset.placeholderId;
                    grid.insertBefore(placeholder, card.nextSibling);

                    // Move the card to the top of the grid
                    grid.prepend(card);
                    card.classList.add("expanded");

                    // Create container for card table
                    let container = card.querySelector(".set-cards-container");
                    if (!container) {
                        container = document.createElement("div");
                        container.className = "set-cards-container";
                        container.innerHTML = `
                            <table class="set-card-table">
                                <thead>
                                    <tr>
                                        <th>Card Name</th>
                                        <th>Rarity</th>
                                        <th>Latest Price</th>
                                        <th>% Change</th>
                                        <th>Trend</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        `;
                        card.appendChild(container);
                    }

                    // Load cards into table
                    const tbody = container.querySelector("tbody");
                    loadSetCards(set.id, tbody);
                } else {
                    // Restore card to its placeholder position
                    const placeholderId = card.dataset.placeholder;
                    const ref = document.querySelector(`[data-placeholder-id="${placeholderId}"]`);
                    if (ref) ref.replaceWith(card);
                    card.classList.remove("expanded");

                    card.querySelector(".set-cards-container")?.remove();
                }
            });

            grid.appendChild(card);
        });
    } catch (err) {
        console.error("Error fetching sets:", err);
    }
}

function filterCardsBySet(setId) {
    const cards = cardsData.filter(c => String(c.set_id) === String(setId));
    filteredCards = cards;
    currentPage = 1;
    displayCards();
    const cardsTable = document.getElementById("cardTableBody");
    if (cardsTable) {
        cardsTable.scrollIntoView({ behavior: "smooth" });
    }
    return cards;
}

async function loadSetCards(setId, tbody, page = 1, pageSize = 25) {
    if (!tbody) return;

    const setCards = cardsData.filter(c => String(c.set_id) === String(setId));
    const start = (page - 1) * pageSize;
    const pagedCards = setCards.slice(start, start + pageSize);

    tbody.innerHTML = "";

    if (!pagedCards.length) {
        tbody.innerHTML = `<tr><td colspan="5">No cards found for this set</td></tr>`;
        return;
    }

    pagedCards.forEach(c => {
        const tr = document.createElement("tr");
        const changeColor = c.pctChange >= 0 ? "green" : "red";

        tr.innerHTML = `
            <td>${c.card_name}</td>
            <td>${c.rarity || "-"}</td>
            <td>$${c.latest_price?.toFixed(2) ?? "-"}</td>
            <td style="color:${changeColor};">${c.pctChange?.toFixed(2) ?? "0"}%</td>
            <td><canvas id="spark-${setId}-${c.card_id}" width="120" height="30"></canvas></td>
        `;

        tbody.appendChild(tr);

        if (c.history && c.history.length >= 2) {
            const ctx = document.getElementById(`spark-${setId}-${c.card_id}`).getContext("2d");
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

    // Pagination buttons inside expanded card
    const paginationDivId = `setPagination-${setId}`;
    let paginationDiv = document.getElementById(paginationDivId);
    if (!paginationDiv) {
        paginationDiv = document.createElement("div");
        paginationDiv.id = paginationDivId;
        paginationDiv.style.marginTop = "0.5rem";
        paginationDiv.style.textAlign = "center";
        tbody.parentNode.appendChild(paginationDiv);
    }
    paginationDiv.innerHTML = "";

    const totalPages = Math.ceil(setCards.length / pageSize);
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.disabled = i === page;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            loadSetCards(setId, tbody, i, pageSize);
        });
        paginationDiv.appendChild(btn);
    }
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
    console.log("✅ DOM loaded — initializing app...");

    await loadAllData();

    console.log("✅ loadAllData complete");
    console.log("cardsData:", cardsData?.length || 0, "setsData:", setsData?.length || 0, "sealedData:", sealedData?.length || 0);

    populateTicker();

    // Home Page
    if (document.getElementById("indexSection")) {
        console.log("🏠 Loading home page elements...");
        loadArticles();
        renderCardIndexChart();
    }

    // Cards Page
    if (document.getElementById("cardTableBody")) {
        console.log("📊 Loading cards page...");
        populateRarities();
        populateSets();
        displayCards();
        displayTopMovers();
    }

    // Sets Page
    if (document.getElementById("setsGrid")) {
        console.log("🧩 Loading sets page...");
        // Ensure we have sets
        if (!setsData || !setsData.length) {
            console.warn("⚠️ Sets data missing after loadAllData() — reloading...");
            await loadAllData();
            console.log("✅ Reload complete — setsData:", setsData?.length || 0);
        }

        if (!setsData || !setsData.length) {
            console.error("❌ Still no setsData — possible Supabase issue or empty cache.");
            return;
        }

        await fetchPullRates();
        loadSets();
        console.log("✅ loadSets() called successfully");
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