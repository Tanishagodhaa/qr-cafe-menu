/**
 * Cafe Routes - CRUD for cafes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { getDb } = require('../database/init');
const { authenticateToken, requireAdmin, requireCafeAccess } = require('../middleware/auth');

// Detect if running on Vercel (read-only filesystem)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// File upload configuration - use memory storage on Vercel
const storage = isVercel 
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = file.fieldname === 'logo' ? 'uploads/logos' : 'uploads/items';
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'));
        }
    }
});

router.use(authenticateToken);

// Get sample menu function
function getSampleCafeMenu() {
    return [
        {
            name: 'Hot Drinks',
            icon: '☕',
            items: [
                { name: 'Espresso', description: 'Rich and bold', price: 3.50 },
                { name: 'Cappuccino', description: 'With steamed milk foam', price: 4.50 },
                { name: 'Latte', description: 'Smooth and creamy', price: 4.50 }
            ]
        },
        {
            name: 'Cold Drinks',
            icon: '🧊',
            items: [
                { name: 'Iced Coffee', description: 'Refreshing cold brew', price: 4.00 },
                { name: 'Iced Latte', description: 'Cold and creamy', price: 5.00 }
            ]
        },
        {
            name: 'Pastries',
            icon: '🥐',
            items: [
                { name: 'Croissant', description: 'Buttery and flaky', price: 3.00 },
                { name: 'Muffin', description: 'Fresh baked daily', price: 3.50 }
            ]
        }
    ];
}

// Generate unique slug
async function generateSlug(name) {
    const db = await getDb();
    let slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    const original = slug;
    let counter = 1;
    
    let existing = await db.prepare('SELECT id FROM cafes WHERE slug = ?').get(slug);
    while (existing) {
        slug = `${original}-${counter}`;
        counter++;
        existing = await db.prepare('SELECT id FROM cafes WHERE slug = ?').get(slug);
    }
    
    return slug;
}

// Get all cafes (admin) or user's cafe (owner)
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        
        let cafes;
        if (req.user.role === 'admin') {
            cafes = await db.prepare(`
                SELECT * FROM cafes ORDER BY created_at DESC
            `).all();
        } else {
            cafes = await db.prepare(`
                SELECT * FROM cafes WHERE id = ?
            `).all(req.user.cafe_id);
        }
        
        res.json(cafes);
    } catch (error) {
        console.error('Get cafes error:', error);
        res.status(500).json({ error: 'Failed to fetch cafes' });
    }
});

// Get single cafe
router.get('/:id', requireCafeAccess, async (req, res) => {
    try {
        const db = await getDb();
        const cafe = await db.prepare('SELECT * FROM cafes WHERE id = ?').get(req.params.id);
        
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        res.json(cafe);
    } catch (error) {
        console.error('Get cafe error:', error);
        res.status(500).json({ error: 'Failed to fetch cafe' });
    }
});

// Create cafe - From Google Link
router.post('/from-google', requireAdmin, async (req, res) => {
    try {
        const { googleUrl, googleLink, themePreset, ownerId } = req.body;
        const url = googleUrl || googleLink;
        
        if (!url) {
            return res.status(400).json({ error: 'Google link required' });
        }
        
        console.log('Extracting data from Google link:', url);
        
        // Extract data from Google
        const extractedData = await extractFromGoogleLink(url, themePreset);
        
        console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
        
        const db = await getDb();
        const slug = await generateSlug(extractedData.name || 'New Cafe');
        
        const result = db.prepare(`
            INSERT INTO cafes (
                name, slug, tagline, description, phone, email, address, website,
                google_link, primary_color, secondary_color, accent_color, 
                background_color, text_color, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            extractedData.name || 'New Cafe',
            slug,
            extractedData.tagline || '',
            extractedData.description || '',
            extractedData.phone || '',
            extractedData.email || '',
            extractedData.address || '',
            extractedData.website || '',
            url,
            extractedData.theme?.primaryColor || '#2C5F2D',
            extractedData.theme?.secondaryColor || '#97BC62',
            extractedData.theme?.accentColor || '#DAA520',
            extractedData.theme?.backgroundColor || '#FDFBF7',
            extractedData.theme?.textColor || '#2D3436',
            req.user.id
        );
        
        const cafeId = result.lastInsertRowid;
        
        // Create default categories if extracted
        if (extractedData.categories && extractedData.categories.length > 0) {
            const insertCategory = db.prepare(`
                INSERT INTO categories (cafe_id, name, icon, sort_order)
                VALUES (?, ?, ?, ?)
            `);
            
            const insertItem = db.prepare(`
                INSERT INTO menu_items (cafe_id, category_id, name, description, price, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            extractedData.categories.forEach((cat, catIndex) => {
                const catResult = insertCategory.run(cafeId, cat.name, cat.icon || '🍽️', catIndex);
                const categoryId = catResult.lastInsertRowid;
                
                if (cat.items) {
                    cat.items.forEach((item, itemIndex) => {
                        insertItem.run(cafeId, categoryId, item.name, item.description || '', item.price, itemIndex);
                    });
                }
            });
        }
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'create_cafe', `Created cafe from Google: ${extractedData.name}`);
        
        res.json({
            success: true,
            cafe: { id: cafeId, slug, ...extractedData }
        });
    } catch (error) {
        console.error('Create from Google error:', error);
        res.status(500).json({ error: 'Failed to extract data from Google link' });
    }
});

// Create cafe - Manual
router.post('/manual', requireAdmin, upload.single('logo'), async (req, res) => {
    try {
        const { name, tagline, description, phone, email, address, currency } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Cafe name required' });
        }
        
        const db = await getDb();
        const slug = await generateSlug(name);
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : null;
        
        const result = await db.prepare(`
            INSERT INTO cafes (name, slug, tagline, description, phone, email, address, currency, logo, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, slug, tagline || '', description || '', phone || '', email || '', address || '', currency || '$', logo, req.user.id);
        
        const cafeId = result.lastInsertRowid;
        
        // Log activity
        await db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'create_cafe', `Created cafe manually: ${name}`);
        
        res.json({
            success: true,
            cafe: { id: cafeId, slug, name }
        });
    } catch (error) {
        console.error('Create manual error:', error);
        res.status(500).json({ error: 'Failed to create cafe' });
    }
});

// Extract menu from Google link and add to existing cafe
router.post('/:id/extract-menu', requireCafeAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { googleUrl } = req.body;
        
        if (!googleUrl) {
            return res.status(400).json({ error: 'Google link required' });
        }
        
        const db = await getDb();
        
        // Check cafe exists
        const cafe = db.prepare('SELECT * FROM cafes WHERE id = ?').get(id);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        console.log('Extracting menu from Google link:', googleUrl);
        
        // Extract data from Google
        const extractedData = await extractFromGoogleLink(googleUrl);
        
        console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
        
        let itemsAdded = 0;
        let categoriesAdded = 0;
        
        // Add extracted categories and items
        if (extractedData.categories && extractedData.categories.length > 0) {
            const insertCategory = db.prepare(`
                INSERT INTO categories (cafe_id, name, icon, sort_order)
                VALUES (?, ?, ?, ?)
            `);
            
            const insertItem = db.prepare(`
                INSERT INTO menu_items (cafe_id, category_id, name, description, price, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            // Get current max sort order for categories
            const maxCatOrder = db.prepare('SELECT MAX(sort_order) as max FROM categories WHERE cafe_id = ?').get(id);
            let catSortOrder = (maxCatOrder?.max || 0) + 1;
            
            extractedData.categories.forEach((cat) => {
                const catResult = insertCategory.run(id, cat.name, cat.icon || '🍽️', catSortOrder++);
                const categoryId = catResult.lastInsertRowid;
                categoriesAdded++;
                
                if (cat.items && cat.items.length > 0) {
                    cat.items.forEach((item, itemIndex) => {
                        insertItem.run(id, categoryId, item.name, item.description || '', item.price || 0, itemIndex);
                        itemsAdded++;
                    });
                }
            });
        }
        
        // Update cafe's google_link
        db.prepare('UPDATE cafes SET google_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(googleUrl, id);
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, id, 'extract_menu', `Extracted ${itemsAdded} items from Google`);
        
        res.json({
            success: true,
            categoriesAdded,
            itemsAdded,
            message: `Successfully extracted ${categoriesAdded} categories with ${itemsAdded} items`
        });
    } catch (error) {
        console.error('Extract menu error:', error);
        res.status(500).json({ error: 'Failed to extract menu from Google link: ' + error.message });
    }
});

// Add sample menu template to cafe
router.post('/:id/sample-menu', requireCafeAccess, async (req, res) => {
    try {
        const cafeId = parseInt(req.params.id);
        const db = await getDb();
        
        // Check cafe exists
        const cafe = await db.prepare('SELECT * FROM cafes WHERE id = ?').get(cafeId);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        // Get sample menu
        const sampleMenu = getSampleCafeMenu();
        
        let itemsAdded = 0;
        let categoriesAdded = 0;
        
        // Get current max sort order for categories
        const maxCatOrder = await db.prepare('SELECT MAX(sort_order) as max FROM categories WHERE cafe_id = ?').get(cafeId);
        let catSortOrder = (maxCatOrder?.max || 0) + 1;
        
        for (const cat of sampleMenu) {
            // Insert category
            const insertCatResult = await db.prepare(`
                INSERT INTO categories (cafe_id, name, icon, sort_order)
                VALUES (?, ?, ?, ?)
            `).run(cafeId, cat.name, cat.icon || '🍽️', catSortOrder++);
            
            const categoryId = insertCatResult.lastInsertRowid;
            console.log(`Inserted category "${cat.name}" with ID: ${categoryId} for cafe ${cafeId}`);
            categoriesAdded++;
            
            if (cat.items && cat.items.length > 0) {
                for (let itemIndex = 0; itemIndex < cat.items.length; itemIndex++) {
                    const item = cat.items[itemIndex];
                    await db.prepare(`
                        INSERT INTO menu_items (cafe_id, category_id, name, description, price, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(cafeId, categoryId, item.name, item.description || '', item.price || 0, itemIndex);
                    console.log(`  Inserted item "${item.name}" into category ${categoryId}`);
                    itemsAdded++;
                }
            }
        }
        
        // Log activity
        await db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'add_sample_menu', `Added sample menu with ${itemsAdded} items`);
        
        res.json({
            success: true,
            categoriesAdded,
            itemsAdded,
            message: `Successfully added ${categoriesAdded} categories with ${itemsAdded} items`
        });
    } catch (error) {
        console.error('Add sample menu error:', error);
        res.status(500).json({ error: 'Failed to add sample menu' });
    }
});

// Update cafe
router.put('/:id', requireCafeAccess, upload.single('logo'), async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        const cafe = await db.prepare('SELECT * FROM cafes WHERE id = ?').get(id);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        const {
            name, tagline, description, phone, email, address, website,
            instagram, facebook, currency, is_published,
            primaryColor, secondaryColor, accentColor, backgroundColor, textColor
        } = req.body;
        
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : cafe.logo;
        
        // Handle is_published - convert to integer for SQLite
        const publishedValue = is_published === true || is_published === 'true' || is_published === 1 ? 1 : 
                              is_published === false || is_published === 'false' || is_published === 0 ? 0 : 
                              cafe.is_published;
        
        // Use existing values if undefined
        await db.prepare(`
            UPDATE cafes SET
                name = ?,
                tagline = ?,
                description = ?,
                phone = ?,
                email = ?,
                address = ?,
                website = ?,
                instagram = ?,
                facebook = ?,
                currency = ?,
                logo = ?,
                is_published = ?,
                primary_color = ?,
                secondary_color = ?,
                accent_color = ?,
                background_color = ?,
                text_color = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name || cafe.name,
            tagline !== undefined ? tagline : cafe.tagline,
            description !== undefined ? description : cafe.description,
            phone !== undefined ? phone : cafe.phone,
            email !== undefined ? email : cafe.email,
            address !== undefined ? address : cafe.address,
            website !== undefined ? website : cafe.website,
            instagram !== undefined ? instagram : cafe.instagram,
            facebook !== undefined ? facebook : cafe.facebook,
            currency || cafe.currency,
            logo,
            publishedValue,
            primaryColor || cafe.primary_color,
            secondaryColor || cafe.secondary_color,
            accentColor || cafe.accent_color,
            backgroundColor || cafe.background_color,
            textColor || cafe.text_color,
            id
        );
        
        // Log activity
        await db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, id, 'update_cafe', 'Updated cafe details');
        
        res.json({ success: true, message: 'Cafe updated' });
    } catch (error) {
        console.error('Update cafe error:', error);
        res.status(500).json({ error: 'Failed to update cafe' });
    }
});

// Publish/Unpublish cafe
router.post('/:id/publish', requireCafeAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { publish } = req.body;
        
        const db = await getDb();
        
        await db.prepare('UPDATE cafes SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(publish ? 1 : 0, id);
        
        res.json({ success: true, isPublished: !!publish });
    } catch (error) {
        console.error('Publish error:', error);
        res.status(500).json({ error: 'Failed to update publish status' });
    }
});

// Generate QR Code
router.post('/:id/generate-qr', requireCafeAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        const cafe = await db.prepare('SELECT * FROM cafes WHERE id = ?').get(id);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        // Auto-detect base URL (Vercel, custom, or localhost)
        const baseUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}` 
            : (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`);
        
        const menuUrl = cafe.deployed_url || `${baseUrl}/m/${cafe.slug}`;
        
        const qrOptions = {
            width: 1024,
            margin: 2,
            color: {
                dark: cafe.primary_color || '#000000',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
        };
        
        let qrPublicPath;
        
        // On Vercel: generate as data URL (no file system access)
        // Locally: save to file
        if (isVercel) {
            // Return QR as data URL
            const qrDataUrl = await QRCode.toDataURL(menuUrl, qrOptions);
            qrPublicPath = qrDataUrl; // Store as data URL
        } else {
            // Ensure directory exists
            const qrDir = path.join(__dirname, '../uploads/qrcodes');
            if (!fs.existsSync(qrDir)) {
                fs.mkdirSync(qrDir, { recursive: true });
            }
            
            const qrFilename = `${cafe.slug}-qr.png`;
            const qrPath = path.join(qrDir, qrFilename);
            
            // Generate QR code file
            await QRCode.toFile(qrPath, menuUrl, qrOptions);
            qrPublicPath = `/uploads/qrcodes/${qrFilename}`;
        }
        
        // Update cafe with QR path
        await db.prepare('UPDATE cafes SET qr_code_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(qrPublicPath, id);
        
        res.json({
            success: true,
            qrCode: qrPublicPath,
            menuUrl
        });
    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Delete cafe (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        // Get cafe for logging
        const cafe = await db.prepare('SELECT name FROM cafes WHERE id = ?').get(id);
        
        // Delete all related data (cascade)
        await db.prepare('DELETE FROM menu_items WHERE cafe_id = ?').run(id);
        await db.prepare('DELETE FROM categories WHERE cafe_id = ?').run(id);
        await db.prepare('UPDATE users SET cafe_id = NULL WHERE cafe_id = ?').run(id);
        await db.prepare('DELETE FROM cafes WHERE id = ?').run(id);
        
        // Log activity
        if (cafe) {
            await db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')
                .run(req.user.id, 'delete_cafe', `Deleted cafe: ${cafe.name}`);
        }
        
        res.json({ success: true, message: 'Cafe deleted' });
    } catch (error) {
        console.error('Delete cafe error:', error);
        res.status(500).json({ error: 'Failed to delete cafe' });
    }
});

module.exports = router;
