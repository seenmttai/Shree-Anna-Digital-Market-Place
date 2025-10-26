import { getProducts, getCurrentUser, createPriceAlert, createOrder } from './supabase-client.js';

let products = [];
let filteredProducts = [];
let compareList = [];
let currentUser = null;

async function init() {
    currentUser = await getCurrentUser();
    await loadProducts();
    setupEventListeners();
    setupVoiceCommands();
}

async function loadProducts() {
    const spinner = document.getElementById('loadingSpinner');
    spinner.classList.add('active');
    
    const { data, error } = await getProducts({ status: 'active' });
    
    spinner.classList.remove('active');
    
    if (error) {
        console.error('Error loading products:', error);
        return;
    }
    
    products = data || [];
    filteredProducts = products;
    renderProducts();
    renderFeaturedProducts();
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const count = document.getElementById('resultsCount');
    
    count.textContent = filteredProducts.length;
    
    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem;">No products found</div>';
        return;
    }
    
    grid.innerHTML = filteredProducts.map(product => createProductCard(product)).join('');
    
    // Add event listeners
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                location.href = `product-detail.html?id=${card.dataset.id}`;
            }
        });
    });
}

function createProductCard(product) {
    const isComparing = compareList.includes(product.id);
    const isFeatured = product.featured_until && new Date(product.featured_until) > new Date();
    
    return `
        <div class="product-card ${isFeatured ? 'featured' : ''}" data-id="${product.id}">
            ${isFeatured ? '<div class="product-badge">Featured</div>' : ''}
            <img src="${(product.images && product.images.length > 0) ? product.images[0] : 'https://via.placeholder.com/300x200?text=No+Image'}" 
                 alt="${product.name}" class="product-image">
            <div class="product-info">
                <div class="product-header">
                    <div>
                        <div class="product-name">${product.name}</div>
                        <div class="product-seller">${product.seller?.name || 'Unknown'}</div>
                    </div>
                    ${product.quality_score ? `
                        <div class="product-rating">
                            ★ ${product.quality_score.toFixed(1)}
                        </div>
                    ` : ''}
                </div>
                
                <div class="product-prices">
                    ${product.retail_price ? `
                        <div class="price-tier">
                            <span class="price-label">Retail:</span>
                            <span class="price-value">₹${product.retail_price}/${product.unit}</span>
                        </div>
                    ` : ''}
                    ${product.wholesale_price && product.wholesale_min_qty ? `
                        <div class="price-tier">
                            <span class="price-label">Wholesale (${product.wholesale_min_qty}${product.unit}+):</span>
                            <span class="price-value">₹${product.wholesale_price}/${product.unit}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="product-meta">
                    ${product.certifications?.map(cert => 
                        `<span class="meta-badge">${cert}</span>`
                    ).join('') || ''}
                </div>
                
                <div class="product-actions">
                    <button class="btn-primary" onclick="event.stopPropagation(); addToCart('${product.id}')">
                        Add to Cart
                    </button>
                    <button class="icon-btn ${isComparing ? 'active' : ''}" 
                            onclick="event.stopPropagation(); toggleCompare('${product.id}')" 
                            title="Compare" aria-label="Compare">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <path d="M3 7h18"></path>
                            <path d="M6 7l4 6H2l4-6zM18 7l4 6h-8l4-6z"></path>
                            <path d="M12 13v7"></path>
                        </svg>
                    </button>
                    <button class="icon-btn" 
                            onclick="event.stopPropagation(); showPriceAlert('${product.id}')" 
                            title="Price Alert" aria-label="Price Alert">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                    </button>
                    <button class="btn-secondary" onclick="event.stopPropagation(); openQualityModal()">
                        Quality Check
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderFeaturedProducts() {
    const featured = products.filter(p => 
        p.featured_until && new Date(p.featured_until) > new Date()
    ).slice(0, 5);
    
    const carousel = document.getElementById('featuredCarousel');
    
    if (featured.length === 0) {
        document.getElementById('featuredProducts').style.display = 'none';
        return;
    }
    
    carousel.innerHTML = featured.map(product => createProductCard(product)).join('');
}

function setupEventListeners() {
    // Filters
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    document.getElementById('sortSelect').addEventListener('change', sortProducts);
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    
    // Compare
    document.getElementById('compareBtn').addEventListener('click', showCompare);
    
    // Price alert modal
    const alertModal = document.getElementById('priceAlertModal');
    const alertClose = alertModal.querySelector('.modal-close');
    alertClose.addEventListener('click', () => alertModal.classList.remove('active'));
    document.getElementById('priceAlertForm').addEventListener('submit', submitPriceAlert);
    
    // Compare modal
    const compareModal = document.getElementById('compareModal');
    const compareClose = compareModal.querySelector('.modal-close');
    compareClose.addEventListener('click', () => compareModal.classList.remove('active'));
    
    // QC modal
    const qcModal = document.getElementById('qcModal');
    const qcClose = qcModal.querySelector('.modal-close');
    qcClose.addEventListener('click', () => qcModal.classList.remove('active'));
    document.getElementById('qcFile').addEventListener('change', handleQcFile);
    
    // Scan barcode
    document.getElementById('scanBtn').addEventListener('click', scanBarcode);
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const categories = Array.from(document.querySelectorAll('.filter-section input[type="checkbox"]:checked'))
        .map(cb => cb.value);
    const minPrice = parseFloat(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseFloat(document.getElementById('maxPrice').value) || Infinity;
    const orderType = document.querySelector('input[name="orderType"]:checked').value;
    
    filteredProducts = products.filter(product => {
        // Search
        if (search && !product.name.toLowerCase().includes(search) && 
            !product.description?.toLowerCase().includes(search)) {
            return false;
        }
        
        // Category
        if (categories.length > 0 && !categories.includes(product.category)) {
            return false;
        }
        
        // Price
        const price = orderType === 'wholesale' ? product.wholesale_price : product.retail_price;
        if (price < minPrice || price > maxPrice) {
            return false;
        }
        
        return true;
    });
    
    renderProducts();
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.querySelectorAll('.filter-section input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelector('input[name="orderType"][value="all"]').checked = true;
    
    filteredProducts = products;
    renderProducts();
}

function sortProducts() {
    const sortBy = document.getElementById('sortSelect').value;
    
    switch (sortBy) {
        case 'price_low':
            filteredProducts.sort((a, b) => (a.retail_price || 0) - (b.retail_price || 0));
            break;
        case 'price_high':
            filteredProducts.sort((a, b) => (b.retail_price || 0) - (a.retail_price || 0));
            break;
        case 'rating':
            filteredProducts.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
            break;
        case 'newest':
        default:
            filteredProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    renderProducts();
}

window.toggleCompare = function(productId) {
    const index = compareList.indexOf(productId);
    if (index > -1) {
        compareList.splice(index, 1);
    } else {
        if (compareList.length >= 4) {
            alert('You can compare up to 4 products at a time');
            return;
        }
        compareList.push(productId);
    }
    
    document.getElementById('compareCount').textContent = compareList.length;
    renderProducts();
};

function showCompare() {
    if (compareList.length < 2) {
        alert('Select at least 2 products to compare');
        return;
    }
    
    const compareProducts = products.filter(p => compareList.includes(p.id));
    const modal = document.getElementById('compareModal');
    const table = document.getElementById('compareTable');
    
    table.innerHTML = `
        <div class="compare-grid">
            ${compareProducts.map(product => `
                <div class="compare-item">
                    <img src="${product.images[0] || 'https://via.placeholder.com/200'}" alt="${product.name}">
                    <h4>${product.name}</h4>
                    <div class="compare-row">
                        <strong>Price:</strong>
                        <span>₹${product.retail_price}/${product.unit}</span>
                    </div>
                    <div class="compare-row">
                        <strong>Wholesale:</strong>
                        <span>₹${product.wholesale_price || 'N/A'}/${product.unit}</span>
                    </div>
                    <div class="compare-row">
                        <strong>Quality:</strong>
                        <span>★ ${product.quality_score || 'N/A'}</span>
                    </div>
                    <div class="compare-row">
                        <strong>Stock:</strong>
                        <span>${product.stock_quantity} ${product.unit}</span>
                    </div>
                    <div class="compare-row">
                        <strong>Seller:</strong>
                        <span>${product.seller?.name || 'Unknown'}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    modal.classList.add('active');
}

window.showPriceAlert = function(productId) {
    if (!currentUser) {
        alert('Please login to set price alerts');
        return;
    }
    
    document.getElementById('alertProductId').value = productId;
    document.getElementById('priceAlertModal').classList.add('active');
};

async function submitPriceAlert(e) {
    e.preventDefault();
    
    const productId = document.getElementById('alertProductId').value;
    const targetPrice = parseFloat(document.getElementById('targetPrice').value);
    const condition = document.getElementById('alertCondition').value;
    
    const { error } = await createPriceAlert({
        user_id: currentUser.id,
        product_id: productId,
        target_price: targetPrice,
        condition: condition
    });
    
    if (error) {
        alert('Failed to set price alert: ' + error.message);
        return;
    }
    
    alert('Price alert set successfully!');
    document.getElementById('priceAlertModal').classList.remove('active');
}

window.addToCart = async function(productId) {
    if (!currentUser) {
        alert('Please login to add items to cart');
        return;
    }
    
    // Store in localStorage for now
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ productId, quantity: 1 });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    alert('Added to cart!');
};

function scanBarcode() {
    // In production, this would use a barcode scanning library
    alert('Barcode scanning feature - would use device camera to scan product barcodes/QR codes for traceability');
}

function setupVoiceCommands() {
    // Reuse voice command setup from app.js
}

window.openQualityModal = function() {
    document.getElementById('qcResult').textContent = '';
    const ctx1 = document.getElementById('qcInCanvas').getContext('2d');
    const ctx2 = document.getElementById('qcOutCanvas').getContext('2d');
    ctx1.clearRect(0,0,640,480); ctx2.clearRect(0,0,640,480);
    document.getElementById('qcModal').classList.add('active');
};

async function handleQcFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
        const inCv = document.getElementById('qcInCanvas');
        const ctx = inCv.getContext('2d');
        // Fit image into canvas
        const scale = Math.min(inCv.width / img.width, inCv.height / img.height);
        const w = Math.floor(img.width * scale), h = Math.floor(img.height * scale);
        ctx.clearRect(0,0,inCv.width,inCv.height);
        ctx.drawImage(img, 0, 0, w, h);
        await waitForCV();
        const res = (window.GrainQC && GrainQC.analyzeOnCanvases) ? GrainQC.analyzeOnCanvases('qcInCanvas','qcOutCanvas') : null;
        document.getElementById('qcResult').textContent = res ? `Grade: ${res.grade}` : 'Unable to analyze. Try again.';
    };
    img.src = URL.createObjectURL(file);
}

function waitForCV() {
    return new Promise(resolve => {
        if (window.cv && cv.Mat) return resolve();
        const check = setInterval(() => {
            if (window.cv && cv.Mat) {
                clearInterval(check);
                resolve();
            }
        }, 100);
    });
}

document.addEventListener('DOMContentLoaded', init);