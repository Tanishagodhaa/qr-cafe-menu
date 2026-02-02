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
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/deployed', express.static(path.join(__dirname, 'deployed')));

// Ensure directories exist
const dirs = ['uploads', 'uploads/logos', 'uploads/items', 'deployed', 'database'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
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

// Initialize database and start server
const { initializeDatabase } = require('./database/init');

initializeDatabase()
    .then(() => {
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
║   Default Admin: admin@qrmenu.com / admin123                     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
            `);
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;
