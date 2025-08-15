import React, { useCallback, useState } from 'react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Dynamic server URL configuration
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
  return `${window.location.protocol}//${window.location.hostname}:3000`;
};

function ImageSteganographyHandler({
  sender,
  receiver,
  message,
  passkey,
  onUploadComplete
}) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const validateFile = useCallback((file) => {
    console.log('[DEBUG] validateFile called with:', file.name, 'size:', file.size);
    if (!file) {
      throw new Error('No file provided');
    }
    if (file.size > MAX_FILE_SIZE) {
      console.log('[DEBUG] File too large:', file.size);
      throw new Error('File size must be less than 5MB');
    }
    console.log('[DEBUG] File is valid:', file.name);
    return true;
  }, []);

  const processAndSendImage = useCallback(async (file) => {
    try {
      console.log('[DEBUG] processAndSendImage called with:', file.name);
      setStatus('processing');
      setProgress(0);
      setError(null);

      // Validate inputs
      if (!sender || !receiver || !message) {
        console.log('[DEBUG] Missing required parameters:', { sender, receiver, message });
        throw new Error('Missing required parameters');
      }

      validateFile(file);

      // Create form data
      const formData = new FormData();
      formData.append('image', file);
      formData.append('sender', sender);
      formData.append('message', message);
      formData.append('passkey', passkey);

      setProgress(25);

      console.log('[DEBUG] Sending FormData to server for steganography');

      // Post to stego endpoint
      const response = await fetch(`${getServerURL()}/api/messages/stego`, {
        method: 'POST',
        body: formData
      });

      setProgress(50);

      if (!response.ok) {
        console.log('[DEBUG] Response is not ok:', response.status, response.statusText);
        throw new Error(`Steganography request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[DEBUG] Steganography response data:', data);

      if (!data.success) {
        throw new Error(data.message || 'Steganography request failed');
      }

      // Send the resulting stego file path as a message
      setProgress(75);
      console.log('[DEBUG] Sending stego image to chat endpoint');
      const sendMessageResponse = await fetch(`${getServerURL()}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender,
          receiver,
          content: data.imageUrl,
          type: 'stego'
        })
      });

      if (!sendMessageResponse.ok) {
        console.log('[DEBUG] Sending stego message not ok:', sendMessageResponse.status);
        throw new Error(`Failed to send stego message: ${sendMessageResponse.status}`);
      }

      console.log('[DEBUG] Stego message sent successfully');
      setProgress(100);
      setStatus('completed');
      onUploadComplete && onUploadComplete(data.imageUrl);
    } catch (err) {
      console.error('[DEBUG] Error in processAndSendImage:', err);
      setError(err.message);
      setStatus('error');
    }
  }, [sender, receiver, message, passkey, onUploadComplete, validateFile]);

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    await processAndSendImage(file);
  };

  return (
    <div className="image-steganography-handler">
      <div>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>
      <div>Status: {status}</div>
      <div>Progress: {progress}%</div>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
    </div>
  );
}

export default ImageSteganographyHandler;