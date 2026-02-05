/**
 * Menu Routes - Categories and Items
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDb } = require('../database/init');
const { authenticateToken, requireCafeAccess } = require('../middleware/auth');

// Detect if running on Vercel (read-only filesystem)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// File upload for menu item images - use memory storage on Vercel
const storage = isVercel
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: 'uploads/items',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'));
        }
    }
});

router.use(authenticateToken);

// ===============================
// CATEGORIES
// ===============================

// Get full menu (categories with items) for a cafe
router.get('/:cafeId/full', requireCafeAccess, async (req, res) => {
    try {
        const db = await getDb();
        const categories = db.prepare(`
            SELECT * FROM categories
            WHERE cafe_id = ?
            ORDER BY sort_order ASC, id ASC
        `).all(req.params.cafeId);
        
        // Get items for each category
        const getItems = db.prepare(`
            SELECT * FROM menu_items
            WHERE category_id = ?
            ORDER BY sort_order ASC, id ASC
        `);
        
        const fullMenu = categories.map(cat => ({
            ...cat,
            items: getItems.all(cat.id)
        }));
        
        res.json({ categories: fullMenu });
    } catch (error) {
        console.error('Get full menu error:', error);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// Get all categories for a cafe
router.get('/:cafeId/categories', requireCafeAccess, async (req, res) => {
    try {
        const db = await getDb();
        const categories = db.prepare(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM menu_items WHERE category_id = c.id) as item_count
            FROM categories c
            WHERE c.cafe_id = ?
            ORDER BY c.sort_order ASC, c.id ASC
        `).all(req.params.cafeId);
        
        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Create category
router.post('/:cafeId/categories', requireCafeAccess, async (req, res) => {
    try {
        const { name, icon, description } = req.body;
        const { cafeId } = req.params;
        
        if (!name) {
            return res.status(400).json({ error: 'Category name required' });
        }
        
        const db = await getDb();
        
        // Get max sort order
        const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM categories WHERE cafe_id = ?').get(cafeId);
        const sortOrder = (maxOrder?.max || 0) + 1;
        
        const result = db.prepare(`
            INSERT INTO categories (cafe_id, name, icon, description, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `).run(cafeId, name, icon || '🍽️', description || '', sortOrder);
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'add_category', `Added category: ${name}`);
        
        res.json({
            success: true,
            category: {
                id: result.lastInsertRowid,
                name,
                icon: icon || '🍽️',
                description: description || '',
                sort_order: sortOrder
            }
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// Update category
router.put('/:cafeId/categories/:categoryId', requireCafeAccess, async (req, res) => {
    try {
        const { categoryId, cafeId } = req.params;
        const { name, icon, description, isActive, sortOrder } = req.body;
        
        const db = await getDb();
        
        db.prepare(`
            UPDATE categories SET
                name = COALESCE(?, name),
                icon = COALESCE(?, icon),
                description = COALESCE(?, description),
                is_active = COALESCE(?, is_active),
                sort_order = COALESCE(?, sort_order)
            WHERE id = ? AND cafe_id = ?
        `).run(name, icon, description, isActive, sortOrder, categoryId, cafeId);
        
        res.json({ success: true, message: 'Category updated' });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// Reorder categories
router.post('/:cafeId/categories/reorder', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const { order } = req.body; // Array of category IDs in new order
        
        const db = await getDb();
        const updateStmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND cafe_id = ?');
        
        order.forEach((categoryId, index) => {
            updateStmt.run(index, categoryId, cafeId);
        });
        
        res.json({ success: true, message: 'Categories reordered' });
    } catch (error) {
        console.error('Reorder categories error:', error);
        res.status(500).json({ error: 'Failed to reorder categories' });
    }
});

// Delete category
router.delete('/:cafeId/categories/:categoryId', requireCafeAccess, async (req, res) => {
    try {
        const { categoryId, cafeId } = req.params;
        const db = await getDb();
        
        // Get category for logging
        const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId);
        
        // Delete items in category first
        db.prepare('DELETE FROM menu_items WHERE category_id = ?').run(categoryId);
        
        // Delete category
        db.prepare('DELETE FROM categories WHERE id = ? AND cafe_id = ?').run(categoryId, cafeId);
        
        // Log activity
        if (category) {
            db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
                .run(req.user.id, cafeId, 'delete_category', `Deleted category: ${category.name}`);
        }
        
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// ===============================
// MENU ITEMS
// ===============================

// Get all items for a cafe
router.get('/:cafeId/items', requireCafeAccess, async (req, res) => {
    try {
        const db = await getDb();
        const items = db.prepare(`
            SELECT mi.*, c.name as category_name
            FROM menu_items mi
            JOIN categories c ON mi.category_id = c.id
            WHERE mi.cafe_id = ?
            ORDER BY c.sort_order ASC, mi.sort_order ASC
        `).all(req.params.cafeId);
        
        res.json(items);
    } catch (error) {
        console.error('Get items error:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Get items by category
router.get('/:cafeId/categories/:categoryId/items', requireCafeAccess, async (req, res) => {
    try {
        const db = await getDb();
        const items = db.prepare(`
            SELECT * FROM menu_items
            WHERE cafe_id = ? AND category_id = ?
            ORDER BY sort_order ASC
        `).all(req.params.cafeId, req.params.categoryId);
        
        res.json(items);
    } catch (error) {
        console.error('Get items error:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// Get single item
router.get('/:cafeId/items/:itemId', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId, itemId } = req.params;
        const db = await getDb();
        
        const item = db.prepare(`
            SELECT * FROM menu_items
            WHERE id = ? AND cafe_id = ?
        `).get(itemId, cafeId);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json(item);
    } catch (error) {
        console.error('Get item error:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// Create item in category (simplified)
router.post('/:cafeId/categories/:categoryId/items', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId, categoryId } = req.params;
        const { name, description, price, is_vegetarian, is_spicy, is_popular } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Item name required' });
        }
        
        const db = await getDb();
        
        // Get max sort order
        const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM menu_items WHERE category_id = ?').get(categoryId);
        const sortOrder = (maxOrder?.max || 0) + 1;
        
        const result = db.prepare(`
            INSERT INTO menu_items (
                cafe_id, category_id, name, description, price, 
                is_vegetarian, is_spicy, is_popular, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            cafeId, categoryId, name, description || '', 
            price ? parseFloat(price) : 0,
            is_vegetarian ? 1 : 0, is_spicy ? 1 : 0, is_popular ? 1 : 0,
            sortOrder
        );
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'add_item', `Added item: ${name}`);
        
        res.json({
            success: true,
            item: { id: result.lastInsertRowid, name }
        });
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// Create item
router.post('/:cafeId/items', requireCafeAccess, upload.single('image'), async (req, res) => {
    try {
        const { cafeId } = req.params;
        const {
            categoryId, name, description, price, originalPrice, calories,
            isVegan, isVegetarian, isGlutenFree, isSpicy, isBestseller, isNew
        } = req.body;
        
        if (!name || !categoryId) {
            return res.status(400).json({ error: 'Name and category required' });
        }
        
        const db = await getDb();
        
        // Get max sort order
        const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM menu_items WHERE category_id = ?').get(categoryId);
        const sortOrder = (maxOrder?.max || 0) + 1;
        
        const image = req.file ? `/uploads/items/${req.file.filename}` : null;
        
        const result = db.prepare(`
            INSERT INTO menu_items (
                cafe_id, category_id, name, description, price, original_price,
                image, calories, is_vegan, is_vegetarian, is_gluten_free, is_spicy,
                is_bestseller, is_new, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            cafeId, categoryId, name, description || '', 
            price ? parseFloat(price) : null,
            originalPrice ? parseFloat(originalPrice) : null,
            image, calories ? parseInt(calories) : null,
            isVegan ? 1 : 0, isVegetarian ? 1 : 0, isGlutenFree ? 1 : 0,
            isSpicy ? 1 : 0, isBestseller ? 1 : 0, isNew ? 1 : 0,
            sortOrder
        );
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'add_item', `Added item: ${name}`);
        
        res.json({
            success: true,
            item: { id: result.lastInsertRowid, name }
        });
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// Update item
router.put('/:cafeId/items/:itemId', requireCafeAccess, upload.single('image'), async (req, res) => {
    try {
        const { cafeId, itemId } = req.params;
        const {
            categoryId, name, description, price, originalPrice, calories,
            isVegan, isVegetarian, isGlutenFree, isSpicy, isBestseller, isNew, isAvailable,
            is_vegetarian, is_spicy, is_popular
        } = req.body;
        
        const db = await getDb();
        
        // Get current item for image
        const currentItem = db.prepare('SELECT image FROM menu_items WHERE id = ?').get(itemId);
        const image = req.file ? `/uploads/items/${req.file.filename}` : currentItem?.image;
        
        // Handle both naming conventions (camelCase and snake_case)
        const vegValue = is_vegetarian !== undefined ? is_vegetarian : isVegetarian;
        const spicyValue = is_spicy !== undefined ? is_spicy : isSpicy;
        const popularValue = is_popular !== undefined ? is_popular : isBestseller;
        
        db.prepare(`
            UPDATE menu_items SET
                category_id = COALESCE(?, category_id),
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                price = COALESCE(?, price),
                original_price = ?,
                image = ?,
                calories = ?,
                is_vegan = COALESCE(?, is_vegan),
                is_vegetarian = COALESCE(?, is_vegetarian),
                is_gluten_free = COALESCE(?, is_gluten_free),
                is_spicy = COALESCE(?, is_spicy),
                is_bestseller = COALESCE(?, is_bestseller),
                is_popular = COALESCE(?, is_popular),
                is_new = COALESCE(?, is_new),
                is_available = COALESCE(?, is_available),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND cafe_id = ?
        `).run(
            categoryId, name, description,
            price !== undefined ? parseFloat(price) : null,
            originalPrice !== undefined ? (originalPrice ? parseFloat(originalPrice) : null) : null,
            image,
            calories !== undefined ? (calories ? parseInt(calories) : null) : null,
            isVegan !== undefined ? (isVegan ? 1 : 0) : null,
            vegValue !== undefined ? (vegValue ? 1 : 0) : null,
            isGlutenFree !== undefined ? (isGlutenFree ? 1 : 0) : null,
            spicyValue !== undefined ? (spicyValue ? 1 : 0) : null,
            isBestseller !== undefined ? (isBestseller ? 1 : 0) : null,
            popularValue !== undefined ? (popularValue ? 1 : 0) : null,
            isNew !== undefined ? (isNew ? 1 : 0) : null,
            isAvailable !== undefined ? (isAvailable ? 1 : 0) : null,
            itemId, cafeId
        );
        
        res.json({ success: true, message: 'Item updated' });
    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// Toggle item availability
router.patch('/:cafeId/items/:itemId/toggle', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId, itemId } = req.params;
        const db = await getDb();
        
        const item = db.prepare('SELECT is_available FROM menu_items WHERE id = ? AND cafe_id = ?').get(itemId, cafeId);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const newStatus = item.is_available ? 0 : 1;
        
        db.prepare('UPDATE menu_items SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, itemId);
        
        res.json({ success: true, isAvailable: !!newStatus });
    } catch (error) {
        console.error('Toggle item error:', error);
        res.status(500).json({ error: 'Failed to toggle item' });
    }
});

// Reorder items
router.post('/:cafeId/items/reorder', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const { order } = req.body; // Array of item IDs in new order
        
        const db = await getDb();
        const updateStmt = db.prepare('UPDATE menu_items SET sort_order = ? WHERE id = ? AND cafe_id = ?');
        
        order.forEach((itemId, index) => {
            updateStmt.run(index, itemId, cafeId);
        });
        
        res.json({ success: true, message: 'Items reordered' });
    } catch (error) {
        console.error('Reorder items error:', error);
        res.status(500).json({ error: 'Failed to reorder items' });
    }
});

// Delete item
router.delete('/:cafeId/items/:itemId', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId, itemId } = req.params;
        const db = await getDb();
        
        // Get item for logging
        const item = db.prepare('SELECT name FROM menu_items WHERE id = ?').get(itemId);
        
        db.prepare('DELETE FROM menu_items WHERE id = ? AND cafe_id = ?').run(itemId, cafeId);
        
        // Log activity
        if (item) {
            db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
                .run(req.user.id, cafeId, 'delete_item', `Deleted item: ${item.name}`);
        }
        
        res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Bulk add items
router.post('/:cafeId/items/bulk', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const { categoryId, items } = req.body;
        
        if (!categoryId || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Category ID and items array required' });
        }
        
        const db = await getDb();
        
        const insertStmt = db.prepare(`
            INSERT INTO menu_items (cafe_id, category_id, name, description, price, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM menu_items WHERE category_id = ?').get(categoryId);
        let sortOrder = (maxOrder?.max || 0) + 1;
        
        const insertedIds = [];
        
        items.forEach(item => {
            const result = insertStmt.run(
                cafeId, categoryId, item.name, item.description || '',
                item.price ? parseFloat(item.price) : null, sortOrder++
            );
            insertedIds.push(result.lastInsertRowid);
        });
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'bulk_add_items', `Added ${items.length} items`);
        
        res.json({ success: true, insertedIds });
    } catch (error) {
        console.error('Bulk add error:', error);
        res.status(500).json({ error: 'Failed to add items' });
    }
});

module.exports = router;
