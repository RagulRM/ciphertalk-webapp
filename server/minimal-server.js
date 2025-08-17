const express = require('express');
const app = express();

app.use(express.json());

// Simple test endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        message: 'Minimal server is working'
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Test endpoint working',
        env: process.env.NODE_ENV
    });
});

// Export for Vercel
module.exports = app;

// Only start server locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Minimal server running at http://localhost:${PORT}`);
    });
}
