import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vekkziumelqjndunkpxj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZla2t6aXVtZWxxam5kdW5rcHhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk2MTE3MzgsImV4cCI6MjA1NTE4NzczOH0.XWPYixmR7C_TOLh0Ai7HFmGU07Sa2ryZxeEqrd4zwGg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Authentication helpers
export async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: userData
        }
    });
    return { data, error };
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function signInWithMagicLink(email, userData = {}) {
    const options = {
        emailRedirectTo: window.location.origin,
    };
    if (Object.keys(userData).length > 0) {
        options.data = userData;
    }
    const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options,
    });
    return { data, error };
}

// Database helpers
export async function getProducts(filters = {}) {
    let query = supabase.from('products').select('*, seller:profiles!seller_id(name, user_type)');
    
    if (filters.category) {
        query = query.eq('category', filters.category);
    }
    if (filters.seller_id) {
        query = query.eq('seller_id', filters.seller_id);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query;
    return { data, error };
}

export async function getProduct(id) {
    const { data, error } = await supabase
        .from('products')
        .select('*, seller:profiles!seller_id(name, user_type, phone), reviews(*)')
        .eq('id', id)
        .single();
    return { data, error };
}

export async function createProduct(productData) {
    const { data, error } = await supabase.from('products').insert(productData).select().single();
    return { data, error };
}

export async function getRFQs(filters = {}) {
    let query = supabase.from('rfqs').select('*, buyer:profiles!buyer_id(name), quotes:rfq_quotes(*)');
    
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
}

export async function createRFQ(rfqData) {
    const { data, error } = await supabase.from('rfqs').insert(rfqData).select().single();
    return { data, error };
}

export async function submitQuote(quoteData) {
    const { data, error } = await supabase.from('rfq_quotes').insert(quoteData).select().single();
    return { data, error };
}

export async function getAuctions(filters = {}) {
    let query = supabase.from('auctions').select('*, buyer:profiles!buyer_id(name), bids:auction_bids(*, seller:profiles!seller_id(name))');
    
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
}

export async function createAuction(auctionData) {
    const { data, error } = await supabase.from('auctions').insert(auctionData).select().single();
    return { data, error };
}

export async function placeBid(bidData) {
    const { data, error } = await supabase.from('auction_bids').insert(bidData).select().single();
    
    if (!error && data) {
        // Update auction current price
        await supabase
            .from('auctions')
            .update({ current_price: bidData.bid_amount })
            .eq('id', bidData.auction_id);
    }
    
    return { data, error };
}

export async function createOrder(orderData) {
    const { data, error } = await supabase.from('orders').insert(orderData).select().single();
    return { data, error };
}

export async function getOrders(userId, userType = 'buyer') {
    const field = userType === 'buyer' ? 'buyer_id' : 'seller_id';
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq(field, userId)
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function createPriceAlert(alertData) {
    const { data, error } = await supabase.from('price_alerts').insert(alertData).select().single();
    return { data, error };
}

export async function subscribeToPriceAlerts(userId, callback) {
    const channel = supabase
        .channel('price_alerts')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'products',
            filter: `seller_id=neq.${userId}`
        }, callback)
        .subscribe();
    
    return channel;
}

export async function sendMessage(messageData) {
    const { data, error } = await supabase.from('messages').insert(messageData).select().single();
    return { data, error };
}

export async function subscribeToMessages(conversationId, callback) {
    const channel = supabase
        .channel(`messages:${conversationId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
        }, callback)
        .subscribe();
    
    return channel;
}

export async function createReview(reviewData) {
    const { data, error } = await supabase.from('reviews').insert(reviewData).select().single();
    return { data, error };
}

export async function getReviews(productId) {
    const { data, error } = await supabase
        .from('reviews')
        .select('*, user:profiles(name)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function uploadDocument(file, userId, documentType) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${documentType}_${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
        .from('documents')
        .upload(fileName, file);
    
    if (error) return { data: null, error };
    
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
    
    // Create document record
    const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
            user_id: userId,
            document_type: documentType,
            file_url: publicUrl
        })
        .select()
        .single();
    
    return { data: docData, error: docError };
}

export async function getSchemes(userType) {
    let query = supabase
        .from('schemes')
        .select('*');

    if (userType) {
        query = query.contains('target_users', [userType]);
    }
    
    const { data, error } = await query
        .gte('valid_until', new Date().toISOString())
        .order('created_at', { ascending: false });
    return { data, error };
}

export async function createForecast(forecastData) {
    const { data, error } = await supabase.from('forecasts').insert(forecastData).select().single();
    return { data, error };
}

export async function getForecasts(userId) {
    const { data, error } = await supabase
        .from('forecasts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
    return { data, error };
}

export async function createQualityCheck(checkData) {
    const { data, error } = await supabase.from('quality_checks').insert(checkData).select().single();
    return { data, error };
}

export async function schedulePickup(pickupData) {
    const { data, error } = await supabase.from('pickup_schedules').insert(pickupData).select().single();
    return { data, error };
}

export async function createAutoReorder(reorderData) {
    const { data, error } = await supabase.from('auto_reorders').insert(reorderData).select().single();
    return { data, error };
}

export async function getExportOpportunities() {
    const { data, error } = await supabase
        .from('export_opportunities')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
    return { data, error };
}