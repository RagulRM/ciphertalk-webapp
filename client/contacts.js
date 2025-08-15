// Dynamic server URL based on environment
const SERVER_URL = (() => {
    // Check if we're on localhost (development)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:3000';
    }
    
    // Check if we're on Vercel (production frontend)
    if (window.location.hostname.includes('vercel.app')) {
        // Replace with your Railway backend URL
        return 'https://ciphertalk-app-production.up.railway.app';
    }
    
    // Fallback for other production environments
    return `${window.location.protocol}//${window.location.hostname}:3000`;
})();
let currentUser = null;
let selectedUser = null;

// Debug logging utility
function debugLog(message, error = null) {
    console.log(`[DEBUG] ${message}`);
    if (error) {
        console.error(error);
    }
}

// Response validation helper
function validateResponse(response, context) {
    if (!response.ok) {
        debugLog(`Response not OK for ${context}`, response);
        throw new Error(`${context} failed: ${response.status} ${response.statusText}`);
    }
    debugLog(`Response OK for ${context}`, response);
    return response;
}

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        debugLog('Starting application initialization');
        const username = localStorage.getItem('username');
        if (!username) {
            debugLog('No username found in localStorage, redirecting to login');
            window.location.href = '/login.html';
            return;
        }
        
        currentUser = username;
        await initializeApp();
        debugLog('Initialization complete');
    } catch (error) {
        debugLog('Error during initialization', error);
        showError('There was an error loading the application. Please refresh the page.');
    }
});

function initializeApp() {
    debugLog('Initializing main UI components');
    const chatHeader = document.querySelector('.chat-header');
    const chatInputArea = document.querySelector('.chat-input-area');
    const selectedUserPic = document.getElementById('selectedUserPic');
    const messageInput = document.createElement('textarea');
    
    // Hide chat input area and profile picture initially
    if (chatInputArea) {
        chatInputArea.style.display = 'none';
        debugLog('Chat input area hidden');
    }
    if (selectedUserPic) {
        selectedUserPic.style.display = 'none';
        debugLog('Selected user pic hidden');
    }
    
    // Add message input
    messageInput.id = 'messageInput';
    messageInput.placeholder = 'Type your message...';
    if (chatInputArea) {
        chatInputArea.insertBefore(messageInput, chatInputArea.firstChild);
    }
    // resetChatSection();
    setupContactListClickHandler();
    
    Promise.all([
        updateUserDisplay(),
        loadContacts()
    ]).then(() => {
        setupEventListeners();
        debugLog('Application ready for user interaction');
    }).catch(error => {
        debugLog('Error in initializeApp Promise.all', error);
        showError('An error occurred while loading contacts or user information.');
    });
}

function setupContactListClickHandler() {
    const contactsList = document.getElementById('contactsList');
    const sidebar = document.querySelector('.sidebar');

    if (sidebar) {
        sidebar.addEventListener('click', (event) => {
            if (event.target === sidebar || event.target === contactsList) {
                debugLog('Clicked outside contact items, resetting chat section');
                resetChatSection();
            }
        });
    }
}

// User display and profile functions
async function updateUserDisplay() {
    const usernameElement = document.getElementById('currentUsername');
    const profilePicElement = document.getElementById('userProfilePic');
    
    if (usernameElement) {
        usernameElement.textContent = currentUser;
        debugLog(`Set current user display: ${currentUser}`);
    }
    
    if (profilePicElement) {
        try {
            await updateProfilePicture(profilePicElement, currentUser);
        } catch (error) {
            debugLog('Error updating profile picture', error);
        }
    }
}

async function updateProfilePicture(imgElement, username) {
    debugLog(`Fetching profile picture for ${username}`);
    const response = await fetch(`${SERVER_URL}/api/user/${username}/profile-picture`);
    await validateResponse(response, 'Profile picture fetch');
    
    const data = await response.json();
    if (data.success) {
        imgElement.src = getFullImageUrl(data.profilePicture);
        debugLog(`Updated user profile pic: ${imgElement.src}`);
        imgElement.onerror = () => {
            debugLog('Profile pic load error, using default');
            imgElement.src = 'resources/default-profile-pic.jpg';
        };
    } else {
        debugLog('Profile picture fetch returned success=false', data);
        imgElement.src = 'resources/default-profile-pic.jpg';
    }
}

function getFullImageUrl(imagePath) {
    if (!imagePath) {
        return 'resources/default-profile-pic.jpg';
    }
    return imagePath.startsWith('http')
        ? imagePath
        : `${SERVER_URL}/${imagePath.replace(/^\//, '')}`;
}

// Contacts management
async function loadContacts() {
    debugLog('Loading contacts from server...');
    const response = await fetch(`${SERVER_URL}/api/contacts`);
    await validateResponse(response, 'Contacts fetch');
    
    const contacts = await response.json();
    debugLog(`Contacts loaded: ${contacts.length} contacts found`);
    
    const contactsList = document.getElementById('contactsList');
    if (!contactsList) {
        debugLog('No contactsList element found');
        return;
    }
    
    contactsList.innerHTML = '';
    contacts
        .filter(contact => contact.username !== currentUser)
        .forEach(contact => {
            contactsList.appendChild(createContactElement(contact));
        });
}

function createContactElement(contact) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    
    const img = document.createElement('img');
    img.src = getFullImageUrl(contact.profilePicture);
    img.alt = `${contact.username}'s profile`;
    img.className = 'profile-pic';
    img.onerror = () => {
        debugLog(`Profile pic load error for user ${contact.username}, using default`);
        img.src = 'resources/default-profile-pic.jpg';
    };

    const span = document.createElement('span');
    span.textContent = contact.username;
    
    div.append(img, span);
    div.addEventListener('click', () => {
        debugLog(`Contact selected: ${contact.username}`);
        selectContact(contact);
    });
    
    return div;
}

