/**
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { getDb } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Verify JWT token
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    try {
        const user = jwt.verify(token, JWT_SECRET);
        
        // Get fresh user data
        const db = await getDb();
        const dbUser = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(user.id);
        
        if (!dbUser) {
            return res.status(403).json({ error: 'User not found or inactive' });
        }
        
        req.user = dbUser;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

// Check if user is admin
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Check if user owns the cafe or is admin
function requireCafeAccess(req, res, next) {
    const cafeId = req.params.cafeId || req.body.cafeId;
    
    if (req.user.role === 'admin') {
        return next();
    }
    
    if (req.user.cafe_id !== parseInt(cafeId)) {
        return res.status(403).json({ error: 'Access denied to this cafe' });
    }
    
    next();
}

module.exports = { authenticateToken, requireAdmin, requireCafeAccess };
