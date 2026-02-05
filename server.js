/**
 * QR Menu SaaS - Main Server
 * Complete multi-tenant menu management system
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/deployed', express.static(path.join(__dirname, 'deployed')));

// Detect if running on Vercel (read-only filesystem)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// Ensure directories exist (only on local, Vercel has read-only filesystem)
if (!isVercel) {
    const dirs = ['uploads', 'uploads/logos', 'uploads/items', 'uploads/qrcodes', 'deployed', 'database'];
    dirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
}

// Database initialization - must happen BEFORE routes are used
const { initializeDatabase } = require('./database/init');
let dbInitialized = false;
let dbInitPromise = null;

async function ensureDbReady() {
    if (dbInitialized) return;
    if (!dbInitPromise) {
        dbInitPromise = initializeDatabase().then(() => {
            dbInitialized = true;
            console.log('✅ Database initialized');
        }).catch(err => {
            console.error('❌ Database init failed:', err);
            throw err;
        });
    }
    await dbInitPromise;
}

// Middleware to ensure DB is ready BEFORE any API calls
app.use('/api', async (req, res, next) => {
    try {
        await ensureDbReady();
        next();
    } catch (err) {
        console.error('DB init error in middleware:', err);
        res.status(500).json({ error: 'Database initialization failed', details: err.message });
    }
});

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const cafeRoutes = require('./routes/cafe');
const menuRoutes = require('./routes/menu');
const deployRoutes = require('./routes/deploy');
const publicRoutes = require('./routes/public');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cafe', cafeRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/public', publicRoutes);

// Page Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/dashboard.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/dashboard.html'));
});

app.get('/owner', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/owner/dashboard.html'));
});

app.get('/owner/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/owner/dashboard.html'));
});

// Public menu page route
app.get('/menu/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/menu-view.html'));
});

app.get('/m/:slug', (req, res) => {
    res.redirect(`/menu/${req.params.slug}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        dbReady: dbInitialized, 
        isVercel,
        timestamp: new Date().toISOString()
    });
});

// For local development: start server
if (!isVercel) {
    const PORT = process.env.PORT || 3000;
    ensureDbReady().then(() => {
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🍽️  QR MENU MANAGEMENT SYSTEM v2.0                            ║
║                                                                  ║
║   Server running at: http://localhost:${PORT}                      ║
║                                                                  ║
║   🔐 Admin Login:  http://localhost:${PORT}/login                  ║
║   📊 Admin Panel:  http://localhost:${PORT}/admin                  ║
║   🏪 Owner Panel:  http://localhost:${PORT}/owner                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
            `);
        });
    }).catch(err => {
        console.error('Failed to initialize:', err);
        process.exit(1);
    });
}

// Export for Vercel serverless
module.exports = app;