function selectContact(contact) {
    selectedUser = contact;
    debugLog(`selectedUser set to: ${contact.username}`);
    
    const selectedUsername = document.getElementById('selectedUsername');
    const selectedUserPic = document.getElementById('selectedUserPic');
    const chatHeader = document.querySelector('.chat-header');
    const chatInputArea = document.querySelector('.chat-input-area');
    
    if (selectedUsername) {
        selectedUsername.textContent = contact.username;
        selectedUsername.style.display = 'block';
        debugLog(`Displayed selected username: ${contact.username}`);
    }
    
    if (selectedUserPic) {
        selectedUserPic.src = getFullImageUrl(contact.profilePicture);
        selectedUserPic.style.display = 'block';
        selectedUserPic.onerror = () => {
            debugLog(`Profile pic load error in chat for ${contact.username}, using default`);
            selectedUserPic.src = 'resources/default-profile-pic.jpg';
        };
    }

    if (chatHeader) {
        chatHeader.style.display = 'flex';
        chatHeader.style.justifyContent = 'flex-start';
        chatHeader.classList.add('active-chat');
    }

    if (chatInputArea) {
        chatInputArea.style.display = 'flex';
    }
    
    loadChatHistory(contact.username);
}

function resetChatSection() {
    debugLog('Resetting chat section');
    selectedUser = null;
    const chatHeader = document.querySelector('.chat-header');
    const chatInputArea = document.querySelector('.chat-input-area');
    const selectedUserPic = document.getElementById('selectedUserPic');
    const selectedUsername = document.getElementById('selectedUsername');
    const chatMessages = document.getElementById('chatMessages');

    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
    if (chatInputArea) {
        chatInputArea.style.display = 'none';
    }
    
    if (selectedUserPic) {
        selectedUserPic.style.display = 'none';
        selectedUserPic.src = '';
    }
    
    if (selectedUsername) {
        selectedUsername.textContent = 'Select a contact to start chatting';
        selectedUsername.style.display = 'block';
    }
    
    if (chatHeader) {
        chatHeader.style.display = 'flex';
        chatHeader.style.justifyContent = 'center';
        chatHeader.classList.remove('active-chat');
    }
}

// Chat history and message handling
async function loadChatHistory(contactUsername) {
    debugLog(`Loading chat history for ${contactUsername}`);
    const response = await fetch(`${SERVER_URL}/api/messages/${currentUser}/${contactUsername}`);
    await validateResponse(response, 'Chat history fetch');
    
    const messages = await response.json();
    debugLog(`Loaded ${messages.length} messages`);

    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) {
        debugLog('No chatMessages element found');
        return;
    }
    
    chatMessages.innerHTML = '';
    messages.forEach(message => displayMessage(message));
}

function displayMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) {
        debugLog('Cannot display message, no chatMessages element found', message);
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender === currentUser ? 'sent' : 'received'}`;

    switch (message.type) {
        case 'text':
            debugLog('Displaying text message', message);
            messageDiv.textContent = message.content;
            break;
                
        case 'encrypted':
            debugLog('Displaying RSA-AES encrypted message', message);
            messageDiv.className += ' encrypted-message';
            
            // Create encrypted message display with lock icon and hint
            const encryptedContent = document.createElement('div');
            encryptedContent.className = 'encrypted-content';
            encryptedContent.innerHTML = `
                <div class="encrypted-icon">🔒</div>
                <div class="encrypted-text">Encrypted Message</div>
                <div class="encrypted-hint">Click to decrypt</div>
            `;
            
            messageDiv.appendChild(encryptedContent);
            addDecryptButton(messageDiv, message);
            break;
                
        case 'stego':
            debugLog('Displaying stego message', message);
            const img = document.createElement('img');
            img.src = getFullImageUrl(message.content);
            img.className = 'stego-image';
            img.onerror = function() {
                debugLog('Failed to load stego image, using fallback', img.src);
                this.src = 'resources/fallback-image.png';
            };
            messageDiv.appendChild(img);
            addDecryptButton(messageDiv, message);
            break;
            
        default:
            debugLog(`Unknown message type: ${message.type}`, message);
            messageDiv.textContent = message.content;
            break;
    }
    
    chatMessages.appendChild(messageDiv);
}

// Enhanced steganography message display with proper decrypt button
function addDecryptButton(messageDiv, message) {
    if (message.type === 'stego') {
        // For steganography images, add a more prominent decrypt button
        const stegoContainer = document.createElement('div');
        stegoContainer.className = 'stego-container';
        stegoContainer.style.position = 'relative';
        stegoContainer.style.display = 'inline-block';
        
        // Move the image into the container
        const img = messageDiv.querySelector('.stego-image');
        if (img) {
            messageDiv.removeChild(img);
            stegoContainer.appendChild(img);
        }
        
        const decryptBtn = document.createElement('button');
        decryptBtn.className = 'stego-decrypt-button';
        decryptBtn.innerHTML = '🔍 Extract Hidden Message';
        decryptBtn.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            opacity: 0;
        `;
        
        // Show button on hover
        stegoContainer.addEventListener('mouseenter', () => {
            decryptBtn.style.opacity = '1';
        });
        
        stegoContainer.addEventListener('mouseleave', () => {
            decryptBtn.style.opacity = '0.7';
        });
        
        decryptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            debugLog('Steganography decrypt button clicked', message);
            decryptMessage(message);
        });
        
        stegoContainer.appendChild(decryptBtn);
        messageDiv.appendChild(stegoContainer);
        
    } else {
        // For regular encrypted messages, use the standard decrypt button
        const decryptBtn = document.createElement('button');
        decryptBtn.className = 'decrypt-button';
        decryptBtn.textContent = 'Decrypt';

        decryptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            debugLog('Decrypt button clicked', message);
            decryptMessage(message);
        });

        messageDiv.appendChild(decryptBtn);
    }

    // Add click handler for the message itself to trigger decryption
    messageDiv.addEventListener('click', (e) => {
        // Only trigger decryption if receiver is viewing the message
        if (message.receiver === currentUser) {
            e.stopPropagation();
            debugLog('Message clicked for decryption', message);
            decryptMessage(message);
        } else {
            // For senders, show the original message if available
            if (message.originalText && message.sender === currentUser) {
                e.stopPropagation();
                debugLog('Sender viewing own message', message);
                showDecryptedMessage(message.originalText, false, 'Your Original Message');
            }
        }
        
        // Remove any active class from other messages
        document.querySelectorAll('.message.active').forEach(msg => {
            msg.classList.remove('active');
        });
        messageDiv.classList.add('active');
    });
}

