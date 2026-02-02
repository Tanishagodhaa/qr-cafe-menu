/**
 * Admin Routes - Super Admin Only
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Apply auth middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const db = await getDb();
        
        const totalCafes = db.prepare('SELECT COUNT(*) as count FROM cafes').get().count;
        const publishedCafes = db.prepare('SELECT COUNT(*) as count FROM cafes WHERE is_published = 1').get().count;
        const deployedCafes = db.prepare('SELECT COUNT(*) as count FROM cafes WHERE is_deployed = 1').get().count;
        const totalOwners = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'owner'").get().count;
        const totalItems = db.prepare('SELECT COUNT(*) as count FROM menu_items').get().count;
        const totalCategories = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
        
        // Recent activity
        const recentActivity = db.prepare(`
            SELECT al.*, u.name as user_name, c.name as cafe_name
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN cafes c ON al.cafe_id = c.id
            ORDER BY al.created_at DESC
            LIMIT 10
        `).all();
        
        // Recent cafes
        const recentCafes = db.prepare(`
            SELECT c.*, u.name as owner_name
            FROM cafes c
            LEFT JOIN users u ON c.id = u.cafe_id
            ORDER BY c.created_at DESC
            LIMIT 5
        `).all();
        
        res.json({
            stats: {
                totalCafes,
                publishedCafes,
                deployedCafes,
                totalOwners,
                totalItems,
                totalCategories
            },
            recentActivity,
            recentCafes
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get all cafes
router.get('/cafes', async (req, res) => {
    try {
        const db = await getDb();
        const cafes = db.prepare(`
            SELECT c.*, u.name as owner_name, u.email as owner_email,
                   (SELECT COUNT(*) FROM categories WHERE cafe_id = c.id) as category_count,
                   (SELECT COUNT(*) FROM menu_items WHERE cafe_id = c.id) as item_count
            FROM cafes c
            LEFT JOIN users u ON c.id = u.cafe_id
            ORDER BY c.created_at DESC
        `).all();
        
        res.json({ cafes });
    } catch (error) {
        console.error('Get cafes error:', error);
        res.status(500).json({ error: 'Failed to fetch cafes' });
    }
});

// Get all owners
router.get('/owners', async (req, res) => {
    try {
        const db = await getDb();
        const owners = db.prepare(`
            SELECT u.id, u.email, u.name, u.is_active, u.created_at,
                   c.id as cafe_id, c.name as cafe_name, c.slug as cafe_slug
            FROM users u
            LEFT JOIN cafes c ON u.cafe_id = c.id
            WHERE u.role = 'owner'
            ORDER BY u.created_at DESC
        `).all();
        
        res.json({ owners });
    } catch (error) {
        console.error('Get owners error:', error);
        res.status(500).json({ error: 'Failed to fetch owners' });
    }
});

// Create new cafe owner
router.post('/owners', async (req, res) => {
    try {
        const { email, name, password, cafeId } = req.body;
        
        if (!email || !name) {
            return res.status(400).json({ error: 'Email and name required' });
        }
        
        const db = await getDb();
        
        // Check if email exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Generate password if not provided
        const userPassword = password || uuidv4().slice(0, 8);
        const hashedPassword = await bcrypt.hash(userPassword, 10);
        
        const result = db.prepare(`
            INSERT INTO users (email, password, name, role, cafe_id)
            VALUES (?, ?, ?, 'owner', ?)
        `).run(email, hashedPassword, name, cafeId || null);
        
        // Update cafe if provided
        if (cafeId) {
            db.prepare('UPDATE cafes SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cafeId);
        }
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')
            .run(req.user.id, 'create_owner', `Created owner: ${email}`);
        
        res.json({
            success: true,
            owner: {
                id: result.lastInsertRowid,
                email,
                name,
                password: userPassword // Send plain password only on creation
            }
        });
    } catch (error) {
        console.error('Create owner error:', error);
        res.status(500).json({ error: 'Failed to create owner' });
    }
});

// Update owner
router.put('/owners/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { email, name, isActive, cafeId, resetPassword } = req.body;
        
        const db = await getDb();
        
        let newPassword = null;
        
        if (resetPassword) {
            newPassword = uuidv4().slice(0, 8);
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id);
        }
        
        db.prepare(`
            UPDATE users SET 
                email = COALESCE(?, email),
                name = COALESCE(?, name),
                is_active = COALESCE(?, is_active),
                cafe_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(email, name, isActive, cafeId, id);
        
        res.json({ 
            success: true, 
            message: 'Owner updated',
            newPassword 
        });
    } catch (error) {
        console.error('Update owner error:', error);
        res.status(500).json({ error: 'Failed to update owner' });
    }
});

// Delete owner
router.delete('/owners/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        db.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(id, 'owner');
        
        res.json({ success: true, message: 'Owner deleted' });
    } catch (error) {
        console.error('Delete owner error:', error);
        res.status(500).json({ error: 'Failed to delete owner' });
    }
});

// Get activity log
router.get('/activity', async (req, res) => {
    try {
        const db = await getDb();
        const limit = req.query.limit || 50;
        
        const activity = db.prepare(`
            SELECT al.*, u.name as user_name, c.name as cafe_name
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN cafes c ON al.cafe_id = c.id
            ORDER BY al.created_at DESC
            LIMIT ?
        `).all(limit);
        
        res.json(activity);
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

module.exports = router;
