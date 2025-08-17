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
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();

// Middleware
app.use(express.json());
// CORS configuration
const allowedOrigins = [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'https://ciphertalk.dev'
];

// Add production domains
if (process.env.PRODUCTION_DOMAIN) {
    allowedOrigins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
}
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

// Add Vercel deployment URLs
if (process.env.VERCEL_URL) {
    allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}
// Common Vercel project pattern
allowedOrigins.push('https://ciphertalk-webapp.vercel.app');
allowedOrigins.push('https://ciphertalk-webapp-ragulrm.vercel.app');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Ensure required directories exist (serverless compatible)
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const stegoDir = process.env.VERCEL ? '/tmp/uploads/stego' : path.join(__dirname, 'uploads', 'stego');
const resourcesDir = path.join(__dirname, '..', 'resources');

[uploadDir, stegoDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Only create resources directory if not in serverless (read-only filesystem)
if (!process.env.VERCEL && !fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
}

// Multer configuration with serverless support
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Use /tmp in Vercel serverless, local uploads directory otherwise
        const uploadPath = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const outName = Date.now() + '-' + file.originalname;
        cb(null, outName);
    }
});

const upload = multer({ storage: storage });

// Connect to MongoDB Atlas with optimized serverless options
const mongoOptions = {
    serverSelectionTimeoutMS: process.env.VERCEL ? 10000 : 30000, // Shorter timeout for serverless
    socketTimeoutMS: process.env.VERCEL ? 15000 : 45000, // Shorter socket timeout for serverless
    connectTimeoutMS: process.env.VERCEL ? 10000 : 30000, // Explicit connect timeout
    maxPoolSize: 1, // Single connection for serverless
    bufferCommands: false, // Disable mongoose buffering
    useUnifiedTopology: true,
    useNewUrlParser: true,
    maxIdleTimeMS: 30000,
    heartbeatFrequencyMS: 10000, // More frequent heartbeat for serverless
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
    }
};


// Connection promise for serverless
let cachedConnection = null;

const connectToDatabase = async () => {
    if (cachedConnection && mongoose.connection.readyState === 1) {
        return cachedConnection;
    }

    try {
        // Debug environment variables
        if (!process.env.MONGODB_URI) {
            const envCheck = {
                NODE_ENV: process.env.NODE_ENV,
                VERCEL: process.env.VERCEL,
                mongoUri: process.env.MONGODB_URI ? 'DEFINED' : 'UNDEFINED'
            };
            console.error('❌ MONGODB_URI not found!', envCheck);
            throw new Error('MONGODB_URI environment variable is not defined');
        }
        
        console.log('🔄 Connecting to MongoDB...');
        
        // Close existing connection if in error state
        if (mongoose.connection.readyState === 3) {
            await mongoose.disconnect();
        }
        
        // Add event listeners for debugging (only once)
        if (!mongoose.connection.listeners('connecting').length) {
            mongoose.connection.on('connecting', () => {
                console.log('🔄 MongoDB connecting...');
            });
            
            mongoose.connection.on('connected', () => {
                console.log('✅ MongoDB connected successfully');
            });
            
            mongoose.connection.on('error', (err) => {
                console.error('❌ Mongoose connection error:', err.message);
            });
            
            mongoose.connection.on('disconnected', () => {
                console.log('⚠️ MongoDB disconnected');
            });
        }
        
        cachedConnection = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
        console.log('✅ Database connection established');
        return cachedConnection;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB Database:', error.message);
        cachedConnection = null; // Reset cache on failure
        throw error;
    }
};

// Don't start initial connection in serverless - connect on-demand only

// API Check if username exists
app.post('/api/check-username', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for username check');
        }
        
        if (!req.body || !req.body.username) {
            console.error('Missing username in request');
            return res.status(400).json({ 
                success: false, 
                message: 'Username is required' 
            });
        }

        const username = req.body.username.trim();

        const existingUser = await User.findOne({ username });
        
        return res.status(200).json({
            exists: !!existingUser,
            message: existingUser ? 'Username already exists.' : 'Username is available.',
            debug: {
                database: mongoose.connection.db.databaseName,
                readyState: mongoose.connection.readyState
            }
        });
    } catch (err) {
        console.error('❌ API Username check error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error checking username',
            error: err.message,
            debug: {
                readyState: mongoose.connection.readyState,
                dbExists: !!mongoose.connection.db
            }
        });
    }
});