// Message sending functions
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    let content = messageInput.value.trim();
    
    if (!content || !selectedUser) {
        debugLog('No content or no selectedUser, skipping sendMessage');
        return;
    }
    
    content = capitalizeFirstLetter(content);
    debugLog(`Sending message to ${selectedUser.username}: ${content}`);
    
    try {
        const response = await fetch(`${SERVER_URL}/api/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender: currentUser,
                receiver: selectedUser.username,
                content,
                type: 'text'
            })
        });
        
        await validateResponse(response, 'Message send');
        const result = await response.json();
        debugLog(`Message send response received`, result);
        
        if (result.success) {
            messageInput.value = '';
            await loadChatHistory(selectedUser.username);
            showMessage('Message sent successfully');
            
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else {
            throw new Error(result.message || 'Failed to send message');
        }
    } catch (error) {
        debugLog('Error sending message', error);
        showError('Failed to send message. Please try again.');
    }
}

function capitalizeFirstLetter(string) {
    if (!string) return string;
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function encryptMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content || !selectedUser) {
        debugLog('No content or no selectedUser, skipping encryptMessage');
        return;
    }
    
    debugLog(`Encrypting message for ${selectedUser.username} using RSA-AES hybrid encryption`);
    
    try {
        // Use the server's RSA-AES hybrid encryption endpoint
        const response = await fetch(`${SERVER_URL}/api/messages/send-encrypted`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender: currentUser,
                receiver: selectedUser.username,
                message: content
            })
        });
        
        await validateResponse(response, 'RSA-AES encrypted message send');
        const result = await response.json();
        debugLog(`RSA-AES encrypted message send response received:`, result);
        
        if (result.success) {
            messageInput.value = '';
            await loadChatHistory(selectedUser.username);
            showMessage('Encrypted message sent successfully');
            
            // Scroll to bottom
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else {
            throw new Error(result.message || 'Failed to send encrypted message');
        }
    } catch (error) {
        debugLog('Error sending RSA-AES encrypted message', error);
        showError('Failed to send encrypted message. Please try again.');
    }
}

// Update the steganographyMessage function to implement RSA-AES hybrid encryption with LSB steganography
async function steganographyMessage() {
    debugLog('Starting RSA-AES steganography process');
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || !selectedUser) {
        showError('Please enter a message and select a recipient');
        return;
    }

    try {
        // Step 1: Show file picker for image selection
        debugLog('Opening file picker for image selection');
        
        // Create a hidden file input for image selection
        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.style.display = 'none';
        document.body.appendChild(imageInput);
        
        // Handle file selection
        const filePromise = new Promise((resolve, reject) => {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                document.body.removeChild(imageInput);
                if (file) {
                    resolve(file);
                } else {
                    reject(new Error('No file selected'));
                }
            });
        });
        
        // Trigger file picker
        imageInput.click();
        
        // Wait for file selection
        const file = await filePromise;
        debugLog(`Selected file: ${file.name} (${file.size} bytes)`);
        
        // Add loading indicator to chat
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message sent loading';
        loadingDiv.innerHTML = `
            <div class="stego-loading-inline">
                <div class="stego-animation-mini">
                    <div class="image-icon">
                        <i class="fa fa-image"></i>
                    </div>
                    <div class="encryption-process">
                        <div class="step-indicators">
                            <div class="step-dot active"></div>
                            <div class="step-dot"></div>
                            <div class="step-dot"></div>
                        </div>
                        <div class="loading-text">Hiding message in image...</div>
                    </div>
                </div>
                <div class="progress-line">
                    <div class="progress-fill-line"></div>
                </div>
            </div>
        `;
        
        const chatContainer = document.getElementById('chatMessages');
        chatContainer.appendChild(loadingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Animate the loading steps
        setTimeout(() => {
            const stepDots = loadingDiv.querySelectorAll('.step-dot');
            const loadingText = loadingDiv.querySelector('.loading-text');
            const progressFill = loadingDiv.querySelector('.progress-fill-line');
            
            let currentStep = 1;
            const stepInterval = setInterval(() => {
                if (currentStep < stepDots.length) {
                    stepDots[currentStep].classList.add('active');
                    
                    if (currentStep === 1) {
                        loadingText.textContent = 'Encrypting message...';
                        progressFill.style.width = '66%';
                    } else if (currentStep === 2) {
                        loadingText.textContent = 'Finalizing steganography...';
                        progressFill.style.width = '100%';
                    }
                    currentStep++;
                } else {
                    clearInterval(stepInterval);
                }
            }, 1000);
        }, 500);
        
        // Step 2: Send to server for RSA-AES encryption + LSB steganography
        const formData = new FormData();
        formData.append('image', file);
        formData.append('message', message);
        formData.append('sender', currentUser);
        formData.append('receiver', selectedUser.username);
        formData.append('bits', '4'); // LSB bit depth
        
        debugLog('Sending RSA-AES steganography request to server');
        
        const stegoResponse = await fetch(`${SERVER_URL}/api/messages/stego/send`, {
            method: 'POST',
            body: formData
        });
        
        if (!stegoResponse.ok) {
            throw new Error(`Server error: ${stegoResponse.status}`);
        }

        // Parse the steganography response
        const stegoData = await stegoResponse.json();
        debugLog('RSA-AES steganography response:', stegoData);
        
        if (!stegoData.success) {
            throw new Error(stegoData.message || 'Unknown steganography error');
        }
        
        // Remove loading popup
        removeSteganographyLoadingPopup();
        
        // Success - update UI
        messageInput.value = '';
        loadingDiv.remove();
        showMessage('Steganography message sent successfully! The image looks normal but contains your encrypted message.');
        
        // Reload the chat to show the new steganography image
        await loadChatHistory(selectedUser.username);
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
    } catch (error) {
        // Remove loading popup if it exists
        removeSteganographyLoadingPopup();
        
        // Remove loading indicator if it exists
        const loadingIndicator = document.querySelector('.loading');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        debugLog('Error in RSA-AES steganography process:', error);
        showError(`Steganography failed: ${error.message}`);
    }
}

// Remove the old decryptStegoMessage function as it's now integrated into decryptMessage
// Update CSS for enhanced steganography UI and modal styling
const styles = `
.stego-image {
    max-width: 300px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.stego-image:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.stego-container {
    position: relative;
    display: inline-block;
    max-width: 100%;
}

.stego-decrypt-button {
    transition: opacity 0.3s ease, transform 0.2s ease;
}

.stego-decrypt-button:hover {
    transform: translateY(-2px);
    background: rgba(0, 0, 0, 0.9) !important;
}

.decrypt-button {
    display: none;
    position: absolute;
    right: -70px;
    top: 50%;
    transform: translateY(-50%);
    background: #ff6b6b;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.message.encrypted-message:hover .decrypt-button {
    display: block;
}

.decrypt-button:hover {
    background: #ff5252;
    transform: translateY(-50%) scale(1.05);
}

.loading-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 8px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.stego-status {
    margin-top: 8px;
    font-size: 12px;
    color: #bdc3c7;
    font-style: italic;
}

/* Enhanced Modal Styling with Project Theme */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.modal-content {
    background: linear-gradient(135deg, #2e2e2e 0%, #1e1e1e 100%);
    color: #ffffff;
    padding: 30px;
    border-radius: 15px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    animation: slideIn 0.3s ease;
    border: 1px solid #444;
}

@keyframes slideIn {
    from { 
        transform: translateY(-50px);
        opacity: 0;
    }
    to { 
        transform: translateY(0);
        opacity: 1;
    }
}

.modal-header {
    font-size: 1.4em;
    font-weight: bold;
    margin-bottom: 20px;
    text-align: center;
    color: #ff6b6b;
    border-bottom: 2px solid #444;
    padding-bottom: 15px;
}

.modal-body {
    margin-bottom: 25px;
    line-height: 1.6;
}

.modal-input {
    width: 100%;
    padding: 12px;
    background: #444;
    border: 2px solid #666;
    border-radius: 8px;
    color: #fff;
    font-size: 16px;
    margin: 10px 0;
    transition: border-color 0.3s ease;
}

.modal-input:focus {
    outline: none;
    border-color: #ff6b6b;
    box-shadow: 0 0 10px rgba(255, 107, 107, 0.3);
}

.modal-input::placeholder {
    color: #888;
}

.modal-buttons {
    display: flex;
    gap: 15px;
    justify-content: flex-end;
}

.modal-button {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    font-size: 14px;
    transition: all 0.3s ease;
    min-width: 100px;
}

.modal-button.primary {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%);
    color: white;
}

.modal-button.primary:hover {
    background: linear-gradient(135deg, #ff5252 0%, #ff4444 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
}

.modal-button.secondary {
    background: #666;
    color: white;
}

.modal-button.secondary:hover {
    background: #777;
    transform: translateY(-2px);
}

/* Sender Preview Modal Styling */
.sender-preview .modal-header {
    color: #3498db;
}

.message-preview {
    text-align: center;
}

.preview-message {
    background: #444;
    padding: 15px;
    border-radius: 8px;
    margin: 15px 0;
    border-left: 4px solid #3498db;
    font-style: italic;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Passkey Verification Modal Styling */
.passkey-verification .modal-header {
    color: #f39c12;
}

/* Passkey Display Modal Styling */
.passkey-display .modal-header {
    color: #f39c12;
}

.passkey-container {
    text-align: center;
}

.passkey-value {
    background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    color: white;
    padding: 20px;
    border-radius: 10px;
    margin: 20px 0;
    font-size: 1.2em;
    font-weight: bold;
    letter-spacing: 2px;
    font-family: 'Courier New', monospace;
    border: 2px solid rgba(243, 156, 18, 0.3);
    box-shadow: 0 4px 15px rgba(243, 156, 18, 0.2);
    user-select: all;
    cursor: text;
}

.passkey-value:hover {
    transform: scale(1.02);
    box-shadow: 0 6px 20px rgba(243, 156, 18, 0.3);
}

.passkey-info {
    background: rgba(243, 156, 18, 0.1);
    border-radius: 8px;
    padding: 15px;
    margin: 15px 0;
    border-left: 3px solid #f39c12;
    text-align: left;
}

.passkey-info ul {
    margin: 10px 0;
    padding-left: 20px;
}

.passkey-info li {
    margin: 5px 0;
    color: #bdc3c7;
    font-size: 14px;
}

/* Decryption Result Modal Styling */
.decryption-result .modal-header {
    color: #27ae60;
}

.decrypted-content {
    text-align: center;
    padding: 20px;
}

.success-content {
    background: linear-gradient(135deg, rgba(39, 174, 96, 0.1) 0%, rgba(46, 204, 113, 0.1) 100%);
    border-radius: 10px;
    border: 1px solid rgba(39, 174, 96, 0.3);
}

.error-content {
    background: linear-gradient(135deg, rgba(231, 76, 60, 0.1) 0%, rgba(192, 57, 43, 0.1) 100%);
    border-radius: 10px;
    border: 1px solid rgba(231, 76, 60, 0.3);
}

.error-content .modal-header {
    color: #e74c3c;
}

.success-icon, .error-icon {
    font-size: 2em;
    margin-bottom: 15px;
}

.message-text {
    background: rgba(255, 255, 255, 0.1);
    padding: 15px;
    border-radius: 8px;
    margin: 15px 0;
    word-wrap: break-word;
    max-height: 200px;
    overflow-y: auto;
}

.security-note {
    margin-top: 15px;
    padding: 10px;
    background: rgba(52, 152, 219, 0.1);
    border-left: 3px solid #3498db;
    border-radius: 4px;
}

.security-note small {
    color: #bdc3c7;
    font-size: 12px;
}

/* Message hover effects */
.message {
    transition: all 0.3s ease;
    cursor: pointer;
}

.message:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.2);
}

.message.encrypted-message {
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(255, 82, 82, 0.1) 100%);
    border: 1px solid rgba(255, 107, 107, 0.3);
}

.encrypted-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px;
}

.encrypted-icon {
    font-size: 1.5em;
    margin-bottom: 8px;
}

.encrypted-text {
    font-weight: bold;
    margin-bottom: 5px;
}

.encrypted-hint {
    font-size: 12px;
    color: #bdc3c7;
    font-style: italic;
}

/* Success and Error Messages */
.success-message, .error-message {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    z-index: 10001;
    animation: slideInRight 0.3s ease;
}

.success-message {
    background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
    border-left: 4px solid #27ae60;
}

.error-message {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    border-left: 4px solid #e74c3c;
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

/* Responsive Design */
@media (max-width: 768px) {
    .modal-content {
        width: 95%;
        padding: 20px;
        margin: 10px;
    }
    
    .modal-buttons {
        flex-direction: column;
    }
    
    .modal-button {
        width: 100%;
        margin-bottom: 10px;
    }
    
    .stego-decrypt-button {
        position: static !important;
        margin-top: 10px;
        opacity: 1 !important;
        display: block;
        width: 100%;
    }
}
`;

// Add styles to document
if (!document.querySelector('#custom-modal-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'custom-modal-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}


// Encryption/Decryption utilities
async function promptPasskey() {
    debugLog('Displaying passkey prompt for RSA private key decryption');
    return new Promise((resolve) => {
        const modalHtml = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">🔐 Enter Your Personal Unlock Key</div>
                    <div class="modal-body">
                        <p><strong>To decrypt this message, enter your personal unlock key.</strong></p>
                        <p>This is the same passphrase you created when you registered.</p>
                        <input type="password" class="modal-input" placeholder="Enter your personal unlock key..." />
                        <div class="security-note">
                            <small>🔒 Your unlock key never leaves your device and is used to decrypt your private encryption key.</small>
                        </div>
                    </div>
                    <div class="modal-buttons">
                        <button class="modal-button secondary" data-action="cancel">Cancel</button>
                        <button class="modal-button primary" data-action="confirm">Decrypt Message</button>
                    </div>
                </div>
            </div>
        `;

        const modalElement = createElementFromHTML(modalHtml);
        document.body.appendChild(modalElement);

        const input = modalElement.querySelector('.modal-input');
        input.focus();

        function handleModalAction(action) {
            modalElement.remove();
            if (action === 'confirm') {
                debugLog('Personal unlock key confirmed by user');
                resolve(input.value);
            } else {
                debugLog('Passkey prompt cancelled by user');
                resolve(null);
            }
        }

        modalElement.querySelectorAll('.modal-button').forEach(button => {
            button.addEventListener('click', () => {
                handleModalAction(button.dataset.action);
            });
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleModalAction('confirm');
            }
        });

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escapeHandler);
                handleModalAction('cancel');
            }
        });
    });
}

