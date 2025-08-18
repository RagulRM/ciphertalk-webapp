// Server URL configuration
const getServerURL = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:3000';
    }
    return `${window.location.protocol}//${window.location.hostname}`;
};

// Warmup function to prevent cold starts
const warmupServer = async () => {
    try {
        console.log('🔥 Warming up server...');
        const response = await fetch(`${getServerURL()}/api/warmup`, {
            method: 'GET',
            cache: 'no-cache'
        });
        const data = await response.json();
        console.log('✅ Server warmed up:', data);
    } catch (error) {
        console.log('⚠️ Warmup failed (normal for first load):', error.message);
    }
};

// Warmup server when page loads
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    warmupServer();
}

// Debug function for console testing
window.debugAPI = {
    async testCheckUsername(username = 'testuser') {
        try {
            console.log('🧪 Testing /check-username with:', username);
            const response = await fetch(`${getServerURL()}/api/check-username`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            
            const data = await response.json();
            console.log('✅ Response status:', response.status);
            console.log('✅ Response data:', data);
            return { status: response.status, data };
        } catch (error) {
            console.error('❌ Error:', error);
            return { error: error.message };
        }
    },
    
    async testDbInspect() {
        try {
            console.log('🧪 Testing /api/db-inspect');
            const response = await fetch(`${getServerURL()}/api/db-inspect`);
            const data = await response.json();
            console.log('✅ DB Inspect Response:', data);
            return data;
        } catch (error) {
            console.error('❌ DB Inspect Error:', error);
            return { error: error.message };
        }
    },
    
    async testRegistration(username = 'debuguser', password = 'testpass', passkey = 'testkey') {
        try {
            console.log('🧪 Testing /api/test-registration');
            const response = await fetch(`${getServerURL()}/api/test-registration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, passkey })
            });
            
            const data = await response.json();
            console.log('✅ Registration Test Response:', data);
            return { status: response.status, data };
        } catch (error) {
            console.error('❌ Registration Test Error:', error);
            return { error: error.message };
        }
    }
};

console.log('🔧 Debug API loaded! Use: debugAPI.testCheckUsername(), debugAPI.testDbInspect(), debugAPI.testRegistration()');

// Popup system functions
function showPopup(type, title, message, buttonText = 'OK', callback = null) {
    const overlay = document.getElementById('popupOverlay');
    const icon = document.getElementById('popupIcon');
    const titleEl = document.getElementById('popupTitle');
    const messageEl = document.getElementById('popupMessage');
    const button = document.getElementById('popupButton');
    
    // Set icon based on type
    switch(type) {
        case 'success':
            icon.innerHTML = '✓';
            icon.className = 'popup-icon success';
            button.className = 'popup-button success';
            break;
        case 'error':
            icon.innerHTML = '✕';
            icon.className = 'popup-icon error';
            button.className = 'popup-button';
            break;
        case 'warning':
            icon.innerHTML = '⚠';
            icon.className = 'popup-icon warning';
            button.className = 'popup-button';
            break;
        default:
            icon.innerHTML = 'ℹ';
            icon.className = 'popup-icon';
            button.className = 'popup-button';
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    button.textContent = buttonText;
    
    // Show popup
    overlay.style.display = 'flex';
    
    // Handle button click
    const handleClick = () => {
        overlay.style.display = 'none';
        button.removeEventListener('click', handleClick);
        if (callback) callback();
    };
    
    button.addEventListener('click', handleClick);
    
    // Handle overlay click to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            if (callback) callback();
        }
    });
}

function showSuccessPopup(title, message, callback = null) {
    showPopup('success', title, message, 'OK', callback);
}

function showErrorPopup(title, message, callback = null) {
    showPopup('error', title, message, 'OK', callback);
}

function showWarningPopup(title, message, callback = null) {
    showPopup('warning', title, message, 'OK', callback);
}

document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const pageTitle = document.getElementById('pageTitle');
    const titleImage = document.getElementById('titleImage');
    const registerButton = document.getElementById('registerButton');
    const loginButton = document.getElementById('loginButton');
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const goBackRegister = document.getElementById('goBackRegister');
    const goBackLogin = document.getElementById('goBackLogin');

    // Check if all elements exist
    if (!pageTitle || !titleImage || !registerButton || !loginButton || !registerForm || !loginForm) {
        console.error('Some DOM elements are missing');
        return;
    }

    // Show register form
    registerButton.addEventListener('click', function() {
        pageTitle.style.display = 'none';
        titleImage.style.display = 'none';
        document.querySelector('.button-container').style.display = 'none';
        registerForm.style.display = 'block';
    });

    // Show login form
    loginButton.addEventListener('click', function() {
        pageTitle.style.display = 'none';
        titleImage.style.display = 'none';
        document.querySelector('.button-container').style.display = 'none';
        loginForm.style.display = 'block';
    });

    // Handle registration
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const passkey = document.getElementById('registerPasskey').value;
        
        console.log('Registration attempt:', { username, serverURL: getServerURL() });
        
        try {
            // Check if username exists
            const checkResponse = await fetch(`${getServerURL()}/api/check-username`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username })
            });
            
            console.log('Check username response:', checkResponse.status, checkResponse.statusText);
            
            if (!checkResponse.ok) {
                throw new Error(`Server error: ${checkResponse.status} ${checkResponse.statusText}`);
            }
            
            const checkResult = await checkResponse.json();
            
            if (checkResult.exists) {
                showWarningPopup('Username Taken', 'Username already exists. Please choose a different username.');
                return;
            }
            
            // Proceed with registration
            const registerResponse = await fetch(`${getServerURL()}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, passkey })
            });
            
            const registerResult = await registerResponse.json();
            
            if (registerResult.success) {
                showSuccessPopup('Registration Successful!', 'Your account has been created successfully. You can now login.', () => {
                    // Reset form and go back to main screen
                    registerForm.reset();
                    registerForm.style.display = 'none';
                    pageTitle.style.display = 'block';
                    titleImage.style.display = 'block';
                    document.querySelector('.button-container').style.display = 'block';
                });
            } else {
                showErrorPopup('Registration Failed', registerResult.message || 'Please try again.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showErrorPopup('Registration Error', 'Registration failed. Please check your connection and try again.');
        }
    });

    // Handle login
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        console.log('Login attempt:', { username, serverURL: getServerURL() });
        
        // Show loading state
        showErrorPopup('Connecting', 'Connecting to server...', false);
        
        try {
            // Retry mechanism for cold starts
            let response;
            let attempt = 0;
            const maxAttempts = 2;
            
            while (attempt < maxAttempts) {
                try {
                    response = await fetch(`${getServerURL()}/api/login`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ username, password }),
                        timeout: 30000 // 30 second timeout for cold starts
                    });
                    break; // Success, exit retry loop
                } catch (fetchError) {
                    attempt++;
                    if (attempt < maxAttempts) {
                        showErrorPopup('Server Starting', `Server starting up... Retrying (${attempt}/${maxAttempts})`, false);
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                    } else {
                        throw fetchError;
                    }
                }
            }
            
            console.log('Login response:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                if (response.status === 503 && errorData?.code === 'DATABASE_NOT_READY') {
                    throw new Error('Server is starting up. Please try again in a moment.');
                }
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Login result:', result);
            
            if (result.success || result.message === 'Login successful') {
                // Store username in localStorage
                localStorage.setItem('username', username);
                console.log('Login successful, redirecting to contacts.html');
                // Redirect to contacts page
                window.location.href = 'contacts.html';
            } else {
                console.error('Login failed:', result);
                showErrorPopup('Login Failed', result.message === 'Invalid credentials' ? 'Invalid username or password. Please try again.' : (result.message || 'Unknown error occurred.'));
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes('Server is starting up')) {
                showErrorPopup('Server Starting', 'The server is starting up. Please try again in a moment.');
            } else {
                showErrorPopup('Login Error', 'Unable to connect to server. Please check your connection and try again.');
            }
        }
    });

    // Go back buttons
    goBackRegister.addEventListener('click', function(e) {
        e.preventDefault();
        registerForm.style.display = 'none';
        pageTitle.style.display = 'block';
        titleImage.style.display = 'block';
        document.querySelector('.button-container').style.display = 'block';
    });

    goBackLogin.addEventListener('click', function(e) {
        e.preventDefault();
        loginForm.style.display = 'none';
        pageTitle.style.display = 'block';
        titleImage.style.display = 'block';
        document.querySelector('.button-container').style.display = 'block';
    });
});