// API Registration endpoint
app.post('/api/register', upload.single('profilePicture'), async (req, res) => {

    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        if (req.file) {
        } else {
        }

        if (!req.body.username || !req.body.password || !req.body.passkey) {
            console.error('Missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        const { username, password, passkey } = req.body;
        const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

        
        // Check for existing user again
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }


        // Generate RSA key pair
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const user = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture
        });

        await user.save();

        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully',
            debug: {
                userId: user._id,
                database: mongoose.connection.db.databaseName
            }
        });
    } catch (error) {
        console.error('❌ API Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed',
            error: error.message 
        });
    }
});

// Simple registration test endpoint (no file upload)

// Test registration with database debugging

// Database inspection endpoint
app.get('/api/db-inspect', async (req, res) => {
    try {
        await connectToDatabase();
        
        // Wait for connection to fully establish
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available after connection');
        }
        
        const db = mongoose.connection.db;
        
        // List all databases (this might not work in serverless, so wrap in try-catch)
        let databases = [];
        try {
            const admin = db.admin();
            const dbList = await admin.listDatabases();
            databases = dbList.databases.map(db => ({
                name: db.name,
                sizeOnDisk: db.sizeOnDisk
            }));
        } catch (adminError) {
            databases = [{ name: db.databaseName, note: 'Current DB only - admin access limited' }];
        }
        
        // Get current database info
        const currentDb = db.databaseName;
        const collections = await db.listCollections().toArray();
        
        // Check users collection specifically
        const usersCollection = db.collection('users');
        const userCount = await usersCollection.countDocuments();
        
        // Try to find a sample user
        let sampleUser = null;
        try {
            sampleUser = await usersCollection.findOne({}, { projection: { username: 1, _id: 1 } });
        } catch (err) {
        }
        
        res.json({
            success: true,
            currentDatabase: currentDb,
            allDatabases: databases,
            collectionsInCurrentDb: collections.map(col => col.name),
            usersInCurrentDb: userCount,
            sampleUser: sampleUser,
            connectionString: process.env.MONGODB_URI.replace(/:[^:@]*@/, ':***@'), // Hide password
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port
        });
        
    } catch (error) {
        console.error('DB inspect error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack,
            readyState: mongoose.connection.readyState,
            dbExists: !!mongoose.connection.db
        });
    }
});