function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

// Show steganography loading popup with cool animations
function showSteganographyLoadingPopup(type) {
    // Remove any existing loading popup
    removeSteganographyLoadingPopup();
    
    // Create loading popup overlay
    const overlay = document.createElement('div');
    overlay.id = 'steganographyLoadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-modal stego-loading">
            <div class="loading-content">
                <div class="stego-animation">
                    <div class="image-container">
                        <div class="image-placeholder">
                            <i class="fa fa-image"></i>
                        </div>
                        <div class="pixels-overlay">
                            <div class="pixel pixel-1"></div>
                            <div class="pixel pixel-2"></div>
                            <div class="pixel pixel-3"></div>
                            <div class="pixel pixel-4"></div>
                            <div class="pixel pixel-5"></div>
                            <div class="pixel pixel-6"></div>
                        </div>
                    </div>
                    <div class="encryption-flow">
                        <div class="flow-arrow">
                            <i class="fa fa-arrow-down"></i>
                        </div>
                        <div class="encryption-icon">
                            <i class="fa fa-lock"></i>
                        </div>
                    </div>
                </div>
                <h3 class="loading-title">${type === 'sender' ? 'Hiding Message in Image' : 'Extracting Hidden Message'}</h3>
                <div class="loading-steps">
                    <div class="step active" data-step="1">
                        <div class="step-icon"><i class="fa fa-shield-alt"></i></div>
                        <span>RSA-AES Encryption</span>
                    </div>
                    <div class="step" data-step="2">
                        <div class="step-icon"><i class="fa fa-image"></i></div>
                        <span>LSB Steganography</span>
                    </div>
                    <div class="step" data-step="3">
                        <div class="step-icon"><i class="fa fa-check"></i></div>
                        <span>Finalizing</span>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <p class="loading-description">
                    ${type === 'sender' ? 
                        'Encrypting your message and hiding it in image pixels...' : 
                        'Extracting and decrypting hidden message from image...'}
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate steps
    setTimeout(() => {
        const steps = overlay.querySelectorAll('.step');
        const progressFill = overlay.querySelector('.progress-fill');
        
        let currentStep = 1;
        const stepInterval = setInterval(() => {
            if (currentStep <= steps.length) {
                // Activate current step
                steps[currentStep - 1].classList.add('active');
                
                // Update progress bar
                const progress = (currentStep / steps.length) * 100;
                progressFill.style.width = `${progress}%`;
                
                currentStep++;
            } else {
                clearInterval(stepInterval);
            }
        }, 1500);
    }, 500);
}

