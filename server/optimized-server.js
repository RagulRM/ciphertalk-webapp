const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const NodeRSA = require('node-rsa');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
    origin: ['https://ciphertalk.dev', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// MongoDB Connection with serverless optimization
const mongoOptions = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 1,
    bufferCommands: false,
    useUnifiedTopology: true,
    useNewUrlParser: true,
    maxIdleTimeMS: 30000,
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
    }
};

let cachedConnection = null;

const connectToDatabase = async () => {
    if (cachedConnection && mongoose.connection.readyState === 1) {
        return cachedConnection;
    }

    try {
        console.log('🔄 Attempting MongoDB connection...');
        cachedConnection = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
        console.log('✅ Connected to MongoDB Database successfully');
        return cachedConnection;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB Database:', error.message);
        throw error;
    }
};

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    passkey: { type: String, required: true },
    publicKey: { type: String, required: true },
    encryptedPrivateKey: { type: String, required: true },
    profilePicture: { type: String, default: 'resources/Default.jpg' }
});

const User = mongoose.model('User', UserSchema);

// Encryption Utilities
class EncryptionUtils {
    static generateRSAKeyPair() {
        const key = new NodeRSA({ b: 2048 });
        return {
            publicKey: key.exportKey('public'),
            privateKey: key.exportKey('private')
        };
    }

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
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        message: 'Optimized server is working'
    });
});

// Database inspection
app.get('/api/db-inspect', async (req, res) => {
    try {
        await connectToDatabase();
        
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available');
        }
        
        const db = mongoose.connection.db;
        const currentDb = db.databaseName;
        const collections = await db.listCollections().toArray();
        const usersCollection = db.collection('users');
        const userCount = await usersCollection.countDocuments();
        
        res.json({
            success: true,
            currentDatabase: currentDb,
            collectionsInCurrentDb: collections.map(col => col.name),
            usersInCurrentDb: userCount,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port
        });
        
    } catch (error) {
        console.error('DB inspect error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            readyState: mongoose.connection.readyState,
            dbExists: !!mongoose.connection.db
        });
    }
});

// Check username availability
app.post('/api/check-username', async (req, res) => {
    try {
        await connectToDatabase();
        
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for username check');
        }
        
        if (!req.body || !req.body.username) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username is required' 
            });
        }

        const username = req.body.username.trim();
        console.log('✅ Checking username:', username);

        const existingUser = await User.findOne({ username });
        
        return res.status(200).json({
            exists: !!existingUser,
            message: existingUser ? 'Username already exists.' : 'Username is available.'
        });
    } catch (err) {
        console.error('❌ Username check error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error checking username',
            error: err.message
        });
    }
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        await connectToDatabase();
        
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        console.log('✅ Database context ready for registration');

        if (!req.body.username || !req.body.password || !req.body.passkey) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        const { username, password, passkey } = req.body;

        // Check for existing user
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }

        console.log('✅ Username available, proceeding with registration');

        // Temporarily use simple keys instead of RSA generation
        const publicKey = 'simple-public-key-' + Date.now();
        const encryptedPrivateKey = 'simple-encrypted-private-key-' + Date.now();

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const user = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey,
            encryptedPrivateKey,
            profilePicture: 'resources/Default.jpg'
        });

        await user.save();
        console.log('✅ User created successfully:', username);

        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully',
            userId: user._id
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed',
            error: error.message 
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        await connectToDatabase();
        
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for login');
        }
        
        if (!req.body.username || !req.body.password) {
            return res.status(400).json({ 
                success: false,
                message: 'Username and password are required' 
            });
        }
        
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid username or password' 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid username or password' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Login successful',
            user: {
                id: user._id,
                username: user.username,
                profilePicture: user.profilePicture
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Login failed',
            error: error.message 
        });
    }
});

// Fallback for static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Simple registration test without RSA key generation
app.post('/api/test-register', async (req, res) => {
    try {
        console.log('📝 Test registration request received:', req.body);
        
        await connectToDatabase();
        
        let attempts = 0;
        while ((!mongoose.connection.db || mongoose.connection.readyState !== 1) && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!mongoose.connection.db) {
            throw new Error('Database context not available for registration');
        }
        
        console.log('✅ Database context ready for registration');

        if (!req.body.username || !req.body.password || !req.body.passkey) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        const { username, password, passkey } = req.body;

        // Check for existing user
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username already exists' 
            });
        }

        console.log('✅ Username available, proceeding with registration');

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user with dummy keys (no RSA generation)
        const user = new User({
            username,
            password: hashedPassword,
            passkey,
            publicKey: 'test-public-key-' + Date.now(),
            encryptedPrivateKey: 'test-encrypted-private-key-' + Date.now(),
            profilePicture: 'resources/Default.jpg'
        });

        await user.save();
        console.log('✅ User created successfully:', username);

        res.status(201).json({ 
            success: true, 
            message: 'User registered successfully (test mode)',
            userId: user._id
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Registration failed',
            error: error.message 
        });
    }
});

// Export for Vercel
module.exports = app;

// Only start server locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Optimized server running at http://localhost:${PORT}`);
    });
}
