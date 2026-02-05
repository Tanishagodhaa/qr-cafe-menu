/**
 * Public Routes - No authentication required
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');

// Get public menu data by slug
router.get('/menu/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { preview } = req.query; // Allow preview mode for unpublished
        const db = await getDb();
        
        // Get cafe - allow unpublished if preview=true
        const cafe = await db.prepare(`
            SELECT id, name, slug, tagline, description, logo, cover_image,
                   phone, email, address, website, instagram, facebook, currency,
                   primary_color, secondary_color, accent_color, background_color, text_color,
                   is_published
            FROM cafes 
            WHERE slug = ?
        `).get(slug);
        
        if (!cafe) {
            return res.status(404).json({ error: 'Menu not found' });
        }
        
        // If not published and not preview mode, return 404
        if (!cafe.is_published && preview !== 'true') {
            return res.status(404).json({ error: 'Menu not found or not published yet' });
        }
        
        // Get categories
        const categories = await db.prepare(`
            SELECT id, name, icon, description
            FROM categories 
            WHERE cafe_id = ? AND is_active = 1
            ORDER BY sort_order ASC
        `).all(cafe.id);
        
        // Get items
        const items = await db.prepare(`
            SELECT id, category_id, name, description, price, original_price, image,
                   calories, is_vegan, is_vegetarian, is_gluten_free, is_spicy,
                   is_bestseller, is_new
            FROM menu_items 
            WHERE cafe_id = ? AND is_available = 1
            ORDER BY sort_order ASC
        `).all(cafe.id);
        
        // Organize items by category
        const categoriesWithItems = categories.map(cat => ({
            ...cat,
            items: items.filter(item => item.category_id === cat.id)
        }));
        
        res.json({
            cafe: {
                name: cafe.name,
                tagline: cafe.tagline,
                description: cafe.description,
                logo: cafe.logo,
                coverImage: cafe.cover_image,
                contact: {
                    phone: cafe.phone,
                    email: cafe.email,
                    address: cafe.address,
                    website: cafe.website
                },
                social: {
                    instagram: cafe.instagram,
                    facebook: cafe.facebook
                },
                currency: cafe.currency,
                theme: {
                    primaryColor: cafe.primary_color,
                    secondaryColor: cafe.secondary_color,
                    accentColor: cafe.accent_color,
                    backgroundColor: cafe.background_color,
                    textColor: cafe.text_color
                }
            },
            categories: categoriesWithItems
        });
    } catch (error) {
        console.error('Get public menu error:', error);
        res.status(500).json({ error: 'Failed to fetch menu' });
    }
});

// Check if slug is available
router.get('/check-slug/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const db = await getDb();
        
        const existing = await db.prepare('SELECT id FROM cafes WHERE slug = ?').get(slug);
        
        res.json({ available: !existing });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check slug' });
    }
});

module.exports = router;