// Remove steganography loading popup
function removeSteganographyLoadingPopup() {
    const overlay = document.getElementById('steganographyLoadingOverlay');
    if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// Show inline steganography decryption loading in chat
function showInlineSteganographyDecryption() {
    // Remove any existing loading
    removeInlineSteganographyDecryption();
    
    // Create inline modal similar to passkey prompt
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content stego-decryption-modal">
                <div class="modal-header">
                    <i class="fas fa-image"></i>
                    Extracting Hidden Message
                </div>
                <div class="modal-body">
                    <div class="stego-decryption-content">
                        <div class="decryption-animation">
                            <div class="image-scanner">
                                <div class="scanner-line"></div>
                                <i class="fa fa-image scanner-icon"></i>
                            </div>
                            <div class="extraction-process">
                                <div class="process-dots">
                                    <div class="dot active"></div>
                                    <div class="dot"></div>
                                    <div class="dot"></div>
                                    <div class="dot"></div>
                                </div>
                                <div class="process-text">Analyzing image pixels...</div>
                            </div>
                        </div>
                        <div class="decryption-steps">
                            <div class="step active">
                                <i class="fas fa-search"></i>
                                <span>Scanning LSB layers</span>
                            </div>
                            <div class="step">
                                <i class="fas fa-puzzle-piece"></i>
                                <span>Extracting data</span>
                            </div>
                            <div class="step">
                                <i class="fas fa-unlock-alt"></i>
                                <span>Decrypting message</span>
                            </div>
                        </div>
                        <div class="progress-container">
                            <div class="progress-bar-inline">
                                <div class="progress-fill-inline"></div>
                            </div>
                            <div class="progress-text">Processing... This may take a moment</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalElement = createElementFromHTML(modalHtml);
    document.body.appendChild(modalElement);
    
    // Animate the process
    setTimeout(() => {
        const dots = modalElement.querySelectorAll('.dot');
        const steps = modalElement.querySelectorAll('.step');
        const progressFill = modalElement.querySelector('.progress-fill-inline');
        const processText = modalElement.querySelector('.process-text');
        
        let currentDot = 1;
        let currentStep = 1;
        
        const animationInterval = setInterval(() => {
            // Activate dots progressively
            if (currentDot < dots.length) {
                dots[currentDot].classList.add('active');
                currentDot++;
            }
            
            // Activate steps progressively
            if (currentStep < steps.length) {
                steps[currentStep].classList.add('active');
                
                // Update text based on step
                switch(currentStep) {
                    case 1:
                        processText.textContent = 'Extracting hidden data...';
                        progressFill.style.width = '66%';
                        break;
                    case 2:
                        processText.textContent = 'Decrypting message...';
                        progressFill.style.width = '100%';
                        break;
                }
                currentStep++;
            }
            
            if (currentDot >= dots.length && currentStep >= steps.length) {
                clearInterval(animationInterval);
            }
        }, 1500);
    }, 500);
}

// Remove inline steganography decryption loading
function removeInlineSteganographyDecryption() {
    const modal = document.querySelector('.stego-decryption-modal');
    if (modal && modal.parentElement) {
        modal.parentElement.classList.add('fade-out');
        setTimeout(() => {
            if (modal.parentElement && modal.parentElement.parentElement) {
                modal.parentElement.parentElement.removeChild(modal.parentElement);
            }
        }, 300);
    }
}

// Remove steganography decryption loading popup
function removeSteganographyDecryptionPopup() {
    const overlay = document.getElementById('steganographyDecryptionOverlay');
    if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

async function decryptMessage(message) {
    debugLog('Starting RSA-AES decryption process', message);
    
    // For RSA-AES encrypted messages, prompt for the user's passkey
    // This passkey will unlock their private RSA key stored on the server
    const passkey = await promptPasskey();
    if (!passkey) {
        debugLog('No passkey entered, canceling decryption');
        return;
    }

    try {
        let decryptedContent;

        if (message.type === 'stego') {
            debugLog('Decrypting RSA-AES steganography message');
            
            // Show inline steganography decryption loading in chat
            showInlineSteganographyDecryption();
            
            // For steganography messages with RSA-AES hybrid encryption:
            // 1. Server extracts the encrypted payload from image pixels (LSB)
            // 2. Server decrypts the RSA-encrypted AES session key using user's private key
            // 3. Server decrypts the AES-encrypted message using the session key and IV
            // 4. Returns the original plaintext message
            
            const response = await fetch(`${SERVER_URL}/api/messages/stego/decrypt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: message.content,
                    username: currentUser,
                    passkey: passkey
                })
            });

            if (!response.ok) {
                // Remove loading popup
                removeInlineSteganographyDecryption();
                throw new Error('Failed to decrypt steganography message - server error');
            }

            const result = await response.json();
            if (!result.success) {
                // Remove loading popup
                removeInlineSteganographyDecryption();
                throw new Error(result.message || 'Steganography decryption failed');
            }

            decryptedContent = result.decryptedMessage;
            
            // Remove loading popup
            removeInlineSteganographyDecryption();
            
        } else if (message.type === 'encrypted') {
            debugLog('Decrypting RSA-AES encrypted message via server');
            
            // For RSA-AES encrypted messages, use the server's decryption endpoint
            // The server will:
            // 1. Use the passkey to decrypt the user's private RSA key
            // 2. Use the private RSA key to decrypt the AES session key
            // 3. Use the AES session key and IV to decrypt the message content
            
            const response = await fetch(`${SERVER_URL}/api/messages/decrypt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: message._id,
                    username: currentUser,
                    passkey: passkey
                })
            });

            if (!response.ok) {
                throw new Error('Failed to decrypt message - server error');
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Decryption failed');
            }

            decryptedContent = result.decryptedMessage;
        }

        if (!decryptedContent) {
            throw new Error('Decryption failed - invalid passkey or corrupted message');
        }

        debugLog('Message decrypted successfully');
        showDecryptedMessage(decryptedContent);
        
    } catch (error) {
        // Remove any loading popups that might still be showing
        removeInlineSteganographyDecryption();
        removeSteganographyDecryptionPopup();
        removeSteganographyLoadingPopup();
        
        debugLog('Decryption failed:', error);
        showError(`Decryption failed: ${error.message}`);
    }
}
function showDecryptedMessage(message, isError = false, title = null) {
    debugLog(`Showing decrypted message: ${message}, isError=${isError}`);
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content decryption-result">
                <div class="modal-header">
                    ${isError ? '❌ Decryption Error' : (title || '🔓 Decrypted Message')}
                </div>
                <div class="modal-body">
                    <div class="decrypted-content ${isError ? 'error-content' : 'success-content'}">
                        ${isError ? `<div class="error-icon">⚠️</div>` : `<div class="success-icon">✅</div>`}
                        <div class="message-text">${message}</div>
                        ${!isError ? `
                            <div class="security-note">
                                <small>🔐 This message was securely decrypted using your personal unlock key</small>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-button primary" data-action="close">Close</button>
                </div>
            </div>
        </div>
    `;

    const modalElement = createElementFromHTML(modalHtml);
    document.body.appendChild(modalElement);

    modalElement.querySelector('.modal-button').addEventListener('click', () => {
        debugLog('Closing decrypted message modal');
        modalElement.remove();
    });

    // Click outside to close
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) {
            modalElement.remove();
        }
    });

    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            debugLog('Escape key pressed, closing decrypted message modal');
            document.removeEventListener('keydown', escapeHandler);
            modalElement.remove();
        }
    });
}

