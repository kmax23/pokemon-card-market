// Sample card data
let cards = [
    {
        name: "Pikachu Illustrator",
        set: "1998 Illustration Contest",
        prices: [5000000, 5100000, 5200000, 5275000],
        affiliateLink: "#"
    },
    {
        name: "Charizard",
        set: "1st Edition Shadowless Holo",
        prices: [400000, 410000, 415000, 420000],
        affiliateLink: "#"
    },
    {
        name: "Blastoise",
        set: "Commissioned Presentation Galaxy Star Holo",
        prices: [350000, 355000, 358000, 360000],
        affiliateLink: "#"
    },
    {
        name: "Kangaskhan-Holo #115",
        set: "Family Event Trophy Card",
        prices: [65000, 67000, 68000, 68321],
        affiliateLink: "#"
    },
    {
        name: "Charizard",
        set: "Japanese No Rarity Symbol Holo",
        prices: [300000, 310000, 320000, 324000],
        affiliateLink: "#"
    },
    {
        name: "Lapras",
        set: "1st Edition Fossil",
        prices: [5, 5.2, 5.3, 5],
        affiliateLink: "#"
    },
    {
        name: "Ralts",
        set: "Sword & Shield",
        prices: [0.25, 0.3, 0.35, 0.25],
        affiliateLink: "#"
    },
    {
        name: "Magnemite",
        set: "Sword & Shield",
        prices: [0.3, 0.28, 0.32, 0.3],
        affiliateLink: "#"
    },
    {
        name: "Basic Energy",
        set: "Various",
        prices: [0.15, 0.16, 0.14, 0.15],
        affiliateLink: "#"
    },
    {
        name: "Potion",
        set: "Base Set",
        prices: [0.5, 0.45, 0.55, 0.5],
        affiliateLink: "#"
    },
    {
        name: "Charizard V",
        set: "Champion's Path",
        prices: [399, 405, 410, 420],
        affiliateLink: "#"
    },
    {
        name: "Pikachu VMAX",
        set: "Vivid Voltage",
        prices: [2.0, 2.2, 2.3, 2.46],
        affiliateLink: "#"
    },
    {
        name: "Gyarados Holo",
        set: "Base Set",
        prices: [150, 155, 160, 162],
        affiliateLink: "#"
    },
    {
        name: "Mewtwo Holo",
        set: "Base Set",
        prices: [220, 225, 230, 235],
        affiliateLink: "#"
    },
    {
        name: "Clefairy Holo",
        set: "Base Set",
        prices: [120, 118, 122, 125],
        affiliateLink: "#"
    },
    {
        name: "Hitmonchan Holo",
        set: "Base Set",
        prices: [95, 100, 98, 102],
        affiliateLink: "#"
    },
    {
        name: "Snorlax Holo",
        set: "Jungle",
        prices: [85, 90, 88, 92],
        affiliateLink: "#"
    }
];

// Self-drawing line plugin
const revealLinePlugin = {
    id: 'revealLine',
    afterDatasetsDraw(chart, _args, opts) {
        const meta = chart.getDatasetMeta(0);
        const points = meta?.data ?? [];
        if (!points.length) return;

        const ctx = chart.ctx;
        const t = chart.$revealT ?? 0;              // 0 → 1 progress
        const segs = points.length - 1;
        const exact = segs * t;
        const whole = Math.floor(exact);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i <= whole; i++) ctx.lineTo(points[i].x, points[i].y);

        // Partial last segment
        if (whole < segs) {
            const p0 = points[whole], p1 = points[whole + 1];
            const frac = exact - whole;
            const x = p0.x + (p1.x - p0.x) * frac;
            const y = p0.y + (p1.y - p0.y) * frac;
            ctx.lineTo(x, y);
        }

        ctx.strokeStyle = opts?.color || '#0074D9';
        ctx.lineWidth = opts?.lineWidth || 2;
        ctx.stroke();
        ctx.restore();
    }
};
Chart.register(revealLinePlugin);

function updateTopMovers(cards) {
    // Compute latest % change for each card
    const changes = cards.map(card => {
        const latest = card.prices[card.prices.length - 1];
        const prev = card.prices[card.prices.length - 2] || latest;
        const change = ((latest - prev) / prev) * 100;
        return { name: card.name, change: change, price: latest, prices: card.prices };
    });

    // Top 5 gainers
    const gainers = changes
        .filter(c => c.change > 0)
        .sort((a, b) => b.change - a.change)
        .slice(0, 5);

    // Top 5 losers
    const losers = changes
        .filter(c => c.change < 0)
        .sort((a, b) => a.change - b.change)
        .slice(0, 5);

    // Function to populate a list with mini sparklines
    function populateList(listDiv, cardsArray, isGainer) {
        listDiv.innerHTML = '';
        cardsArray.forEach((c, index) => {
            const barContainer = document.createElement('div');
            barContainer.style.display = 'flex';
            barContainer.style.alignItems = 'center';
            barContainer.style.marginBottom = '6px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = c.name;
            nameSpan.style.flex = '1';

            // Mini sparkline canvas
            const canvas = document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 20;
            const ctx = canvas.getContext('2d');

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: c.prices.map((_, i) => i + 1),
                    datasets: [{
                        data: c.prices,
                        borderColor: isGainer ? 'green' : 'red',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                }
            });

            barContainer.appendChild(nameSpan);
            barContainer.appendChild(canvas);
            listDiv.appendChild(barContainer);
        });
    }

    populateList(document.getElementById('topGainers'), gainers, true);
    populateList(document.getElementById('topLosers'), losers, false);
}

