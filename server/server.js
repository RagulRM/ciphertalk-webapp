const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const jimp = require('jimp');
const crypto = require('crypto');
const NodeRSA = require('node-rsa');
require('dotenv').config();

// CipherTalk Server - Latest Version Sync
// Deployment Timestamp: 2025-08-17 - Force Latest Code Sync
const app = express();

// Middleware
app.use(express.json());
// Dynamic CORS configuration
const allowedOrigins = [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'https://ciphertalk.dev',
    'https://www.ciphertalk.dev',
    'https://ciphertalk-6xzrl4szk-ragul-ravis-projects.vercel.app'
];

// Add production domain (replace with your actual domain)
if (process.env.PRODUCTION_DOMAIN) {
    allowedOrigins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
    allowedOrigins.push(`http://${process.env.PRODUCTION_DOMAIN}`);
}

// Add Railway domain if available
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] - ${req.method} ${req.url}`);
    next();
});

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created uploads directory at:', uploadDir);
}

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB Database');
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB Database', err);
    });

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    passkey: { type: String, required: true },
    publicKey: { type: String, required: true }, // RSA public key for receiving encrypted messages
    encryptedPrivateKey: { type: String, required: true }, // RSA private key encrypted with passkey
    profilePicture: { type: String, default: 'resources/Default.jpg' }
});

const User = mongoose.model('User', UserSchema);

// Multer configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            console.log('Uploads folder created at:', uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const outName = Date.now() + path.extname(file.originalname);
        console.log('Storing uploaded file as:', outName);
        cb(null, outName);
    }
});

const upload = multer({ storage: storage });

// Message Schema
const MessageSchema = new mongoose.Schema({
    sender:    { type: String, required: true },
    receiver:  { type: String, required: true },
    content:   { type: String, required: true },
    type:      { type: String, enum: ['text','encrypted','stego'], required: true },
    encryptedAESKey: String,
    iv:             String,
    originalText:   String,               // <–– new field
    timestamp:      { type: Date, default: Date.now }
  });
  const Message = mongoose.model('Message', MessageSchema);

// Encryption Utility Functions
class EncryptionUtils {
    // Generate RSA key pair
    static generateRSAKeyPair() {
        const key = new NodeRSA({ b: 2048 });
        return {
            publicKey: key.exportKey('public'),
            privateKey: key.exportKey('private')
        };
    }

    // Encrypt private key with passkey
    static encryptPrivateKey(privateKey, passkey) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(passkey, 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAutoPadding(true);
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    // Decrypt private key with passkey
    static decryptPrivateKey(encryptedPrivateKey, passkey) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(passkey, 'salt', 32);
            
            const textParts = encryptedPrivateKey.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = textParts.join(':');
            
            const decipher = crypto.createDecipher(algorithm, key);
            decipher.setAutoPadding(true);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Invalid passkey');
        }
    }

    // Generate AES key and IV
    static generateAESKey() {
        return {
            key: crypto.randomBytes(32), // 256-bit key
            iv: crypto.randomBytes(16)   // 128-bit IV
        };
    }

    // Encrypt message with AES
    static encryptWithAES(message, aesKey, iv) {
        const cipher = crypto.createCipher('aes-256-cbc', aesKey);
        cipher.setAutoPadding(true);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    // Decrypt message with AES
    static decryptWithAES(encryptedMessage, aesKey, iv) {
        const decipher = crypto.createDecipher('aes-256-cbc', aesKey);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encryptedMessage, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Encrypt AES key with RSA public key
    static encryptAESKeyWithRSA(aesKey, publicKey) {
        const key = new NodeRSA(publicKey);
        return key.encrypt(aesKey, 'base64');
    }

    // Decrypt AES key with RSA private key
    static decryptAESKeyWithRSA(encryptedAESKey, privateKey) {
        const key = new NodeRSA(privateKey);
        return key.decrypt(encryptedAESKey, 'buffer');
    }
}

// Get user's public key
app.get('/api/user/:username/public-key', async (req, res) => {
    console.log('GET /api/user/:username/public-key triggered for username:', req.params.username);
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            console.log('User not found:', req.params.username);
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Check if user has RSA keys, if not generate them
        if (!user.publicKey || !user.encryptedPrivateKey) {
            console.log('User missing RSA keys, generating them...');
            const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
            const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, user.passkey);
            
            user.publicKey = publicKey;
            user.encryptedPrivateKey = encryptedPrivateKey;
            await user.save();
            console.log('RSA keys generated and saved for user:', req.params.username);
        }
        
        console.log('Returning public key for:', req.params.username);
        res.json({ success: true, publicKey: user.publicKey });
    } catch (error) {
        console.error('Error fetching public key:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Generate RSA keys for existing users
app.post('/api/user/:username/generate-keys', async (req, res) => {
    console.log('POST /api/user/:username/generate-keys triggered for username:', req.params.username);
    try {
        const { passkey } = req.body;
        if (!passkey) {
            return res.status(400).json({ success: false, message: 'Passkey is required' });
        }
        
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            console.log('User not found:', req.params.username);
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Verify passkey
        if (user.passkey !== passkey) {
            return res.status(400).json({ success: false, message: 'Invalid passkey' });
        }
        
        // Generate RSA keys
        console.log('Generating RSA keys for existing user:', req.params.username);
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);
        
        user.publicKey = publicKey;
        user.encryptedPrivateKey = encryptedPrivateKey;
        await user.save();
        
        console.log('RSA keys generated and saved for existing user:', req.params.username);
        res.json({ success: true, message: 'RSA keys generated successfully' });
    } catch (error) {
        console.error('Error generating RSA keys:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get user profile
app.get('/api/user/:username/profile-picture', async (req, res) => {
    console.log('GET /api/user/:username/profile-picture triggered for username:', req.params.username);
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            console.log('User not found:', req.params.username);
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        console.log('Returning profile picture for:', req.params.username);
        res.json({ success: true, profilePicture: user.profilePicture });
    } catch (error) {
        console.error('Error fetching profile picture:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all contacts
app.get('/api/contacts', async (req, res) => {
    console.log('GET /api/contacts triggered');
    try {
        const users = await User.find({}, { username: 1, profilePicture: 1, _id: 0 });
        console.log('Contacts found:', users.length);
        res.json(users);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get chat history
app.get('/api/messages/:user1/:user2', async (req, res) => {
    console.log('GET /api/messages/:user1/:user2 triggered. Users:', req.params.user1, 'and', req.params.user2);
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.params.user1, receiver: req.params.user2 },
                { sender: req.params.user2, receiver: req.params.user1 }
            ]
        }).sort('timestamp');
        console.log('Chat history length:', messages.length);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Error fetching chat history' });
    }
});

// Send encrypted message
app.post('/api/messages/send-encrypted', async (req, res) => {
    console.log('POST /api/messages/send-encrypted triggered with body:', req.body);
    try {
        const { sender, receiver, message } = req.body;
        
        // Get receiver's public key
        const receiverUser = await User.findOne({ username: receiver });
        if (!receiverUser) {
            return res.status(404).json({ success: false, message: 'Receiver not found' });
        }

        // Generate AES key and IV
        const { key: aesKey, iv } = EncryptionUtils.generateAESKey();
        
        // Encrypt message with AES
        const encryptedMessage = EncryptionUtils.encryptWithAES(message, aesKey, iv);
        
        // Encrypt AES key with receiver's RSA public key
        const encryptedAESKey = EncryptionUtils.encryptAESKeyWithRSA(aesKey, receiverUser.publicKey);
        
        // Save encrypted message
        const newMessage = new Message({
            sender,
            receiver,
            content: encryptedMessage,
            type: 'encrypted',
            encryptedAESKey,
            iv: iv.toString('hex'),
            originalText: message       // <–– store the plaintext
        });
        await newMessage.save();
        console.log('Encrypted message saved:', newMessage);
        res.status(201).json({ success: true, message: 'Encrypted message sent successfully' });
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        res.status(500).json({ success: false, message: 'Error sending encrypted message' });
    }
});

// Decrypt message
app.post('/api/messages/decrypt', async (req, res) => {
    console.log('POST /api/messages/decrypt triggered with body:', req.body);
    try {
        const { messageId, username, passkey } = req.body;
        
        // Get the encrypted message
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        // Get user's encrypted private key
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Decrypt private key with passkey
        const privateKey = EncryptionUtils.decryptPrivateKey(user.encryptedPrivateKey, passkey);
        
        // Decrypt AES key with RSA private key
        const aesKey = EncryptionUtils.decryptAESKeyWithRSA(message.encryptedAESKey, privateKey);
        const iv = Buffer.from(message.iv, 'hex');
        
        // Decrypt message with AES
        const decryptedMessage = EncryptionUtils.decryptWithAES(message.content, aesKey, iv);
        
        res.json({ success: true, decryptedMessage });
    } catch (error) {
        console.error('Error decrypting message:', error);
        res.status(500).json({ success: false, message: 'Error decrypting message. Invalid passkey?' });
    }
});

// Send message
app.post('/api/messages/send', async (req, res) => {
    console.log('POST /api/messages/send triggered with body:', req.body);
    try {
        const { sender, receiver, content, type } = req.body;
        const message = new Message({
            sender,
            receiver,
            content,
            type
        });
        await message.save();
        console.log('Message saved:', message);
        res.status(201).json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message', error);
        res.status(500).json({ success: false, message: 'Error sending message' });
    }
});

// Ensure stego uploads directory exists
const stegoUploadDir = path.join(__dirname, 'uploads', 'stego');
if (!fs.existsSync(stegoUploadDir)) {
    fs.mkdirSync(stegoUploadDir, { recursive: true });
    console.log('Created stego uploads directory at:', stegoUploadDir);
}

// Steganography endpoint
// Update steganography endpoint to save images in 'uploads/stego'
app.post('/api/messages/stego', upload.single('image'), async (req, res) => {
    if (!req.file || !req.body.message) {
        return res.status(400).json({
            success: false,
            message: 'Image and message are required'
        });
    }

    try {
        console.log('Processing steganography request...');
        const image = await jimp.read(req.file.path);
        const message = req.body.message;
        const bits = parseInt(req.body.bits) || 4;

        console.log('Image loaded, dimensions:', image.getWidth(), 'x', image.getHeight());
        console.log('Message length:', message.length);

        // Validate capacity
        const capacity = Math.floor((image.getWidth() * image.getHeight() * 3 * bits) / 8);
        if (message.length > capacity) {
            throw new Error('Message too large for image capacity');
        }

        // Apply LSB steganography
        const stegoImage = await embedMessageInImage(image, message, bits);
        
        // Generate unique filename
        const outputFilename = `stego_${Date.now()}.png`;
        const outputPath = path.join(stegoUploadDir, outputFilename);
        
        // Save the processed image
        await stegoImage.writeAsync(outputPath);
        console.log('Stego image saved at:', outputPath);
        
        // Clean up original uploaded file
        fs.unlinkSync(req.file.path);
        console.log('Original file cleaned up');

        // Return the URL that can be used to access the image
        const imageUrl = `/uploads/stego/${outputFilename}`;
        console.log('Returning image URL:', imageUrl);

        res.json({
            success: true,
            imageUrl: imageUrl,
            message: 'Steganography successful'
        });
    } catch (error) {
        console.error('Steganography error:', error);
        
        // Clean up files on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: `Steganography failed: ${error.message}`
        });
    }
});

// Enhanced steganography endpoint with RSA-AES encryption
app.post('/api/messages/stego/send', upload.single('image'), async (req, res) => {
    console.log('POST /api/messages/stego/send triggered');
    
    if (!req.file || !req.body.message || !req.body.sender || !req.body.receiver) {
        return res.status(400).json({
            success: false,
            message: 'Image, message, sender, and receiver are required'
        });
    }

    try {
        const { message, sender, receiver } = req.body;
        const bits = parseInt(req.body.bits) || 4;

        console.log('Processing RSA-AES steganography request...');
        
        // Get receiver's public key
        const receiverUser = await User.findOne({ username: receiver });
        if (!receiverUser) {
            return res.status(404).json({ success: false, message: 'Receiver not found' });
        }

        // Generate AES key and IV
        const { key: aesKey, iv } = EncryptionUtils.generateAESKey();
        
        // Encrypt message with AES
        const encryptedMessage = EncryptionUtils.encryptWithAES(message, aesKey, iv);
        
        // Encrypt AES key with receiver's RSA public key
        const encryptedAESKey = EncryptionUtils.encryptAESKeyWithRSA(aesKey, receiverUser.publicKey);

        // Create payload to hide in image (encrypted message + metadata)
        const payload = JSON.stringify({
            encryptedMessage,
            encryptedAESKey,
            iv: iv.toString('hex'),
            sender,
            receiver
        });

        // Load and process image
        const image = await jimp.read(req.file.path);
        console.log('Image loaded, dimensions:', image.getWidth(), 'x', image.getHeight());

        // Validate capacity
        const capacity = Math.floor((image.getWidth() * image.getHeight() * 3 * bits) / 8);
        if (payload.length > capacity) {
            throw new Error('Message too large for image capacity');
        }

        // Apply LSB steganography with encrypted payload
        const stegoImage = await embedMessageInImage(image, payload, bits);
        
        // Generate unique filename
        const outputFilename = `stego_${Date.now()}.png`;
        const outputPath = path.join(stegoUploadDir, outputFilename);
        
        // Save the processed image
        await stegoImage.writeAsync(outputPath);
        console.log('Stego image with encrypted payload saved at:', outputPath);
        
        // Clean up original uploaded file
        fs.unlinkSync(req.file.path);

        // Save message to database
        const newMessage = new Message({
            sender,
            receiver,
            content: `/uploads/stego/${outputFilename}`,
            type: 'stego',
            encryptedAESKey,
            iv: iv.toString('hex'),
            originalText: message
        });
        await newMessage.save();

        res.json({
            success: true,
            imageUrl: `/uploads/stego/${outputFilename}`,
            message: 'RSA-AES steganography message sent successfully'
        });
    } catch (error) {
        console.error('RSA-AES steganography error:', error);
        
        // Clean up files on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: `RSA-AES steganography failed: ${error.message}`
        });
    }
});

// Steganography decryption endpoint
app.post('/api/messages/stego/decrypt', async (req, res) => {
    console.log('POST /api/messages/stego/decrypt triggered');
    
    try {
        const { imageUrl, username, passkey } = req.body;
        
        if (!imageUrl || !username || !passkey) {
            return res.status(400).json({
                success: false,
                message: 'Image URL, username, and passkey are required'
            });
        }

        // Get user's encrypted private key
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Verify passkey and decrypt private key
        const privateKey = EncryptionUtils.decryptPrivateKey(user.encryptedPrivateKey, passkey);

        // Load image from URL
        const imagePath = path.join(__dirname, imageUrl.replace('/uploads/', 'uploads/'));
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        const image = await jimp.read(imagePath);
        console.log('Image loaded for steganography decryption');

        // Extract payload from image
        const extractedPayload = await extractMessageFromImage(image, 4);
        const payload = JSON.parse(extractedPayload);

        // Decrypt AES key with RSA private key
        const aesKey = EncryptionUtils.decryptAESKeyWithRSA(payload.encryptedAESKey, privateKey);
        const iv = Buffer.from(payload.iv, 'hex');

        // Decrypt message with AES
        const decryptedMessage = EncryptionUtils.decryptWithAES(payload.encryptedMessage, aesKey, iv);

        res.json({
            success: true,
            decryptedMessage
        });

    } catch (error) {
        console.error('Steganography decryption error:', error);
        res.status(500).json({
            success: false,
            message: `Decryption failed: ${error.message}`
        });
    }
});

// Steganography extraction endpoint (legacy)
app.post('/api/messages/stego/extract', upload.single('image'), async (req, res) => {
    console.log('POST /api/messages/stego/extract triggered');
    const bits = Math.min(Math.max(parseInt(req.body.bits) || 1, 1), 4);
    if (!req.file) {
        console.error('No file provided');
        return res.status(400).json({
            success: false,
            message: 'Image is required'
        });
    }

    try {
        const image = await jimp.read(req.file.path);
        console.log('Image loaded for extraction:', req.file.path);
        const extractedMessage = await extractMessageFromImage(image, bits);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log('Removed uploaded file post-extraction:', req.file.path);

        res.json({
            success: true,
            message: extractedMessage
        });
    } catch (error) {
        console.error('Message extraction error:', error);

        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('Cleaned up file after extraction error:', req.file.path);
        }

        res.status(500).json({
            success: false,
            message: `Failed to extract message: ${error.message}`
        });
    }
});

// Add this near the top of server.js, after requires
const testUploadDir = () => {
    const uploadDir = path.join(__dirname, 'uploads');
    
    // Check if directory exists
    if (!fs.existsSync(uploadDir)) {
        console.log('Creating uploads directory...');
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Test write permissions
    try {
        const testFile = path.join(uploadDir, 'test-permissions.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('✓ Upload directory permissions verified');
    } catch (error) {
        console.error('❌ Upload directory permission error:', error);
        process.exit(1);
    }

    // Verify static serving
    return new Promise((resolve) => {
        const testPath = '/uploads/test-serve.txt';
        const testFile = path.join(uploadDir, 'test-serve.txt');
        
        fs.writeFileSync(testFile, 'test');
        
        // Test static file serving
        fetch(`http://localhost:${process.env.PORT || 3000}${testPath}`)
            .then(res => {
                fs.unlinkSync(testFile);
                if (res.ok) {
                    console.log('✓ Static file serving verified');
                    resolve(true);
                } else {
                    console.error('❌ Static serving not working');
                    resolve(false);
                }
            })
            .catch(err => {
                fs.unlinkSync(testFile);
                console.error('❌ Static serving error:', err);
                resolve(false);
            });
    });
};