// Event listeners setup
function setupEventListeners() {
    debugLog('Setting up event listeners for the UI');
    const elements = {
        sendBtn: ['click', sendMessage],
        encryptBtn: ['click', encryptMessage],
        stegoBtn: ['click', steganographyMessage],
        searchInput: ['input', handleSearch],
        messageInput: ['keydown', handleMessageInputKeydown],
        showPasskeyBtn: ['click', showUserPasskey]
    };

    Object.entries(elements).forEach(([id, [event, handler]]) => {
        const element = document.getElementById(id);
        if (element) {
            debugLog(`Adding event listener for ${id} on ${event}`);
            element.addEventListener(event, handler);
        } else {
            debugLog(`Element with ID ${id} not found`);
        }
    });

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', handleMessageInput);
    }
    document.addEventListener('click', () => {
        document.querySelectorAll('.message.active').forEach(msg => {
            msg.classList.remove('active');
        });
    });
}

function handleMessageInput(event) {
    const input = event.target;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    
    if (input.value.length === 1) {
        input.value = input.value.toUpperCase();
        input.setSelectionRange(start, end);
    } else if (input.value.length === 0) {
        input.setAttribute('data-empty', 'true');
    }
}

function handleMessageInputKeydown(event) {
    const messageInput = event.target;
    if (event.key === 'Enter' && !event.shiftKey) {
        debugLog('Enter pressed, sending message');
        event.preventDefault();
        sendMessage();
    } else if (event.key === 'Enter' && event.shiftKey) {
        debugLog('Shift+Enter pressed, adding new line');
        const start = messageInput.selectionStart;
        const end = messageInput.selectionEnd;
        const value = messageInput.value;
        messageInput.value = value.substring(0, start) + '\n' + value.substring(end);
        messageInput.selectionStart = messageInput.selectionEnd = start + 1;
        event.preventDefault();
    }
}

