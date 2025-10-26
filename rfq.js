import { supabase, getCurrentUser, getRFQs, createRFQ, submitQuote } from './supabase-client.js';

let currentUser = null;
let rfqs = [];
let filteredRfqs = [];

async function init() {
    currentUser = await getCurrentUser();
    updateUI();
    setupEventListeners();
    await loadRfqs();
}

function updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    if (currentUser) {
        loginBtn.textContent = 'Dashboard';
        loginBtn.onclick = () => location.href = 'dashboard.html';
    }
}

async function loadRfqs() {
    const spinner = document.getElementById('loadingSpinner');
    spinner.classList.add('active');

    const statusFilter = document.getElementById('statusFilter').value;
    const { data, error } = await getRFQs({ status: statusFilter });

    spinner.classList.remove('active');

    if (error) {
        console.error('Error loading RFQs:', error);
        alert('Could not load RFQs.');
        return;
    }

    rfqs = data || [];
    filterAndRenderRfqs();
}

function filterAndRenderRfqs() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();

    filteredRfqs = rfqs.filter(rfq => 
        rfq.product_category.toLowerCase().includes(searchTerm)
    );

    renderRfqs();
}

function renderRfqs() {
    const rfqList = document.getElementById('rfqList');
    if (filteredRfqs.length === 0) {
        rfqList.innerHTML = '<p>No RFQs found for the selected criteria.</p>';
        return;
    }

    rfqList.innerHTML = filteredRfqs.map(rfq => `
        <div class="rfq-card" data-id="${rfq.id}">
            <h2>${rfq.product_category}</h2>
            <div class="rfq-details">
                <div class="detail-item">
                    <span class="detail-label">Quantity</span>
                    <span class="detail-value">${rfq.quantity} ${rfq.unit}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Location</span>
                    <span class="detail-value">${rfq.delivery_location}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Expires</span>
                    <span class="detail-value">${new Date(rfq.expires_at).toLocaleString()}</span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">Quotes</span>
                    <span class="detail-value">${rfq.quotes?.length || 0}</span>
                </div>
            </div>
            <div class="rfq-actions">
                <button class="btn-secondary submit-quote-btn">Submit Quote</button>
            </div>
            <div class="rfq-status">
                <span class="status-badge ${rfq.status}">${rfq.status}</span>
                <span>Posted by: ${rfq.buyer?.name || 'Anonymous'}</span>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.submit-quote-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = e.target.closest('.rfq-card');
            const rfqId = card.dataset.id;
            openQuoteModal(rfqId);
        });
    });
}

function setupEventListeners() {
    // Auth related
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.addEventListener('click', () => {
        if (!currentUser) {
            // Assuming a login modal exists on the main page, might need to redirect. For now, alert.
             alert("Please go to the homepage to log in.");
        }
    });

    // RFQ Modal
    const rfqModal = document.getElementById('rfqModal');
    const createRfqBtn = document.getElementById('createRfqBtn');
    const rfqCloseBtn = rfqModal.querySelector('.modal-close');

    createRfqBtn.addEventListener('click', () => {
        if (!currentUser) {
            alert('Please log in to post an RFQ.');
            return;
        }
        rfqModal.classList.add('active');
    });
    rfqCloseBtn.addEventListener('click', () => rfqModal.classList.remove('active'));

    // Quote Modal
    const quoteModal = document.getElementById('quoteModal');
    const quoteCloseBtn = quoteModal.querySelector('.modal-close');
    quoteCloseBtn.addEventListener('click', () => quoteModal.classList.remove('active'));

    // Forms
    document.getElementById('rfqForm').addEventListener('submit', handleRfqSubmit);
    document.getElementById('quoteForm').addEventListener('submit', handleQuoteSubmit);

    // Filters
    document.getElementById('statusFilter').addEventListener('change', loadRfqs);
    document.getElementById('categorySearch').addEventListener('input', filterAndRenderRfqs);
}

async function handleRfqSubmit(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Authentication error.');
        return;
    }

    const rfqData = {
        buyer_id: currentUser.id,
        product_category: document.getElementById('productCategory').value,
        quantity: parseInt(document.getElementById('quantity').value, 10),
        unit: document.getElementById('unit').value,
        target_price: parseFloat(document.getElementById('targetPrice').value) || null,
        delivery_location: document.getElementById('deliveryLocation').value,
        delivery_date: document.getElementById('deliveryDate').value,
        description: document.getElementById('description').value,
        expires_at: new Date(document.getElementById('expiresAt').value).toISOString(),
    };

    const { data, error } = await createRFQ(rfqData);

    if (error) {
        alert('Failed to create RFQ: ' + error.message);
    } else {
        alert('RFQ created successfully!');
        document.getElementById('rfqModal').classList.remove('active');
        e.target.reset();
        await loadRfqs();
    }
}

function openQuoteModal(rfqId) {
    if (!currentUser) {
        alert('Please log in to submit a quote.');
        return;
    }
    const rfq = rfqs.find(r => r.id === rfqId);
    if (!rfq) return;

    if (rfq.buyer_id === currentUser.id) {
        alert("You cannot submit a quote for your own RFQ.");
        return;
    }

    const quoteModal = document.getElementById('quoteModal');
    document.getElementById('quoteRfqId').value = rfqId;

    const detailsDiv = document.getElementById('quoteRfqDetails');
    detailsDiv.innerHTML = `
        <p><strong>Product:</strong> ${rfq.product_category}</p>
        <p><strong>Quantity:</strong> ${rfq.quantity} ${rfq.unit}</p>
        <p><strong>Location:</strong> ${rfq.delivery_location}</p>
    `;

    quoteModal.classList.add('active');
}

async function handleQuoteSubmit(e) {
    e.preventDefault();
     if (!currentUser) {
        alert('Authentication error.');
        return;
    }

    const quoteData = {
        rfq_id: document.getElementById('quoteRfqId').value,
        seller_id: currentUser.id,
        price: parseFloat(document.getElementById('quotePrice').value),
        delivery_terms: document.getElementById('deliveryTerms').value,
        comments: document.getElementById('comments').value
    };

    const { data, error } = await submitQuote(quoteData);

    if (error) {
        alert('Failed to submit quote: ' + error.message);
    } else {
        alert('Quote submitted successfully!');
        document.getElementById('quoteModal').classList.remove('active');
        e.target.reset();
        await loadRfqs(); // Refresh to show new quote count
    }
}

document.addEventListener('DOMContentLoaded', init);