// Embed message into image
async function embedMessageInImage(image, message, bits) {
    console.log('Starting embedMessageInImage');
    try {
        const messageWithMeta = `${message.length}%%%${message}`;
        const binaryMessage = Buffer.from(messageWithMeta, 'utf8')
            .toString('binary')
            .split('')
            .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
            .join('');

        const width = image.getWidth();
        const height = image.getHeight();
        const totalChannels = width * height * 3 * bits;

        console.log('Message binary length:', binaryMessage.length);
        console.log('Available capacity:', totalChannels);

        if (binaryMessage.length > totalChannels) {
            throw new Error('Message too large for image capacity');
        }

        let msgIndex = 0;
        for (let y = 0; y < height && msgIndex < binaryMessage.length; y++) {
            for (let x = 0; x < width && msgIndex < binaryMessage.length; x++) {
                const pixelColor = image.getPixelColor(x, y);
                const rgba = jimp.intToRGBA(pixelColor);
                
                ['r', 'g', 'b'].forEach(channel => {
                    if (msgIndex < binaryMessage.length) {
                        let channelValue = rgba[channel];
                        let bitsToSet = binaryMessage.substr(msgIndex, bits).padEnd(bits, '0');
                        channelValue = (channelValue & (~((1 << bits) - 1))) | parseInt(bitsToSet, 2);
                        rgba[channel] = channelValue;
                        msgIndex += bits;
                    }
                });
                
                const newPixelColor = jimp.rgbaToInt(rgba.r, rgba.g, rgba.b, rgba.a);
                image.setPixelColor(newPixelColor, x, y);
            }
        }

        console.log('Message embedded successfully');
        return image;
    } catch (error) {
        console.error('Error in embedMessageInImage:', error);
        throw new Error(`Failed to embed message: ${error.message}`);
    }
}