// Function to show user's passkey after password verification
async function showUserPasskey() {
    debugLog('Show passkey button clicked');
    
    const password = await promptPassword();
    if (!password) {
        debugLog('No password entered, canceling passkey view');
        return;
    }

    try {
        // Verify password with server and get passkey
        console.log('Sending password verification request...');
        const response = await fetch(`${SERVER_URL}/api/auth/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser,
                password: password
            })
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Error response:', errorText);
            throw new Error(`Failed to verify password: ${response.status}`);
        }

        const result = await response.json();
        console.log('Password verification result:', result);
        
        if (!result.success) {
            throw new Error(result.message || 'Invalid password');
        }

        // Show the passkey
        console.log('About to display passkey:', result.passkey);
        displayPasskey(result.passkey);
        
    } catch (error) {
        console.error('Error in showUserPasskey:', error);
        debugLog('Error verifying password:', error);
        showError(`Password verification failed: ${error.message}`);
    }
}

// Function to prompt for password
async function promptPassword() {
    debugLog('Displaying password prompt for passkey viewing');
    return new Promise((resolve) => {
        const modalHtml = `
            <div class="modal-overlay">
                <div class="modal-content passkey-verification">
                    <div class="modal-header">🔑 View Your Personal Unlock Key</div>
                    <div class="modal-body">
                        <p><strong>Enter your login password to view your personal unlock key</strong></p>
                        <p>This is for security purposes to protect your passkey.</p>
                        <input type="password" class="modal-input" placeholder="Enter your login password..." />
                        <div class="security-note">
                            <small>🔒 Your password is verified securely and never stored on the client side.</small>
                        </div>
                    </div>
                    <div class="modal-buttons">
                        <button class="modal-button secondary" data-action="cancel">Cancel</button>
                        <button class="modal-button primary" data-action="confirm">Verify Password</button>
                    </div>
                </div>
            </div>
        `;

        const modalElement = createElementFromHTML(modalHtml);
        document.body.appendChild(modalElement);

        const input = modalElement.querySelector('.modal-input');
        input.focus();

        function handleModalAction(action) {
            modalElement.remove();
            if (action === 'confirm') {
                debugLog('Password entered by user');
                resolve(input.value);
            } else {
                debugLog('Password prompt cancelled by user');
                resolve(null);
            }
        }

        modalElement.querySelectorAll('.modal-button').forEach(button => {
            button.addEventListener('click', () => {
                handleModalAction(button.dataset.action);
            });
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleModalAction('confirm');
            }
        });

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escapeHandler);
                handleModalAction('cancel');
            }
        });
    });
}

// Function to display the passkey
function displayPasskey(passkey) {
    console.log('displayPasskey called with:', passkey);
    debugLog('Displaying user passkey:', passkey);
    
    // Remove any existing passkey modal first
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        console.log('Removing existing modal');
        existingModal.remove();
    }
    
    const modalHtml = `
        <div class="modal-overlay">
            <div class="modal-content passkey-modal">
                <div class="modal-header">
                    <i class="fas fa-key"></i>
                    Your Personal Unlock Key
                </div>
                <div class="modal-body">
                    <div class="passkey-container">
                        <p><strong>Your personal unlock key is:</strong></p>
                        <div class="passkey-value">
                            <code>${passkey}</code>
                        </div>
                        <div class="passkey-info">
                            <div class="info-item">
                                <i class="fas fa-shield-alt"></i>
                                <span>This key is used to decrypt your private encryption key</span>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-lock"></i>
                                <span>Keep this safe and never share it with anyone</span>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-envelope"></i>
                                <span>You need this key to decrypt encrypted messages sent to you</span>
                            </div>
                        </div>
                        <div class="security-note">
                            <i class="fas fa-info-circle"></i>
                            <small>This key was created when you registered and is unique to your account.</small>
                        </div>
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-button primary" data-action="close">
                        <i class="fas fa-times"></i>
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;

    console.log('Creating passkey modal element...');
    const modalElement = createElementFromHTML(modalHtml);
    console.log('Modal element created:', modalElement);
    
    if (!modalElement) {
        console.error('Failed to create modal element');
        return;
    }
    
    document.body.appendChild(modalElement);
    console.log('Modal element appended to body');
    
    // Force display with important styles
    modalElement.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.8) !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        z-index: 10000 !important;
    `;

    const closeButton = modalElement.querySelector('.modal-button');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            console.log('Close button clicked');
            debugLog('Closing passkey display modal');
            modalElement.remove();
        });
    }

    // Click outside to close
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) {
            console.log('Clicked outside modal');
            modalElement.remove();
        }
    });

    // Escape key to close
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            console.log('Escape key pressed');
            debugLog('Escape key pressed, closing passkey display modal');
            document.removeEventListener('keydown', escapeHandler);
            modalElement.remove();
        }
    };
    
    document.addEventListener('keydown', escapeHandler);
    
    console.log('Passkey modal should now be visible');
}

// Search functionality
function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    debugLog(`Handling search, term = "${searchTerm}"`);
    const contactItems = document.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        const username = item.querySelector('span').textContent.toLowerCase();
        item.style.display = username.includes(searchTerm) ? 'flex' : 'none';
    });
}

// Error and success messages
function showError(message) {
    debugLog(`Error: ${message}`);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showMessage(message) {
    debugLog(`Showing message: ${message}`);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success-message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}
