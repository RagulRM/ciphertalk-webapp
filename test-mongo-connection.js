// Simple MongoDB Connection Test
// Run this locally with: node test-mongo-connection.js

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'YOUR_CONNECTION_STRING_HERE';

console.log('🔄 Testing MongoDB connection...');
console.log('Connection string length:', MONGODB_URI.length);
console.log('Connection string preview:', MONGODB_URI.substring(0, 20) + '...' + MONGODB_URI.substring(MONGODB_URI.length - 20));

const testConnection = async () => {
    try {
        // Simple connection options
        const options = {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
        };

        console.log('⏳ Attempting connection...');
        await mongoose.connect(MONGODB_URI, options);
        
        console.log('✅ Successfully connected to MongoDB!');
        console.log('Database name:', mongoose.connection.db.databaseName);
        console.log('Host:', mongoose.connection.host);
        
        // Test a simple operation
        const ping = await mongoose.connection.db.admin().ping();
        console.log('🏓 Ping result:', ping);
        
        console.log('🎉 Connection test PASSED!');
        
    } catch (error) {
        console.error('❌ Connection test FAILED:');
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        
        // Common error interpretations
        if (error.message.includes('authentication failed')) {
            console.error('🔐 Issue: Wrong username/password');
        } else if (error.message.includes('network')) {
            console.error('🌐 Issue: Network/firewall problem');
        } else if (error.message.includes('timeout')) {
            console.error('⏰ Issue: Connection timeout - check cluster status');
        }
        
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit();
    }
};

testConnection();