// Extract message from image
async function extractMessageFromImage(image, bits) {
    console.log('extractMessageFromImage called');
    try {
        const width = image.getWidth();
        const height = image.getHeight();
        let binaryMessage = '';

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = jimp.intToRGBA(image.getPixelColor(x, y));
                ['r', 'g', 'b'].forEach(channel => {
                    const bitsFromChannel = (pixel[channel] & ((1 << bits) - 1))
                        .toString(2)
                        .padStart(bits, '0');
                    binaryMessage += bitsFromChannel;
                });
            }
        }

        // Convert binary to text
        const bytes = [];
        for (let i = 0; i + 8 <= binaryMessage.length; i += 8) {
            bytes.push(parseInt(binaryMessage.substr(i, 8), 2));
        }

        const messageWithMeta = Buffer.from(bytes).toString('utf8');

        // Parse the message with metadata
        const parts = messageWithMeta.split('%%%');
        if (parts.length < 2) {
            throw new Error('Invalid message format');
        }

        const length = parseInt(parts[0], 10);
        const extractedMessage = parts[1].substring(0, length);

        return extractedMessage;
    } catch (error) {
        throw new Error(`Failed to extract message: ${error.message}`);
    }
}

// Verify user's passkey
app.post('/api/verify-passkey', async (req, res) => {
    console.log('POST /api/verify-passkey triggered:', req.body);
    try {
        const { username, passkey } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            console.log('User not found for verify-passkey:', username);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isValid = user.passkey === passkey;
        console.log('Passkey valid:', isValid);
        res.json({ success: isValid });
    } catch (error) {
        console.error('Error verifying passkey:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.png')) {
            res.set('Content-Type', 'image/png');
        } else if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) {
            res.set('Content-Type', 'image/jpeg');
        }
    }
}));

