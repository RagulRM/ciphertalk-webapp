// Environment Variable Debug Tool
// This will help us see what's actually happening in production

const express = require('express');
const app = express();

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
            key.includes('DATABASE')
        ),
        vercelEnv: process.env.VERCEL,
        vercelUrl: process.env.VERCEL_URL,
        timestamp: new Date().toISOString()
    };
    
    res.json(envInfo);
});

module.exports = app;
