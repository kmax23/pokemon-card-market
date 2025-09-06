// script.js

const API_KEY = 'ae52bd98-3712-42b9-a7fa-8d1e03f2ff21'; // Replace with your API key
const BASE_URL = 'https://api.pokemontcg.io/v2/cards';
const SET_ID = 'base1'; // Only fetch Base Set cards
const PAGE_SIZE = 250; // Max allowed

// Helper function to fetch all Base Set cards with pagination
async function fetchAllBaseSetCards() {
    let allCards = [];
    let page = 1;
    let totalPages = 1;

    do {
        const response = await fetch(`${BASE_URL}?q=set.id:${SET_ID}&page=${page}&pageSize=${PAGE_SIZE}`, {
            headers: {
                'X-Api-Key': API_KEY
            }
        });
        const data = await response.json();
        allCards = allCards.concat(data.data);
        const totalCount = data.totalCount;
        totalPages = Math.ceil(totalCount / PAGE_SIZE);
        page++;
    } while (page <= totalPages);

    return allCards;
}

// Render the card table
function renderCardTable(cards) {
    const tableBody = document.querySelector('#cardTable tbody');
    tableBody.innerHTML = '';

    cards.forEach(card => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        nameCell.textContent = card.name;

        const setCell = document.createElement('td');
        setCell.textContent = card.set.name ? card.set.name.join(', ') : '';

        const rarityCell = document.createElement('td');
        rarityCell.textContent = card.rarity || '';

        const priceCell = document.createElement('td');
        const price = card.tcgplayer?.prices?.normal?.market || 'N/A';
        priceCell.textContent = price;

        row.appendChild(nameCell);
        row.appendChild(setCell);
        row.appendChild(rarityCell);
        row.appendChild(priceCell);

        tableBody.appendChild(row);
    });
}

// Render a simple price trend chart (example using Chart.js)
function renderPriceChart(cards) {
    const ctx = document.getElementById('cardChart').getContext('2d');

    const labels = cards.map(c => c.name);
    const prices = cards.map(c => c.tcgplayer?.prices?.normal?.market || 0);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Market Price (USD)',
                data: prices,
                backgroundColor: '#38D9A9'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Initialize the page
async function init() {
    try {
        const cards = await fetchAllBaseSetCards();
        renderCardTable(cards);
        renderPriceChart(cards);
    } catch (error) {
        console.error('Error fetching cards:', error);
    }
}

// Run initialization on page load
window.addEventListener('DOMContentLoaded', init);
