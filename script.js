// Dynamic server URL based on environment
const getServerURL = () => {
    // Check if we're on localhost (development)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:3000';
    }
    
    // Check if we're on production (Vercel or custom domain)
    if (window.location.hostname.includes('vercel.app') || window.location.hostname === 'ciphertalk.dev') {
        // Railway backend URL
        return 'https://ciphertalk-app-production.up.railway.app';
    }
    
    // Fallback for other production environments
    return window.location.protocol === 'https:' 
        ? `https://${window.location.host}` 
        : `http://${window.location.host}`;
};

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
            const checkResponse = await fetch(`${getServerURL()}/check-username`, {
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
                alert('Username already exists. Please choose a different username.');
                return;
            }
            
            // Proceed with registration
            const registerResponse = await fetch(`${getServerURL()}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, passkey })
            });
            
            const registerResult = await registerResponse.json();
            
            if (registerResult.success) {
                alert('Registration successful! You can now login.');
                // Reset form and go back to main screen
                registerForm.reset();
                registerForm.style.display = 'none';
                pageTitle.style.display = 'block';
                titleImage.style.display = 'block';
                document.querySelector('.button-container').style.display = 'block';
            } else {
                alert('Registration failed: ' + registerResult.message);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        }
    });

    // Handle login
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        console.log('Login attempt:', { username, serverURL: getServerURL() });
        
        try {
            const response = await fetch(`${getServerURL()}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            
            console.log('Login response:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Login result:', result);
            
            if (result.success || result.message === 'Login successful') {
                // Store username in localStorage
                localStorage.setItem('currentUser', username);
                console.log('Login successful, redirecting to contacts.html');
                // Redirect to contacts page
                window.location.href = 'contacts.html';
            } else {
                console.error('Login failed:', result);
                alert('Login failed: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + error.message);
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