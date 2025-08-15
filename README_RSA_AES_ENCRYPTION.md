# CipherTalk RSA-AES Hybrid Encryption System

## Overview
CipherTalk now implements a secure RSA-AES hybrid encryption system that provides end-to-end encryption for messages. This system combines the security of RSA public-key cryptography with the efficiency of AES symmetric encryption.

## How It Works

### Registration (New User Experience)
When a user registers:

1. **User creates a passkey** - This is their personal unlock key (like a password)
2. **App generates RSA key pair** (2048-bit):
   - **Public Key**: Stored on the server for others to find
   - **Private Key**: Encrypted with the user's passkey and stored locally in the database
3. **Passkey protection**: The private key is useless without the passkey

**Behind the scenes:**
- RSA key pair generation using Node-RSA library
- Private key encryption using AES-256-CBC with scrypt key derivation
- Public key stored in MongoDB for message encryption
- Encrypted private key stored securely in database

### Sending Encrypted Messages (Sender's Side)

**User Experience:**
1. Type message → Click "Encrypt" → Send
2. No passwords needed (uses receiver's public key automatically)

**Technical Process:**
1. **Generate AES session key** - Random 256-bit key for this message only
2. **Encrypt message with AES** - Fast symmetric encryption of the actual content
3. **Encrypt AES key with RSA** - Uses receiver's public key to lock the session key
4. **Send package** containing:
   - Encrypted message (AES output)
   - Encrypted AES key (RSA output)
   - Initialization Vector (IV)

### Receiving Encrypted Messages (Receiver's Side)

**User Experience:**
1. See encrypted message → Click "Decrypt" → Enter passkey → View message

**Technical Process:**
1. **Prompt for passkey** - User enters their personal unlock key
2. **Decrypt private RSA key** - Uses passkey to unlock stored private key
3. **Decrypt AES session key** - Uses private RSA key to unlock the session key
4. **Decrypt message** - Uses recovered AES key and IV to decrypt the message
5. **Display result** - Show the original message

## Security Features

### End-to-End Encryption
- Messages are encrypted on sender's device
- Only the intended receiver can decrypt (with their passkey)
- Server never sees unencrypted content

### Key Security
- Private keys are encrypted with user passphrases
- Each message uses a unique AES session key
- RSA 2048-bit keys for strong public-key security

### Zero-Knowledge Design
- Server stores only encrypted private keys
- No plaintext messages or keys stored
- Passkeys never stored or transmitted

## API Endpoints

### New Encryption Endpoints

#### Send Encrypted Message
```
POST /api/messages/send-encrypted
Body: {
  sender: "username",
  receiver: "username", 
  message: "plaintext message"
}
```

#### Decrypt Message
```
POST /api/messages/decrypt
Body: {
  messageId: "message_id",
  username: "receiver_username",
  passkey: "user_passkey"
}
```

#### Get User's Public Key
```
GET /api/user/:username/public-key
Returns: { success: true, publicKey: "RSA_PUBLIC_KEY" }
```

## Database Schema Updates

### User Schema
```javascript
{
  username: String,
  password: String (hashed),
  passkey: String,
  publicKey: String,           // RSA public key
  encryptedPrivateKey: String, // RSA private key encrypted with passkey
  profilePicture: String
}
```

### Message Schema
```javascript
{
  sender: String,
  receiver: String,
  content: String,           // Encrypted message content
  type: String,             // 'text', 'encrypted', 'stego'
  encryptedAESKey: String,  // AES key encrypted with RSA
  iv: String,               // Initialization vector for AES
  timestamp: Date
}
```

## UI/UX Improvements

### Enhanced Encrypted Message Display
- 🔒 Lock icon with "Encrypted Message" label
- Gradient background (blue theme)
- Hover effects and animations
- "Click to decrypt" hint
- Professional decrypt button

### User Flow
1. **Registration**: Simple passkey creation (RSA keys generated silently)
2. **Sending**: One-click encryption (no password needed)
3. **Receiving**: Click decrypt → Enter passkey → View message

## Technical Implementation

### Server-Side (Node.js)
- **Node-RSA** library for RSA operations
- **crypto** module for AES encryption
- **scrypt** for key derivation from passphrases
- MongoDB for secure key storage

### Client-Side (JavaScript)
- Clean UI for encrypted messages
- Seamless integration with existing chat system
- Error handling and user feedback
- Modal dialogs for decrypted content

## Security Considerations

### Threats Mitigated
- **Eavesdropping**: All messages encrypted end-to-end
- **Server compromise**: Private keys are encrypted, useless without passphrases
- **Message interception**: Each message uses unique encryption keys
- **Replay attacks**: IVs ensure encryption uniqueness

### User Responsibilities
- **Passkey security**: Users must protect their passphrases
- **Device security**: Encrypted private keys stored locally
- **Passkey recovery**: Lost passphrases mean lost access (by design)

## Backward Compatibility

The system maintains compatibility with:
- Existing plain text messages
- Steganography feature
- Current UI/UX patterns
- Legacy encrypted messages (will attempt old decryption method as fallback)

## Usage Instructions

### For New Users
1. Register with username, password, and create a passkey
2. System automatically generates your encryption keys
3. Start sending encrypted messages immediately

### For Existing Users
- Next registration will generate RSA keys
- Old messages remain accessible
- New encrypted messages use RSA-AES system

### Sending Encrypted Messages
1. Open chat with contact
2. Type your message
3. Click "Encrypt" button
4. Message sent automatically

### Reading Encrypted Messages
1. Click on encrypted message (🔒 icon)
2. Enter your passkey when prompted
3. View decrypted content in popup

## Technical Benefits

1. **Performance**: AES encryption for message content (fast)
2. **Security**: RSA encryption for key exchange (secure)
3. **Scalability**: Unique session keys per message
4. **Usability**: Transparent encryption/decryption process
5. **Future-proof**: Standard cryptographic algorithms

This implementation provides military-grade encryption while maintaining a user-friendly experience comparable to popular messaging apps.