// Make sure the stego directory is specifically handled
app.use('/uploads/stego', express.static(path.join(__dirname, 'uploads', 'stego'), {
    setHeaders: (res, filepath) => {
        res.set('Content-Type', 'image/png');
    }
}));

app.use(express.static(path.join(__dirname, '..')));

// Profile Picture Upload Route
app.post('/uploadProfilePicture', upload.single('profilePicture'), (req, res) => {
    console.log('POST /uploadProfilePicture triggered');
    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const profilePicturePath = '/uploads/' + req.file.filename;
    console.log('Profile picture saved to:', profilePicturePath);
    res.json({ success: true, filePath: profilePicturePath });
});

// Check if username exists
app.post('/check-username', async (req, res) => {
    console.log('POST /check-username triggered with:', req.body);
    res.header('Access-Control-Allow-Origin', '*');
    
    if (!req.body || !req.body.username) {
        console.error('Missing username in request');
        return res.status(400).json({ 
            success: false, 
            message: 'Username is required' 
        });
    }

    const username = req.body.username.trim();
    console.log('Checking username:', username);

    try {
        const existingUser = await User.findOne({ username });
        console.log('Database query result:', existingUser ? 'User exists' : 'Username available');
        
        return res.status(200).json({
            exists: !!existingUser,
            message: existingUser ? 'Username already exists.' : 'Username is available.'
        });
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error checking username' 
        });
    }
});

