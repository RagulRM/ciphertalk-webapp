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

const app = express();

// Middleware
app.use(express.json());
// CORS configuration
const allowedOrigins = [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'http://localhost:3000', 
    'http://127.0.0.1:3000'
];

// Add production domains
if (process.env.PRODUCTION_DOMAIN) {
    allowedOrigins.push(`https://${process.env.PRODUCTION_DOMAIN}`);
}
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use(cors({
    origin: function (origin, callback) {
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

// Ensure required directories exist
const uploadDir = path.join(__dirname, 'uploads');
const resourcesDir = path.join(__dirname, '..', 'resources');

[uploadDir, resourcesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Connect to MongoDB Atlas with proper serverless options
const mongoOptions = {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30s for initial connection
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    maxPoolSize: 1, // Reduce pool size for serverless
    bufferCommands: false, // Disable mongoose buffering
    useUnifiedTopology: true,
    useNewUrlParser: true,
    maxIdleTimeMS: 30000,
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
    }
};

console.log('MongoDB URI:', process.env.MONGODB_URI ? 'SET (length: ' + process.env.MONGODB_URI.length + ')' : 'NOT SET');

// Connection promise for serverless
let cachedConnection = null;

const connectToDatabase = async () => {
    if (cachedConnection && mongoose.connection.readyState === 1) {
        return cachedConnection;
    }

    try {
        console.log('🔄 Attempting MongoDB connection...');
        
        // Add event listeners for debugging
        mongoose.connection.on('connecting', () => {
            console.log('📡 Mongoose connecting to MongoDB...');
        });
        
        mongoose.connection.on('connected', () => {
            console.log('✅ Mongoose connected to MongoDB');
        });
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ Mongoose connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('🔌 Mongoose disconnected from MongoDB');
        });
        
        cachedConnection = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
        console.log('✅ Connected to MongoDB Database successfully');
        return cachedConnection;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB Database:', error.message);
        throw error;
    }
};

// Start initial connection attempt (non-blocking)
connectToDatabase().catch(err => {
    console.error('Initial connection failed:', err.message);
});

// Debug endpoint to check MongoDB connection and environment
app.get('/api/debug', async (req, res) => {
    try {
        const mongoUri = process.env.MONGODB_URI ? 'SET' : 'NOT SET';
        const mongoState = mongoose.connection.readyState;
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
        
        // Additional debug info
        const connectionString = process.env.MONGODB_URI;
        const debugInfo = {
            mongoUri: mongoUri,
            mongoState: states[mongoState] || 'unknown',
            nodeEnv: process.env.NODE_ENV || 'not set',
            timestamp: new Date().toISOString(),
            // Connection string analysis (masked for security)
            connectionAnalysis: connectionString ? {
                hasProtocol: connectionString.startsWith('mongodb+srv://'),
                hasUsername: connectionString.includes('Ragul'),
                hasCluster: connectionString.includes('useridcluster'),
                hasDatabase: connectionString.includes('/ciphertalk'),
                hasPassword: connectionString.includes('RagulCipher'),
                hasRetryWrites: connectionString.includes('retryWrites=true'),
                length: connectionString.length,
                // Show first and last 10 characters for debugging
                preview: connectionString.substring(0, 10) + '...' + connectionString.substring(connectionString.length - 10)
            } : null,
            mongooseVersion: mongoose.version,
            serverSelectionTimeoutMS: 30000
        };

        res.json(debugInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test MongoDB connection endpoint
app.get('/api/test-connection', async (req, res) => {
    try {
        console.log('🔄 Starting connection test...');
        
        // Check current state
        console.log('Current readyState:', mongoose.connection.readyState);
        
        // Force a fresh connection attempt
        if (mongoose.connection.readyState !== 1) {
            console.log('⚡ Attempting fresh connection...');
            await connectToDatabase();
        }
        
        // Wait longer for connection to establish
        console.log('⏳ Waiting for connection to stabilize...');
        let attempts = 0;
        const maxAttempts = 10;
        
        while (mongoose.connection.readyState !== 1 && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            console.log(`Attempt ${attempts}: readyState = ${mongoose.connection.readyState}`);
        }
        
        // Final state check
        if (mongoose.connection.readyState !== 1) {
            throw new Error(`Connection failed to establish after ${maxAttempts} seconds. Final state: ${mongoose.connection.readyState}`);
        }
        
        // Try to perform a simple database operation
        console.log('🏓 Attempting database ping...');
        const testResult = await mongoose.connection.db.admin().ping();
        
        res.json({
            success: true,
            message: 'MongoDB connection successful',
            pingResult: testResult,
            readyState: mongoose.connection.readyState,
            dbName: mongoose.connection.db.databaseName,
            host: mongoose.connection.host,
            port: mongoose.connection.port
        });
    } catch (error) {
        console.error('❌ Connection test failed:', error);
        res.status(500).json({
            success: false,
            message: 'MongoDB connection failed',
            error: error.message,
            readyState: mongoose.connection.readyState,
            stack: error.stack
        });
    }
});

// Alternative connection test with different options
app.get('/api/test-connection-alt', async (req, res) => {
    try {
        console.log('🧪 Testing alternative connection method...');
        
        // Try with minimal options
        const altOptions = {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 10000,
        };
        
        // Create a separate connection for testing
        const testConnection = await mongoose.createConnection(process.env.MONGODB_URI, altOptions);
        
        // Test the connection
        const isConnected = testConnection.readyState === 1;
        
        if (isConnected) {
            const ping = await testConnection.db.admin().ping();
            await testConnection.close();
            
            res.json({
                success: true,
                message: 'Alternative connection successful',
                pingResult: ping
            });
        } else {
            await testConnection.close();
            res.status(500).json({
                success: false,
                message: 'Alternative connection failed',
                readyState: testConnection.readyState
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Alternative connection test failed',
            error: error.message
        });
    }
});

// API Check if username exists (alternative to /check-username)
app.post('/api/check-username', async (req, res) => {
    console.log('POST /api/check-username triggered with:', req.body);
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            console.log(`Waiting for DB context in api/check-username... Attempt ${attempts}`);
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
        console.log('✅ API Checking username:', username, 'in database:', mongoose.connection.db.databaseName);

        const existingUser = await User.findOne({ username });
        console.log('Database query result:', existingUser ? 'User exists' : 'Username available');
        
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

// API Registration endpoint (alternative to /register)
app.post('/api/register', upload.single('profilePicture'), async (req, res) => {

    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            console.log(`Waiting for DB context in api/registration... Attempt ${attempts}`);
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        console.log('✅ API Database context ready for registration');
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

        const { username, password, passkey } = req.body;
        const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

        console.log(`🔍 API Checking for existing user: ${username} in database: ${mongoose.connection.db.databaseName}`);
        
        // Check for existing user again
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('Username already exists:', username);
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }

        console.log('✅ API Username available, proceeding with registration');

        // Generate RSA key pair
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        console.log('Encrypting private key with passkey...');
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);

        // Hash password
        console.log('Hashing password...');
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

        console.log('Saving user to database...');
        await user.save();
        console.log('✅ API User created successfully:', username);

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
app.post('/api/test-registration', async (req, res) => {
    try {
        console.log('🧪 Test registration endpoint called');
        
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            console.log(`Waiting for DB context in test registration... Attempt ${attempts}`);
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for test registration');
        }
        
        console.log('✅ Database context ready for test registration');
        
        const { username, password, passkey } = req.body;
        
        if (!username || !password || !passkey) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required',
                provided: { username: !!username, password: !!password, passkey: !!passkey }
            });
        }
        
        console.log(`🔍 Test: Checking for existing user: ${username}`);
        
        // Check for existing user
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('❌ Test: Username already exists:', username);
            return res.status(400).json({
                success: false,
                message: 'Username already exists',
                debug: { database: mongoose.connection.db.databaseName }
            });
        }
        
        console.log('✅ Test: Username available, creating user...');
        
        // Generate RSA key pair
        console.log('🔑 Test: Generating RSA keys...');
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        
        // Encrypt private key with passkey
        console.log('🔐 Test: Encrypting private key...');
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);
        
        // Hash password
        console.log('🔒 Test: Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        console.log('👤 Test: Creating user document...');
        const newUser = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture: 'resources/Default.jpg'
        });
        
        console.log('💾 Test: Saving user to database...');
        const savedUser = await newUser.save();
        console.log('✅ Test: User saved successfully with ID:', savedUser._id);
        
        // Verify user was saved
        const userCount = await User.countDocuments();
        console.log('📊 Test: Total users in database:', userCount);
        
        res.json({
            success: true,
            message: 'Test registration successful',
            debug: {
                userId: savedUser._id,
                database: mongoose.connection.db.databaseName,
                totalUsers: userCount,
                steps: [
                    '✅ Connection established',
                    '✅ Database context ready', 
                    '✅ Username available',
                    '✅ RSA keys generated',
                    '✅ Private key encrypted',
                    '✅ Password hashed',
                    '✅ User document created',
                    '✅ User saved to database'
                ]
            }
        });
        
    } catch (error) {
        console.error('❌ Test registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Test registration failed',
            error: error.message,
            stack: error.stack,
            debug: {
                database: mongoose.connection.db?.databaseName,
                readyState: mongoose.connection.readyState
            }
        });
    }
});

// Test registration with database debugging
app.post('/api/register-debug', async (req, res) => {
    try {
        await connectToDatabase();
        
        const { username, password, passkey } = req.body;
        
        if (!username || !password || !passkey) {
            return res.status(400).json({
                success: false,
                message: 'All fields required',
                debug: { username: !!username, password: !!password, passkey: !!passkey }
            });
        }
        
        console.log(`🔍 Debug Registration - Username: ${username}`);
        console.log(`🔍 Current Database: ${mongoose.connection.db.databaseName}`);
        
        // Check current database for existing user
        const existingUser = await User.findOne({ username });
        console.log(`🔍 Existing user found: ${!!existingUser}`);
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists in current database',
                debug: {
                    database: mongoose.connection.db.databaseName,
                    existingUser: true
                }
            });
        }
        
        // Try to create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const { publicKey, privateKey } = EncryptionUtils.generateRSAKeyPair();
        const encryptedPrivateKey = EncryptionUtils.encryptPrivateKey(privateKey, passkey);
        
        const newUser = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture: 'resources/Default.jpg'
        });
        
        const savedUser = await newUser.save();
        console.log(`✅ User created with ID: ${savedUser._id}`);
        
        res.json({
            success: true,
            message: 'User registered successfully',
            debug: {
                database: mongoose.connection.db.databaseName,
                userId: savedUser._id,
                collections: await mongoose.connection.db.listCollections().toArray()
            }
        });
        
    } catch (error) {
        console.error('Registration debug error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message,
            debug: {
                database: mongoose.connection.db?.databaseName,
                readyState: mongoose.connection.readyState
            }
        });
    }
});