// Message Schema
const MessageSchema = new mongoose.Schema({
    sender:    { type: String, required: true },
    receiver:  { type: String, required: true },
    content:   { type: String, required: true },
    type:      { type: String, enum: ['text','encrypted','stego'], required: true },
    encryptedAESKey: String,
    iv:             String,
    originalText:   String,
    timestamp:      { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

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
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Check if user has RSA keys, if not generate them
        if (!user.publicKey || !user.encryptedPrivateKey) {
    
            const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
            const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, user.passkey);
            
            user.publicKey = publicKey;
            user.encryptedPrivateKey = encryptedPrivateKey;
            await user.save();
        }
        
        res.json({ success: true, publicKey: user.publicKey });
    } catch (error) {
        console.error('Error fetching public key:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Generate RSA keys for existing users
app.post('/api/user/:username/generate-keys', async (req, res) => {
    try {
        const { passkey } = req.body;
        if (!passkey) {
            return res.status(400).json({ success: false, message: 'Passkey is required' });
        }
        
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Verify passkey
        if (user.passkey !== passkey) {
            return res.status(400).json({ success: false, message: 'Invalid passkey' });
        }
        
        // Generate RSA keys
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);
        
        user.publicKey = publicKey;
        user.encryptedPrivateKey = encryptedPrivateKey;
        await user.save();
        
        res.json({ success: true, message: 'RSA keys generated successfully' });
    } catch (error) {
        console.error('Error generating RSA keys:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get user profile
app.get('/api/user/:username/profile-picture', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, profilePicture: user.profilePicture });
    } catch (error) {
        console.error('Error fetching profile picture:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all contacts
app.get('/api/contacts', async (req, res) => {

    try {
        const users = await User.find({}, { username: 1, profilePicture: 1, _id: 0 });
        res.json(users);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get chat history
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.params.user1, receiver: req.params.user2 },
                { sender: req.params.user2, receiver: req.params.user1 }
            ]
        }).sort('timestamp');
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Error fetching chat history' });
    }
});

// Send encrypted message
app.post('/api/messages/send-encrypted', async (req, res) => {
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
        res.status(201).json({ 
            success: true, 
            message: newMessage,
            info: 'Encrypted message sent successfully'
        });
    } catch (error) {
        console.error('Error sending encrypted message:', error);
        res.status(500).json({ success: false, message: 'Error sending encrypted message' });
    }
});

// Decrypt message
app.post('/api/messages/decrypt', async (req, res) => {
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
    try {
        const { sender, receiver, content, type } = req.body;
        const message = new Message({
            sender,
            receiver,
            content,
            type
        });
        await message.save();
        res.status(201).json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message', error);
        res.status(500).json({ success: false, message: 'Error sending message' });
    }
});

// Steganography endpoint
app.post('/api/messages/stego', upload.single('image'), async (req, res) => {
    if (!req.file || !req.body.message) {
        return res.status(400).json({
            success: false,
            message: 'Image and message are required'
        });
    }

    try {
        const image = await jimp.read(req.file.path);
        const message = req.body.message;
        const bits = parseInt(req.body.bits) || 4;


        // Validate capacity
        const capacity = Math.floor((image.getWidth() * image.getHeight() * 3 * bits) / 8);
        if (message.length > capacity) {
            throw new Error('Message too large for image capacity');
        }

        // Apply LSB steganography
        const stegoImage = await embedMessageInImage(image, message, bits);
        
        // Generate unique filename
        const outputFilename = `stego_${Date.now()}.png`;
        const outputPath = path.join(stegoDir, outputFilename);
        
        // Save the processed image
        await stegoImage.writeAsync(outputPath);
        
        // Clean up original uploaded file
        fs.unlinkSync(req.file.path);

        // Return the URL that can be used to access the image
        const imageUrl = `/uploads/stego/${outputFilename}`;

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

    
    if (!req.file || !req.body.message || !req.body.sender || !req.body.receiver) {
        return res.status(400).json({
            success: false,
            message: 'Image, message, sender, and receiver are required'
        });
    }

    try {
        const { message, sender, receiver } = req.body;
        const bits = parseInt(req.body.bits) || 4;

        
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

        // Validate capacity
        const capacity = Math.floor((image.getWidth() * image.getHeight() * 3 * bits) / 8);
        if (payload.length > capacity) {
            throw new Error('Message too large for image capacity');
        }

        // Apply LSB steganography with encrypted payload
        const stegoImage = await embedMessageInImage(image, payload, bits);
        
        // Generate unique filename
        const outputFilename = `stego_${Date.now()}.png`;
        const outputPath = path.join(stegoDir, outputFilename);
        
        // Save the processed image
        await stegoImage.writeAsync(outputPath);
        
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
        const extractedMessage = await extractMessageFromImage(image, bits);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: extractedMessage
        });
    } catch (error) {
        console.error('Message extraction error:', error);

        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: `Failed to extract message: ${error.message}`
        });
    }
});

// Serverless-compatible upload directory setup
const testUploadDir = async () => {
    // In Vercel serverless, use /tmp for file operations
    const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
    
    try {
        // Only test directory creation, no file operations in serverless
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Skip permission tests in serverless environment
        if (!process.env.VERCEL) {
            const testFile = path.join(uploadDir, 'test-permissions.txt');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        }
        
        console.log('✅ Upload directory ready:', uploadDir);
        return uploadDir;
    } catch (error) {
        console.error('❌ Upload directory setup failed:', error.message);
        // Don't exit in serverless environment, just log the error
        if (!process.env.VERCEL) {
            process.exit(1);
        }
        return null;
    }
};

// Embed message into image
async function embedMessageInImage(image, message, bits) {
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

        return image;
    } catch (error) {
        console.error('Error in embedMessageInImage:', error);
        throw new Error(`Failed to embed message: ${error.message}`);
    }
}

