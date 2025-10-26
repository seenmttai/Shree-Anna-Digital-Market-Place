import { supabase, getCurrentUser, getAuctions, createAuction, placeBid } from './supabase-client.js';

let currentUser = null;
let auctions = [];
let filteredAuctions = [];

async function init() {
    currentUser = await getCurrentUser();
    updateUI();
    setupEventListeners();
    await loadAuctions();
}

function updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    if (currentUser) {
        loginBtn.textContent = 'Dashboard';
        loginBtn.onclick = () => location.href = 'dashboard.html';
    }
}

async function loadAuctions() {
    const spinner = document.getElementById('loadingSpinner');
    spinner.classList.add('active');

    const statusFilter = document.getElementById('statusFilter').value;
    const { data, error } = await getAuctions({ status: statusFilter });

    spinner.classList.remove('active');

    if (error) {
        console.error('Error loading auctions:', error);
        alert('Could not load auctions.');
        return;
    }

    auctions = data || [];
    filterAndRenderAuctions();
}

function filterAndRenderAuctions() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
    filteredAuctions = auctions.filter(auction => 
        auction.product_category.toLowerCase().includes(searchTerm)
    );
    renderAuctions();
}

function renderAuctions() {
    const auctionList = document.getElementById('auctionList');
    if (filteredAuctions.length === 0) {
        auctionList.innerHTML = '<p>No auctions found for the selected criteria.</p>';
        return;
    }

    auctionList.innerHTML = filteredAuctions.map(auction => {
        const lowestBid = auction.bids.length > 0 ? Math.min(...auction.bids.map(b => b.bid_amount)) : auction.starting_price;
        const bidsCount = auction.bids.length;

        return `
        <div class="auction-card" data-id="${auction.id}">
            <h2>${auction.product_category}</h2>
            <div class="auction-details">
                <div class="detail-item">
                    <span class="detail-label">Quantity</span>
                    <span class="detail-value">${auction.quantity} ${auction.unit}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Current Price</span>
                    <span class="detail-value current-price">₹${lowestBid}/${auction.unit}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Bids</span>
                    <span class="detail-value">${bidsCount}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Ends In</span>
                    <span class="detail-value">${new Date(auction.ends_at).toLocaleString()}</span>
                </div>
            </div>
            <div class="auction-actions">
                <button class="btn-secondary place-bid-btn" ${auction.status !== 'active' ? 'disabled' : ''}>Place Bid</button>
            </div>
            <div class="auction-status">
                <span class="status-badge ${auction.status}">${auction.status}</span>
                <span>Posted by: ${auction.buyer?.name || 'Anonymous'}</span>
            </div>
        </div>
    `}).join('');

    document.querySelectorAll('.place-bid-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.auction-card');
            const auctionId = card.dataset.id;
            openBidModal(auctionId);
        });
    });
}

function setupEventListeners() {
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.addEventListener('click', () => {
        if (!currentUser) alert("Please go to the homepage to log in.");
    });

    const auctionModal = document.getElementById('auctionModal');
    const createAuctionBtn = document.getElementById('createAuctionBtn');
    const auctionCloseBtn = auctionModal.querySelector('.modal-close');

    createAuctionBtn.addEventListener('click', () => {
        if (!currentUser) {
            alert('Please log in to create an auction.');
            return;
        }
        // Ideally, check user type is 'buyer'
        auctionModal.classList.add('active');
    });
    auctionCloseBtn.addEventListener('click', () => auctionModal.classList.remove('active'));
    
    const bidModal = document.getElementById('bidModal');
    const bidCloseBtn = bidModal.querySelector('.modal-close');
    bidCloseBtn.addEventListener('click', () => bidModal.classList.remove('active'));

    document.getElementById('auctionForm').addEventListener('submit', handleAuctionSubmit);
    document.getElementById('bidForm').addEventListener('submit', handleBidSubmit);

    document.getElementById('statusFilter').addEventListener('change', loadAuctions);
    document.getElementById('categorySearch').addEventListener('input', filterAndRenderAuctions);
}

async function handleAuctionSubmit(e) {
    e.preventDefault();
    if (!currentUser) return alert('Authentication error.');

    const auctionData = {
        buyer_id: currentUser.id,
        product_category: document.getElementById('productCategory').value,
        quantity: parseInt(document.getElementById('quantity').value, 10),
        unit: document.getElementById('unit').value,
        starting_price: parseFloat(document.getElementById('startingPrice').value),
        current_price: parseFloat(document.getElementById('startingPrice').value),
        reserve_price: parseFloat(document.getElementById('reservePrice').value) || null,
        delivery_location: document.getElementById('deliveryLocation').value,
        ends_at: new Date(document.getElementById('endsAt').value).toISOString(),
    };

    const { error } = await createAuction(auctionData);

    if (error) {
        alert('Failed to create auction: ' + error.message);
    } else {
        alert('Auction created successfully!');
        document.getElementById('auctionModal').classList.remove('active');
        e.target.reset();
        await loadAuctions();
    }
}

function openBidModal(auctionId) {
    if (!currentUser) return alert('Please log in to place a bid.');
    
    const auction = auctions.find(a => a.id === auctionId);
    if (!auction) return;
    
    if (auction.buyer_id === currentUser.id) return alert("You cannot bid on your own auction.");

    const bidModal = document.getElementById('bidModal');
    document.getElementById('bidAuctionId').value = auctionId;
    
    const currentPrice = auction.bids.length > 0 ? Math.min(...auction.bids.map(b => b.bid_amount)) : auction.starting_price;

    const detailsDiv = document.getElementById('bidAuctionDetails');
    detailsDiv.innerHTML = `
        <p><strong>Product:</strong> ${auction.product_category}</p>
        <p><strong>Current Price:</strong> ₹${currentPrice}/${auction.unit}</p>
    `;
    document.getElementById('bidHelpText').textContent = `Your bid must be lower than ${currentPrice}.`;

    bidModal.classList.add('active');
}

async function handleBidSubmit(e) {
    e.preventDefault();
    if (!currentUser) return alert('Authentication error.');

    const auctionId = document.getElementById('bidAuctionId').value;
    const bidAmount = parseFloat(document.getElementById('bidAmount').value);
    
    const auction = auctions.find(a => a.id === auctionId);
    const currentPrice = auction.bids.length > 0 ? Math.min(...auction.bids.map(b => b.bid_amount)) : auction.starting_price;

    if (bidAmount >= currentPrice) {
        return alert(`Your bid must be lower than the current price of ₹${currentPrice}.`);
    }

    const bidData = {
        auction_id: auctionId,
        seller_id: currentUser.id,
        bid_amount: bidAmount,
    };
    
    const { error } = await placeBid(bidData);
    if (error) {
        alert('Failed to place bid: ' + error.message);
    } else {
        alert('Bid placed successfully!');
        document.getElementById('bidModal').classList.remove('active');
        e.target.reset();
        await loadAuctions();
    }
}

document.addEventListener('DOMContentLoaded', init);