// Database inspection endpoint
app.get('/api/db-inspect', async (req, res) => {
    try {
        await connectToDatabase();
        
        // Wait for connection to fully establish
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            console.log(`Waiting for DB context... Attempt ${attempts}`);
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
            console.log('Admin access not available:', adminError.message);
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
            console.log('Sample user query failed:', err.message);
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

// Environment debug endpoint
app.get('/api/env-debug', (req, res) => {
    const envInfo = {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        mongoUriExists: !!process.env.MONGODB_URI,
        mongoUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
        mongoUriPreview: process.env.MONGODB_URI ? 
            process.env.MONGODB_URI.substring(0, 20) + '...' + process.env.MONGODB_URI.substring(process.env.MONGODB_URI.length - 20) 
            : 'NOT SET',
        allEnvKeys: Object.keys(process.env).filter(key => 
            key.includes('MONGO') || 
            key.includes('DB') || 
            key.includes('DATABASE') ||
            key.includes('URI')
        ),
        vercelEnv: process.env.VERCEL,
        vercelUrl: process.env.VERCEL_URL,
        processEnvKeys: Object.keys(process.env).length,
        timestamp: new Date().toISOString()
    };
    
    res.json(envInfo);
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

// Debug resources access
app.use('/resources', (req, res, next) => {
    console.log('Resource requested:', req.url);
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
    console.log('Profile picture saved to:', profilePicturePath);
    res.json({ success: true, filePath: profilePicturePath });
});

// Check if username exists
app.post('/check-username', async (req, res) => {
    console.log('POST /check-username triggered with:', req.body);
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
        // Wait for database context to be ready
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            console.log(`Waiting for DB context in check-username... Attempt ${attempts}`);
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
        console.log('✅ Checking username:', username, 'in database:', mongoose.connection.db.databaseName);

        const existingUser = await User.findOne({ username });
        console.log('Database query result:', existingUser ? 'User exists' : 'Username available');
        
        return res.status(200).json({
            exists: !!existingUser,
            message: existingUser ? 'Username already exists.' : 'Username is available.',
            debug: {
                database: mongoose.connection.db.databaseName,
                readyState: mongoose.connection.readyState
            }
        });
    } catch (err) {
        console.error('❌ Username check error:', err);
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
            console.log(`Waiting for DB context in registration... Attempt ${attempts}`);
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        console.log('✅ Database context ready for registration');
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

        const { username, password, passkey } = req.body;
        const profilePicture = req.file ? `/uploads/${req.file.filename}` : 'resources/Default.jpg';

        console.log(`🔍 Checking for existing user: ${username} in database: ${mongoose.connection.db.databaseName}`);
        
        // Check for existing user again
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('Username already exists:', username);
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }

        console.log('✅ Username available, proceeding with registration');

        // Generate RSA key pair

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
    try {
        // Ensure MongoDB connection
        await connectToDatabase();
        
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

        console.log('Looking up user in database:', username);
        let user = await User.findOne({ username });
        
        if (!user) {
            console.log('User not found in database:', username);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }


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

    res.json({ message: 'Server is reachable' });
});

// Add a debug route
app.get('/debug', (req, res) => {

    res.sendFile(path.join(__dirname, '..', 'debug.html'));
});

// Add a connection test page
app.get('/connection-test', (req, res) => {

    res.sendFile(path.join(__dirname, '..', 'connection-test.html'));
});

// API connectivity test endpoint
app.get('/api/connection-test', (req, res) => {
    console.log('Connection test requested from:', req.get('origin'));
    res.json({
        success: true,
        message: 'Server connection successful',
        timestamp: new Date().toISOString(),
        origin: req.get('origin'),
        host: req.get('host'),
        environment: process.env.NODE_ENV || 'development'
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
    console.log('Fallback route triggered, serving index.html');
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Export for Vercel serverless functions
module.exports = app;

// Only start server locally (not in Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
        console.log(`Server running at http://localhost:${PORT}`);
        await testUploadDir();
    });
}