// Registration endpoint
app.post('/register', upload.single('profilePicture'), async (req, res) => {
    console.log('POST /register triggered');
    console.log('Request body:', req.body);
    if (req.file) {
        console.log('Profile picture uploaded:', req.file.filename);
    } else {
        console.log('No profile picture uploaded');
    }

    if (!req.body.username || !req.body.password || !req.body.passkey) {
        console.error('Missing required fields');
        return res.status(400).json({ 
            success: false, 
            message: 'All fields are required' 
        });
    }

    try {
        const { username, password, passkey } = req.body;
        const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

        // Check for existing user again
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('Username already exists:', username);
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }

        // Generate RSA key pair
        console.log('Generating RSA key pair...');
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        console.log('Encrypting private key with passkey...');
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);

        // Hash password
        console.log('Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create and save user
        console.log('Creating new user...');
        const newUser = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture
        });

        await newUser.save();
        console.log('User registered and saved to DB:', {
            username: newUser.username,
            passkey: newUser.passkey,
            profilePicture: newUser.profilePicture,
            hasRSAKeys: !!(newUser.publicKey && newUser.encryptedPrivateKey)
        });
        
        return res.status(201).json({ 
            success: true, 
            message: 'Registration successful',
            user: {
                username: newUser.username,
                passkey: newUser.passkey,
                profilePicture: newUser.profilePicture
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Registration failed',
            error: err.message 
        });
    }
});