function highlightPortfolioInMovers(portfolioCards) {
    const allCards = portfolioCards.map(c => c.name);
    ['topGainers', 'topLosers'].forEach(id => {
        const div = document.getElementById(id);
        div.querySelectorAll('div > span').forEach(span => {
            if (allCards.includes(span.textContent)) {
                span.style.fontWeight = 'bold';
                span.style.textDecoration = 'underline';
            }
        });
    });
}

function addCardRow(card, index, tbody) {
    const currentPrice = card.prices[card.prices.length - 1];
    const previousPrice = card.prices[card.prices.length - 2] || currentPrice;
    const changeValue = ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2);
    const changeArrow = changeValue >= 0 ? '▲' : '▼';
    const changeColor = changeValue >= 0 ? 'green' : 'red';

    // Create row
    const row = document.createElement('tr');

    const bgColor = changeValue >= 0 ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)';
    row.style.backgroundColor = bgColor;

    row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = 'rgba(255,230,0,0.2)';
        updateCardChart(card);
    });

    row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = bgColor
    });

    const cardCell = document.createElement('td');
    cardCell.textContent = card.name;

    const setCell = document.createElement('td');
    setCell.textContent = card.set;

    const priceCell = document.createElement('td');
    priceCell.textContent = `$${currentPrice.toFixed(2)}`;

    const changeCell = document.createElement('td');
    changeCell.style.color = changeColor;
    changeCell.textContent = `${changeArrow} ${Math.abs(changeValue)}%`;

    // Trend cell with sparkline
    const trendCell = document.createElement('td');
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 40;
    trendCell.appendChild(canvas);

    const buyCell = document.createElement('td');
    buyCell.innerHTML = `<a href="${card.affiliateLink}" target="_blank">Buy</a>`;

    row.appendChild(cardCell);
    row.appendChild(setCell);
    row.appendChild(priceCell);
    row.appendChild(changeCell);
    row.appendChild(trendCell);
    row.appendChild(buyCell);

    // Hover updates main chart
    row.addEventListener('mouseenter', () => updateCardChart(card));

    tbody.appendChild(row);

    // Draw sparkline
    const ctxSpark = canvas.getContext('2d');
    new Chart(ctxSpark, {
        type: 'line',
        data: {
            labels: card.prices.map((_, i) => i + 1),
            datasets: [{
                data: card.prices,
                borderColor: changeValue >= 0 ? 'green' : 'red',
                backgroundColor: 'transparent',
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// --- START: Search & Sort Functionality ---

// Store currently displayed cards (after search)
let displayedCards = [...cards];

// Filter table based on search input
document.getElementById('cardSearch').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    displayedCards = cards.filter(card =>
        card.name.toLowerCase().includes(query) ||
        card.set.toLowerCase().includes(query)
    );
    populateTable(displayedCards);
});

// Make table headers sortable
document.querySelectorAll('#cardTable th').forEach((th, index) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
        const keyMap = ['name', 'set', 'currentPrice', 'changeValue']; // map columns to card property
        let key;
        if (index === 0) key = 'name';
        else if (index === 1) key = 'set';
        else if (index === 2) key = 'currentPrice';
        else if (index === 3) key = 'changeValue';
        else return;

        displayedCards.sort((a, b) => {
            // Compute latest price & change for comparison
            const aPrice = a.prices[a.prices.length - 1];
            const aPrev = a.prices[a.prices.length - 2] || aPrice;
            const aChange = ((aPrice - aPrev) / aPrev * 100);

            const bPrice = b.prices[b.prices.length - 1];
            const bPrev = b.prices[b.prices.length - 2] || bPrice;
            const bChange = ((bPrice - bPrev) / bPrev * 100);

            if (key === 'name' || key === 'set') return a[key].localeCompare(b[key]);
            else if (key === 'currentPrice') return bPrice - aPrice; // descending
            else if (key === 'changeValue') return Math.abs(bChange) - Math.abs(aChange); // biggest movers
        });

        populateTable(displayedCards);
    });
});

// --- END: Search & Sort Functionality ---

