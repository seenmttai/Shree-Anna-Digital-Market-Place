import { supabase, getCurrentUser, createForecast, getForecasts } from './supabase-client.js';

let currentUser = null;

async function init() {
    currentUser = await getCurrentUser();
    if (!currentUser) {
        // Redirect or show login message
        const main = document.querySelector('main');
        main.innerHTML = `
            <div class="page-header"><h1>Yield & Price Forecasting</h1></div>
            <p>Please <a href="index.html">log in</a> to use the forecasting feature.</p>
        `;
        document.getElementById('loginBtn').textContent = 'Login';
    } else {
        updateUI();
        setupEventListeners();
        loadPastForecasts();
    }
}

function updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.textContent = 'Dashboard';
    loginBtn.onclick = () => location.href = 'dashboard.html';
}

function setupEventListeners() {
    document.getElementById('forecastForm').addEventListener('submit', handleForecastSubmit);
}

async function handleForecastSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const spinner = document.getElementById('loadingSpinner');
    const resultsContainer = document.getElementById('resultsContainer');
    
    spinner.classList.add('active');
    resultsContainer.innerHTML = '';
    
    const forecastData = {
        user_id: currentUser.id,
        crop_type: document.getElementById('cropType').value,
        location: document.getElementById('location').value,
        season: document.getElementById('season').value,
    };

    // Simulate API call and generate mock data
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    const mockResults = generateMockForecast(forecastData);
    
    const completeForecastData = { ...forecastData, ...mockResults };

    const { data, error } = await createForecast(completeForecastData);
    
    spinner.classList.remove('active');

    if (error) {
        resultsContainer.innerHTML = `<p class="error-text">Could not save forecast: ${error.message}</p>`;
        return;
    }

    displayForecast(data);
    loadPastForecasts();
}

function generateMockForecast(inputs) {
    // This is a placeholder for a real ML model API call
    const yieldBase = { 'Finger Millet': 20, 'Foxtail Millet': 15, 'Sorghum': 25, 'Pearl Millet': 18, 'Chickpea': 12, 'Pigeon Pea': 10 }[inputs.crop_type] || 15;
    const priceBase = { 'Finger Millet': 35, 'Foxtail Millet': 50, 'Sorghum': 28, 'Pearl Millet': 25, 'Chickpea': 60, 'Pigeon Pea': 70 }[inputs.crop_type] || 40;

    return {
        predicted_yield: parseFloat((yieldBase + (Math.random() * 10 - 5)).toFixed(2)), // in quintals/hectare
        predicted_price: parseFloat((priceBase + (Math.random() * 15 - 7.5)).toFixed(2)), // in INR/kg
        recommendations: 'Based on market trends, consider staggered selling. Soil moisture is critical for the next 4 weeks. Watch for pest activity.',
        confidence_score: parseFloat((0.75 + Math.random() * 0.15).toFixed(2))
    };
}

function displayForecast(forecast) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = `
        <div class="forecast-result">
            <div class="result-item">
                <span class="detail-label">Predicted Yield</span>
                <span class="detail-value">${forecast.predicted_yield} quintals/ha</span>
            </div>
            <div class="result-item">
                <span class="detail-label">Predicted Market Price</span>
                <span class="detail-value">₹${forecast.predicted_price} / kg</span>
            </div>
            <div class="result-item">
                <span class="detail-label">Confidence Score</span>
                <span class="detail-value">${(forecast.confidence_score * 100).toFixed(0)}%</span>
            </div>
            <div class="result-item">
                <span class="detail-label">Location</span>
                <span class="detail-value">${forecast.location}</span>
            </div>
        </div>
        <div class="recommendations">
            <h3>Recommendations</h3>
            <p>${forecast.recommendations}</p>
        </div>
    `;
}

async function loadPastForecasts() {
    if (!currentUser) return;
    const { data, error } = await getForecasts(currentUser.id);
    const listDiv = document.getElementById('pastForecastsList');
    
    if (error || !data || data.length === 0) {
        listDiv.innerHTML = '<p>No past forecasts found.</p>';
        return;
    }
    
    listDiv.innerHTML = data.map(f => `
        <div class="past-forecast-item">
            <div>
                <strong>${f.crop_type}</strong> - ${new Date(f.forecast_date).toLocaleDateString()}
            </div>
            <span>Yield: ${f.predicted_yield} q/ha, Price: ₹${f.predicted_price}/kg</span>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', init);