// Extract message from image
async function extractMessageFromImage(image, bits) {
    try {
        const width = image.getWidth();
        const height = image.getHeight();
        let binaryMessage = '';
        let messageLength = null;
        let lengthParsed = false;

        // First, extract enough bits to get the length prefix
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = jimp.intToRGBA(image.getPixelColor(x, y));
                ['r', 'g', 'b'].forEach(channel => {
                    const bitsFromChannel = (pixel[channel] & ((1 << bits) - 1))
                        .toString(2)
                        .padStart(bits, '0');
                    binaryMessage += bitsFromChannel;
                });

                // Try to parse length after collecting some data
                if (!lengthParsed && binaryMessage.length >= 32) { // Enough bits to check for length
                    try {
                        const bytes = [];
                        for (let i = 0; i + 8 <= binaryMessage.length; i += 8) {
                            bytes.push(parseInt(binaryMessage.substr(i, 8), 2));
                        }
                        const partialText = Buffer.from(bytes).toString('utf8');
                        const lengthMatch = partialText.match(/^(\d+)%%%/);
                        if (lengthMatch) {
                            messageLength = parseInt(lengthMatch[1], 10);
                            lengthParsed = true;
                            
                            // Calculate total bits needed: length prefix + "%%%" + message
                            const lengthPrefix = lengthMatch[0];
                            const totalCharsNeeded = lengthPrefix.length + messageLength;
                            const totalBitsNeeded = totalCharsNeeded * 8;
                            
                            // If we have enough bits, we can stop early
                            if (binaryMessage.length >= totalBitsNeeded) {
                                break;
                            }
                        }
                    } catch (e) {
                        // Continue extracting if we can't parse yet
                    }
                }

                // If we know the length and have enough bits, stop extracting
                if (lengthParsed && messageLength !== null) {
                    const lengthPrefixLength = messageLength.toString().length + 3; // +3 for "%%%"
                    const totalCharsNeeded = lengthPrefixLength + messageLength;
                    const totalBitsNeeded = totalCharsNeeded * 8;
                    
                    if (binaryMessage.length >= totalBitsNeeded) {
                        break;
                    }
                }
            }
            
            // Break outer loop if we have enough data
            if (lengthParsed && messageLength !== null) {
                const lengthPrefixLength = messageLength.toString().length + 3; // +3 for "%%%"
                const totalCharsNeeded = lengthPrefixLength + messageLength;
                const totalBitsNeeded = totalCharsNeeded * 8;
                
                if (binaryMessage.length >= totalBitsNeeded) {
                    break;
                }
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
    try {
        const { username, passkey } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isValid = user.passkey === passkey;
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

// Handle stego directory serving (serverless compatible)
if (process.env.VERCEL) {
    // In serverless, serve files from /tmp directly via API endpoint
    app.get('/uploads/stego/:filename', (req, res) => {
        const filename = req.params.filename;
        const filePath = path.join('/tmp/uploads/stego', filename);
        
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    });
} else {
    // Local development - use static serving
    app.use('/uploads/stego', express.static(path.join(__dirname, 'uploads', 'stego'), {
        setHeaders: (res, filepath) => {
            res.set('Content-Type', 'image/png');
        }
    }));
}

// Debug resources access
app.use('/resources', (req, res, next) => {
    next();
});

// Explicitly serve resources directory
app.use('/resources', express.static(path.join(__dirname, '..', 'resources')));

// Serve static files from the root directory with proper MIME types
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Profile Picture Upload Route
app.post('/uploadProfilePicture', upload.single('profilePicture'), (req, res) => {

    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const profilePicturePath = '/uploads/' + req.file.filename;
    res.json({ success: true, filePath: profilePicturePath });
});

// Registration endpoint
app.post('/register', upload.single('profilePicture'), async (req, res) => {

    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        if (req.file) {
        } else {
        }

        if (!req.body.username || !req.body.password || !req.body.passkey) {
            console.error('Missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        const { username, password, passkey } = req.body;
        const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

        
        // Check for existing user again
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }


        // Generate RSA key pair

        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create and save user
        const newUser = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture
        });

        await newUser.save();
        console.log('User registered successfully:', username);
        
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
    const { username, password, passkey } = req.body;
    const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

    if (!username || !password || !passkey) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists.' });
        }

        // Generate RSA key pair

        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
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
        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during complete-registration:', err);
        res.status(500).json({ success: false, message: 'Error registering user', error: err.message });
    }
});

