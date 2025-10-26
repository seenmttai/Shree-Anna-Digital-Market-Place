import { supabase, getCurrentUser, signIn, signUp, signOut } from './supabase-client.js';

let currentUser = null;

// Initialize app
async function init() {
    currentUser = await getCurrentUser();
    updateUI();
    setupEventListeners();
    setupVoiceCommands();
}

function updateUI() {
    const loginBtn = document.getElementById('loginBtn');
    if (currentUser) {
        loginBtn.textContent = 'Dashboard';
        loginBtn.onclick = () => location.href = 'dashboard.html';
    }
}

function setupEventListeners() {
    // Login modal
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const modal = document.getElementById('loginModal');
    const closeBtn = modal.querySelector('.modal-close');
    
    loginBtn.addEventListener('click', () => {
        if (!currentUser) {
            modal.classList.add('active');
        }
    });
    
    registerBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
    
    // Auth form
    const authForm = document.getElementById('authForm');
    authForm.addEventListener('submit', handleAuth);
    
    // Language selector (simplified)
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        const saved = localStorage.getItem('language') || 'en';
        langSelect.value = saved;
        if (window.SimpleI18n) { SimpleI18n.changeLanguage(saved); }
        langSelect.addEventListener('change', (e) => {
            localStorage.setItem('language', e.target.value);
            if (window.SimpleI18n) { SimpleI18n.changeLanguage(e.target.value); }
        });
    }
    
    // Load saved language
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
        langSelect.value = savedLang;
        window.currentLang = savedLang;
        updatePageTranslations();
    }
}

async function handleAuth(e) {
    e.preventDefault();
    
    const identifier = document.getElementById('authIdentifier').value;
    const password = document.getElementById('authPassword').value;
    const userType = document.getElementById('userType').value;
    
    // Simple auth - in production, this would be more robust
    const { data, error } = await signIn(identifier, password);
    
    if (error) {
        // Try sign up
        const { data: signUpData, error: signUpError } = await signUp(identifier, password, {
            user_type: userType,
            name: identifier.split('@')[0]
        });
        
        if (signUpError) {
            alert('Authentication failed: ' + signUpError.message);
            return;
        }
    }
    
    location.reload();
}

function setupVoiceCommands() {
    const voiceBtn = document.getElementById('voiceBtn');
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        voiceBtn.style.display = 'none';
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    
    let isListening = false;
    
    voiceBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
            voiceBtn.classList.remove('active');
            isListening = false;
        } else {
            recognition.start();
            voiceBtn.classList.add('active');
            isListening = true;
        }
    });
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        handleVoiceCommand(transcript);
    };
    
    recognition.onend = () => {
        voiceBtn.classList.remove('active');
        isListening = false;
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        voiceBtn.classList.remove('active');
        isListening = false;
    };
}

function handleVoiceCommand(command) {
    console.log('Voice command:', command);
    
    if (command.includes('marketplace') || command.includes('market')) {
        location.href = 'marketplace.html';
    } else if (command.includes('rfq') || command.includes('request for quotation')) {
        location.href = 'rfq.html';
    } else if (command.includes('auction')) {
        location.href = 'auction.html';
    } else if (command.includes('forecast')) {
        location.href = 'forecasting.html';
    } else if (command.includes('scheme')) {
        location.href = 'schemes.html';
    } else if (command.includes('dashboard')) {
        location.href = 'dashboard.html';
    } else if (command.includes('quality') || command.includes('checker')) {
        location.href = 'quality-checker.html';
    } else {
        alert('Command not recognized. Try saying: marketplace, RFQ, auction, forecast, schemes, or dashboard');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}