// Complete registration
app.post('/complete-registration', upload.single('profilePicture'), async (req, res) => {
    console.log('POST /complete-registration triggered with body:', req.body);
    const { username, password, passkey } = req.body;
    const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

    if (!username || !password || !passkey) {
        console.log('Missing fields on complete-registration');
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('Username already exists on complete-registration:', username);
            return res.status(400).json({ success: false, message: 'Username already exists.' });
        }

        // Generate RSA key pair
        console.log('Generating RSA key pair for complete-registration...');
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        console.log('Encrypting private key with passkey for complete-registration...');
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture
        });

        await newUser.save();
        console.log('User registered successfully via complete-registration:', username);
        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during complete-registration:', err);
        res.status(500).json({ success: false, message: 'Error registering user', error: err.message });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    console.log('POST /login triggered with body:', {
        username: req.body.username,
        passwordProvided: !!req.body.password
    });
    
    if (!req.body.username || !req.body.password) {
        console.log('Missing username or password');
        return res.status(400).json({ 
            success: false,
            message: 'Username and password are required' 
        });
    }
    
    const { username, password } = req.body;

    try {
        console.log('Looking up user in database:', username);
        let user = await User.findOne({ username });
        
        if (!user) {
            console.log('User not found in database:', username);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        console.log('User found, comparing passwords');
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            console.log('Password does not match');
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        console.log('Login successful for user:', username);
        return res.status(200).json({ 
            success: true,
            message: 'Login successful',
            username: user.username
        });
    } catch (err) {
        console.error('Error during login:', err);
        return res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: err.message 
        });
    }
});

// Add a test route
app.get('/test', (req, res) => {
    console.log('GET /test route triggered');
    res.json({ message: 'Server is reachable' });
});

// Fallback route
app.get('*', (req, res) => {
    console.log('Fallback route triggered, serving index.html');
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Endpoint to verify password and return the passkey
app.post('/api/auth/verify-password', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
    
    // Password verified, return passkey
    res.json({ 
      success: true,
      passkey: user.passkey // Return the stored passkey
    });
    
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Make sure the PORT is defined first
const PORT = process.env.PORT || 3000;

// Start the server once, using the defined PORT
app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    await testUploadDir();
});