// Function to populate table
function populateTable(cards) {
    const tbody = document.querySelector('#cardTable tbody');
    tbody.innerHTML = '';

    // Sort cards by latest % change descending (biggest movers first)
    const sortedCards = [...cards].sort((a, b) => {
        const aPrice = a.prices[a.prices.length - 1];
        const aPrev = a.prices[a.prices.length - 2] || aPrice;
        const aChange = ((aPrice - aPrev) / aPrev) * 100;

        const bPrice = b.prices[b.prices.length - 1];
        const bPrev = b.prices[b.prices.length - 2] || bPrice;
        const bChange = ((bPrice - bPrev) / bPrev) * 100;

        return Math.abs(bChange) - Math.abs(aChange); // sort by magnitude
    });

    sortedCards.forEach((card, index) => {
        addCardRow(card, index, tbody);
    });
}

function updateMarketSnapshot(cards) {
    const totalCards = cards.length;
    const latestPrices = cards.map(c => c.prices[c.prices.length - 1]);
    const prevPrices = cards.map(c => c.prices[c.prices.length - 2] || c.prices[c.prices.length - 1]);

    // Average price
    const avgPrice = (latestPrices.reduce((a, b) => a + b, 0) / totalCards).toFixed(2);

    // Compute % changes for each card
    const changes = cards.map((c, i) => {
        const change = ((latestPrices[i] - prevPrices[i]) / prevPrices[i]) * 100;
        return { name: c.name, change: change.toFixed(2) };
    });

    // Biggest gainer
    const gainer = changes.reduce((prev, curr) => curr.change > prev.change ? curr : prev, changes[0]);
    // Biggest loser
    const loser = changes.reduce((prev, curr) => curr.change < prev.change ? curr : prev, changes[0]);

    // Update HTML
    document.getElementById('totalCards').textContent = totalCards;
    document.getElementById('avgPrice').textContent = avgPrice;

    const gainerEl = document.getElementById('biggestGainer');
    gainerEl.textContent = `${gainer.name} (${gainer.change}%)`;
    gainerEl.style.color = 'green';

    const loserEl = document.getElementById('biggestLoser');
    loserEl.textContent = `${loser.name} (${loser.change}%)`;
    loserEl.style.color = 'red';
}

// Function to update big chart
let cardChartInstance;

function updateCardChart(card) {
    const ctx = document.getElementById('cardChart').getContext('2d');

    const minVal = Math.min(...card.prices) * 0.95;
    const maxVal = Math.max(...card.prices) * 1.05;

    if (cardChartInstance) cardChartInstance.destroy();

    const totalDuration = 3000;
    const delayBetweenPoints = totalDuration / card.prices.length;

    const previousY = (ctx) => {
        if (ctx.index === 0) return ctx.chart.scales.y.getPixelForValue(card.prices[0]);
        const prevMeta = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1];
        return prevMeta ? prevMeta.getProps(['y'], true).y : ctx.chart.scales.y.getPixelForValue(card.prices[0]);
    };

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

    cardChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: card.prices.map((_, i) => i + 1),
            datasets: [{
                data: card.prices.map((y, x) => ({ x, y })),
                borderColor: '#0074D9',
                backgroundColor: 'transparent',
                tension: 0.35,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false, type: 'linear' },
                y: { display: false, suggestedMin: minVal, suggestedMax: maxVal }
            }
        }
    });
}



// Pokémon Card Index (average of all card prices)
function drawCardIndex(cards) {
    const latestPrices = cards.map(c => c.prices[c.prices.length - 1]);
    const prevPrices = cards.map(c => c.prices[c.prices.length - 2] || c.prices[c.prices.length - 1]);

    const totalLatest = latestPrices.reduce((a, b) => a + b, 0);
    const totalPrev = prevPrices.reduce((a, b) => a + b, 0);
    const change = ((totalLatest - totalPrev) / totalPrev * 100).toFixed(2);

    const color = change >= 0 ? 'green' : 'red';
    const arrow = change >= 0 ? '▲' : '▼';

    // Only update the text, not the canvas
    document.getElementById('indexText').innerHTML = `
    Pokémon Card Index: <span style="color:${color}">${arrow} ${Math.abs(change)}%</span>
  `;

    const ctxIndex = document.getElementById('indexChart').getContext('2d');
    // Destroy existing chart if exists
    if (window.indexChartInstance) window.indexChartInstance.destroy();

    window.indexChartInstance = new Chart(ctxIndex, {
        type: 'line',
        data: {
            labels: cards.map(c => c.name),
            datasets: [{
                label: 'Card Index',
                data: latestPrices,
                borderColor: color,
                backgroundColor: 'transparent',
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: "easeInOutQuart"
            },
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    displayedCards = [...cards];
    // Initialize table and chart
    populateTable(displayedCards);
    updateCardChart(cards[0]); // Show first card initially
    // Draw index on page load
    drawCardIndex(cards);
    updateMarketSnapshot(cards);
    updateTopMovers(cards);
    highlightPortfolioInMovers(displayedCards);
});