import { supabase, getCurrentUser, createProduct, uploadProductImages } from 'https://bharat-millet-hub.pages.dev/supabase-client.js';

let currentUser = null;

async function init() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        location.href = 'index.html'; // Redirect if not logged in
        return;
    }
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('productForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        location.href = 'index.html';
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentUser) {
        alert("You must be logged in to post a product.");
        return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Posting...';

    // Handle image uploads
    const imageFiles = document.getElementById('productImages').files;
    let imageUrls = [];

    if (imageFiles.length > 0) {
        submitButton.textContent = 'Uploading images...';
        const { urls, error: uploadError } = await uploadProductImages(imageFiles, currentUser.id);

        if (uploadError) {
            alert('Error uploading images: ' + uploadError.message);
            submitButton.disabled = false;
            submitButton.textContent = 'Post Product';
            return;
        }
        imageUrls = urls;
    }

    const productData = {
        seller_id: currentUser.id,
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategory').value,
        description: document.getElementById('productDescription').value,
        stock_quantity: parseInt(document.getElementById('stockQuantity').value, 10),
        unit: document.getElementById('unit').value,
        retail_price: parseFloat(document.getElementById('retailPrice').value) || null,
        wholesale_price: parseFloat(document.getElementById('wholesalePrice').value) || null,
        wholesale_min_qty: parseInt(document.getElementById('wholesaleMinQty').value, 10) || null,
        images: imageUrls,
        // base_price is required in DB schema, let's use retail or wholesale
        base_price: parseFloat(document.getElementById('retailPrice').value) || parseFloat(document.getElementById('wholesalePrice').value) || 0,
    };

    // Basic validation
    if (!productData.retail_price && !productData.wholesale_price) {
        alert("Please provide at least a retail or wholesale price.");
        submitButton.disabled = false;
        submitButton.textContent = 'Post Product';
        return;
    }
    if (productData.wholesale_price && !productData.wholesale_min_qty) {
        alert("Please provide a minimum quantity for wholesale pricing.");
        submitButton.disabled = false;
        submitButton.textContent = 'Post Product';
        return;
    }

    const { data, error } = await createProduct(productData);

    if (error) {
        alert("Error posting product: " + error.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Post Product';
    } else {
        alert("Product posted successfully!");
        location.href = `https://bharat-millet-hub.pages.dev/marketplace.html`; // Or a product detail page: `product-detail.html?id=${data.id}`
    }
}

document.addEventListener('DOMContentLoaded', init);