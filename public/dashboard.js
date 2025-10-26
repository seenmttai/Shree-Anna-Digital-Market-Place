import { supabase, getCurrentUser, signOut } from './supabase-client.js';

let currentUser = null;

async function init() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        location.href = 'index.html';
        return;
    }

    setupEventListeners();
    loadDashboardData();
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await signOut();
        location.href = 'index.html';
    });
}

async function loadDashboardData() {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, user_type')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        document.getElementById('welcomeMessage').textContent = `Welcome back, ${profile.name}!`;
    }

    // TODO: Load real stats
    // const { data: products } = await supabase.from('products').select('*', { count: 'exact' }).eq('seller_id', currentUser.id);
    // const { data: orders } = await supabase.from('orders').select('*', { count: 'exact' }).eq('seller_id', currentUser.id);

    // document.getElementById('stat-products').textContent = products.length;
    // document.getElementById('stat-orders').textContent = orders.filter(o => o.order_status === 'pending').length;
}

document.addEventListener('DOMContentLoaded', init);