// API Login Route (for frontend compatibility)
app.post('/api/login', async (req, res) => {
    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        console.log('POST /api/login triggered with body:', {
            username: req.body.username,
            passwordProvided: !!req.body.password
        });
        
        if (!req.body.username || !req.body.password) {
            return res.status(400).json({ 
                success: false,
                message: 'Username and password are required' 
            });
        }
        
        const { username, password } = req.body;

        let user = await User.findOne({ username });
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        return res.status(200).json({ 
            success: true,
            message: 'Login successful',
            username: user.username
        });
    } catch (err) {
        console.error('Error during API login:', err);
        return res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: err.message 
        });
    }
});

// Add a test route

// Add a debug route

// Add a connection test page

// API connectivity test endpoint
app.get('/api/connection-test', async (req, res) => {
    try {
        // Test database connection
        let dbStatus = 'disconnected';
        let dbError = null;
        let connectionDetails = {};
        
        try {
            console.log('Testing MongoDB connection...');
            await connectToDatabase();
            
            if (mongoose.connection.readyState === 1) {
                // Test a simple database operation
                const userCount = await User.countDocuments();
                dbStatus = `connected (${userCount} users)`;
                
                // Get connection details
                connectionDetails = {
                    readyState: mongoose.connection.readyState,
                    host: mongoose.connection.host,
                    port: mongoose.connection.port,
                    name: mongoose.connection.name
                };
            } else {
                dbStatus = `connection state: ${mongoose.connection.readyState}`;
                connectionDetails = {
                    readyState: mongoose.connection.readyState,
                    states: {
                        0: 'disconnected',
                        1: 'connected', 
                        2: 'connecting',
                        3: 'disconnecting'
                    }
                };
            }
        } catch (err) {
            dbStatus = 'connection failed';
            dbError = err.message;
            connectionDetails = {
                errorName: err.name,
                errorCode: err.code,
                readyState: mongoose.connection.readyState
            };
            console.error('Database connection test failed:', err);
        }
        
        res.json({
            success: true,
            message: 'Server connection successful',
            timestamp: new Date().toISOString(),
            origin: req.get('origin'),
            host: req.get('host'),
            environment: process.env.NODE_ENV || 'development',
            vercel: !!process.env.VERCEL,
            mongoConnected: mongoose.connection.readyState === 1,
            dbStatus: dbStatus,
            dbError: dbError,
            connectionDetails: connectionDetails,
            corsOrigins: allowedOrigins,
            envVars: {
                MONGODB_URI: process.env.MONGODB_URI ? 'DEFINED' : 'UNDEFINED',
                PORT: process.env.PORT || 'undefined',
                NODE_ENV: process.env.NODE_ENV || 'undefined',
                PRODUCTION_DOMAIN: process.env.PRODUCTION_DOMAIN || 'undefined'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Production health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        environment: process.env.NODE_ENV,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Simple test endpoint - no database required
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        envCheck: {
            MONGODB_URI: process.env.MONGODB_URI ? 'DEFINED' : 'UNDEFINED',
            NODE_ENV: process.env.NODE_ENV || 'undefined',
            VERCEL: process.env.VERCEL || 'undefined'
        }
    });
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

// Fallback route - MUST BE LAST
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server locally (not in Vercel)
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📱 Frontend URL: http://localhost:${PORT}`);
        console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
        try {
            await testUploadDir();
        } catch (err) {
            console.error('Upload dir test failed:', err);
        }
    });
} else {
    console.log('🌐 Running in Vercel serverless mode');
    // In serverless, just ensure directories exist without testing
    try {
        const uploadPath = '/tmp/uploads';
        const stegoPath = '/tmp/uploads/stego';
        [uploadPath, stegoPath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        console.log('✅ Serverless upload directories ready');
    } catch (err) {
        console.error('⚠️ Upload dir setup warning:', err.message);
    }
}