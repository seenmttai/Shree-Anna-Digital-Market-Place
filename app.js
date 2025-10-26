import { supabase, getCurrentUser, signIn, signUp, signOut, signInWithMagicLink } from './supabase-client.js';

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
        
        // Hide hero action buttons
        const heroActions = document.getElementById('heroActions');
        if(heroActions) {
            heroActions.style.display = 'none';
        }

    }
}

function setupEventListeners() {
    // Login modal
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const loginCloseBtn = loginModal.querySelector('.modal-close');
    
    loginBtn.addEventListener('click', () => {
        if (!currentUser) {
            loginModal.classList.add('active');
        }
    });
    
    loginCloseBtn.addEventListener('click', () => {
        loginModal.classList.remove('active');
    });
    
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.classList.remove('active');
        }
    });

    const forgotPasswordLink = document.getElementById('forgotPassword');
    if(forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            if (!email) {
                alert('Please enter your email address to reset your password.');
                return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
            });
            if (error) {
                alert('Error sending password reset email: ' + error.message);
            } else {
                alert('Password reset link sent to your email.');
            }
        });
    }

    // Register modal
    const registerBtn = document.getElementById('registerBtn');
    const registerModal = document.getElementById('registerModal');
    const registerCloseBtn = registerModal.querySelector('.modal-close');
    
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            registerModal.classList.add('active');
        });
    }

    registerCloseBtn.addEventListener('click', () => {
        registerModal.classList.remove('active');
    });

    registerModal.addEventListener('click', (e) => {
        if (e.target === registerModal) {
            registerModal.classList.remove('active');
        }
    });
    
    // Modal switch links
    document.getElementById('switchToRegister').addEventListener('click', (e) => {
        e.preventDefault();
        loginModal.classList.remove('active');
        registerModal.classList.add('active');
    });
    
    document.getElementById('switchToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        registerModal.classList.remove('active');
        loginModal.classList.add('active');
    });

    // Auth forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
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

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    const { data, error } = await signIn(email, password);
    
    if (error) {
        alert('Login failed: ' + error.message);
        return;
    }
    
    location.reload();
}

async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const userType = document.getElementById('registerUserType').value;
    const name = document.getElementById('registerName').value;

    const { data, error } = await signUp(email, password, {
        user_type: userType,
        name: name
    });
    
    if (error) {
        alert('Registration failed: ' + error.message);
    } else {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('magicLinkMessage').style.display = 'block';
        document.getElementById('magicLinkMessage').textContent = 'Registration successful! Please check your email to verify your account.';
    }
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