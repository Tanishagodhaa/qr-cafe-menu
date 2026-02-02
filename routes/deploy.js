/**
 * Deploy Routes - Generate and deploy static menu pages
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { getDb } = require('../database/init');
const { authenticateToken, requireCafeAccess, requireAdmin } = require('../middleware/auth');
const { generateMenuHTML } = require('../services/menuGenerator');

router.use(authenticateToken);

// Generate static files for a cafe
router.post('/:cafeId/generate', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const db = await getDb();
        
        // Get cafe data
        const cafe = db.prepare('SELECT * FROM cafes WHERE id = ?').get(cafeId);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        // Get categories and items
        const categories = db.prepare(`
            SELECT * FROM categories WHERE cafe_id = ? AND is_active = 1 ORDER BY sort_order
        `).all(cafeId);
        
        const items = db.prepare(`
            SELECT * FROM menu_items WHERE cafe_id = ? AND is_available = 1 ORDER BY sort_order
        `).all(cafeId);
        
        // Generate HTML
        const html = generateMenuHTML(cafe, categories, items);
        
        // Create deploy directory
        const deployDir = path.join(__dirname, '../deployed', cafe.slug);
        if (!fs.existsSync(deployDir)) {
            fs.mkdirSync(deployDir, { recursive: true });
        }
        
        // Write HTML file
        fs.writeFileSync(path.join(deployDir, 'index.html'), html);
        
        // Copy any uploaded images
        const assetsDir = path.join(deployDir, 'assets');
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        
        // Update cafe
        const localUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/deployed/${cafe.slug}`;
        
        db.prepare('UPDATE cafes SET is_deployed = 1, deployed_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(localUrl, cafeId);
        
        // Log activity
        db.prepare('INSERT INTO activity_log (user_id, cafe_id, action, details) VALUES (?, ?, ?, ?)')
            .run(req.user.id, cafeId, 'generate_deploy', 'Generated deployment files');
        
        res.json({
            success: true,
            deployedUrl: localUrl,
            previewUrl: `/m/${cafe.slug}`
        });
    } catch (error) {
        console.error('Generate deploy error:', error);
        res.status(500).json({ error: 'Failed to generate deployment files' });
    }
});

// Download deployment package
router.get('/:cafeId/download', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const db = await getDb();
        
        const cafe = db.prepare('SELECT * FROM cafes WHERE id = ?').get(cafeId);
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        const deployDir = path.join(__dirname, '../deployed', cafe.slug);
        
        if (!fs.existsSync(deployDir)) {
            return res.status(400).json({ error: 'Deployment files not generated yet' });
        }
        
        // Create zip
        res.attachment(`${cafe.slug}-menu.zip`);
        
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(deployDir, false);
        archive.finalize();
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to create download package' });
    }
});

// Get deployment status
router.get('/:cafeId/status', requireCafeAccess, async (req, res) => {
    try {
        const { cafeId } = req.params;
        const db = await getDb();
        
        const cafe = db.prepare('SELECT is_deployed, deployed_url, slug FROM cafes WHERE id = ?').get(cafeId);
        
        if (!cafe) {
            return res.status(404).json({ error: 'Cafe not found' });
        }
        
        const deployDir = path.join(__dirname, '../deployed', cafe.slug);
        const filesExist = fs.existsSync(path.join(deployDir, 'index.html'));
        
        res.json({
            isDeployed: !!cafe.is_deployed,
            deployedUrl: cafe.deployed_url,
            previewUrl: `/m/${cafe.slug}`,
            filesGenerated: filesExist
        });
    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ error: 'Failed to get deployment status' });
    }
});

// Deploy to Netlify (if configured)
router.post('/:cafeId/netlify', requireAdmin, async (req, res) => {
    try {
        const netlifyToken = process.env.NETLIFY_TOKEN;
        
        if (!netlifyToken) {
            return res.status(400).json({ 
                error: 'Netlify not configured',
                message: 'Add NETLIFY_TOKEN to .env file to enable auto-deployment'
            });
        }
        
        // TODO: Implement Netlify deployment
        // This would use the Netlify API to deploy the generated files
        
        res.json({
            success: false,
            message: 'Netlify deployment coming soon. For now, download the files and deploy manually.'
        });
    } catch (error) {
        console.error('Netlify deploy error:', error);
        res.status(500).json({ error: 'Failed to deploy to Netlify' });
    }
});

module.exports = router;
