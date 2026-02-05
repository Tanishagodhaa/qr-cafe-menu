/**
 * Menu Generator Service
 * Generates static HTML files for café menus
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/init');

class MenuGenerator {
    
    /**
     * Generate complete static HTML for a café menu
     */
    generateMenuHTML(cafe, categories) {
        const theme = {
            primary: cafe.primary_color || '#D4A574',
            secondary: cafe.secondary_color || '#8B7355',
            accent: cafe.accent_color || '#F5E6D3',
            background: cafe.background_color || '#FAF7F2',
            text: cafe.text_color || '#4A4A4A'
        };
        
        const currency = cafe.currency || '₹';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(cafe.name)} - Menu</title>
    <meta name="description" content="${this.escapeHtml(cafe.tagline || 'View our delicious menu')}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: ${theme.primary};
            --secondary: ${theme.secondary};
            --accent: ${theme.accent};
            --background: ${theme.background};
            --text: ${theme.text};
            --white: #FFFFFF;
            --shadow: rgba(0,0,0,0.1);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background: var(--background);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }
        
        /* Header */
        .header {
            background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            padding: 2rem 1rem;
            text-align: center;
            color: var(--white);
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/></svg>');
            opacity: 0.3;
        }
        
        .logo {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            object-fit: cover;
            border: 4px solid var(--white);
            margin-bottom: 1rem;
            position: relative;
            z-index: 1;
        }
        
        .logo-placeholder {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: var(--white);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            font-size: 2.5rem;
            color: var(--primary);
            position: relative;
            z-index: 1;
        }
        
        .cafe-name {
            font-family: 'Playfair Display', serif;
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            position: relative;
            z-index: 1;
        }
        
        .tagline {
            font-size: 1rem;
            opacity: 0.9;
            position: relative;
            z-index: 1;
        }
        
        /* Contact Bar */
        .contact-bar {
            background: var(--white);
            padding: 0.75rem 1rem;
            display: flex;
            justify-content: center;
            gap: 1.5rem;
            flex-wrap: wrap;
            box-shadow: 0 2px 10px var(--shadow);
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.85rem;
            color: var(--text);
            text-decoration: none;
        }
        
        .contact-item:hover {
            color: var(--primary);
        }
        
        .contact-item svg {
            width: 18px;
            height: 18px;
            fill: var(--primary);
        }
        
        /* Categories Navigation */
        .categories-nav {
            background: var(--white);
            padding: 1rem;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 10px var(--shadow);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        
        .categories-nav::-webkit-scrollbar {
            display: none;
        }
        
        .nav-container {
            display: flex;
            gap: 0.5rem;
            justify-content: flex-start;
            min-width: max-content;
            padding: 0 0.5rem;
        }
        
        .category-btn {
            padding: 0.6rem 1.2rem;
            border: 2px solid var(--primary);
            background: transparent;
            color: var(--primary);
            border-radius: 25px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.3s ease;
            white-space: nowrap;
            font-family: 'Poppins', sans-serif;
        }
        
        .category-btn:hover,
        .category-btn.active {
            background: var(--primary);
            color: var(--white);
        }
        
        /* Menu Container */
        .menu-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 1.5rem;
        }
        
        /* Category Section */
        .category-section {
            margin-bottom: 2rem;
        }
        
        .category-title {
            font-family: 'Playfair Display', serif;
            font-size: 1.5rem;
            color: var(--secondary);
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--accent);
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        .category-icon {
            font-size: 1.5rem;
        }
        
        /* Menu Items */
        .menu-items {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .menu-item {
            background: var(--white);
            border-radius: 12px;
            padding: 1rem;
            display: flex;
            gap: 1rem;
            box-shadow: 0 2px 10px var(--shadow);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .menu-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px var(--shadow);
        }
        
        .item-image {
            width: 80px;
            height: 80px;
            border-radius: 10px;
            object-fit: cover;
            flex-shrink: 0;
        }
        
        .item-placeholder {
            width: 80px;
            height: 80px;
            border-radius: 10px;
            background: var(--accent);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 2rem;
        }
        
        .item-content {
            flex: 1;
            min-width: 0;
        }
        
        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        
        .item-name {
            font-weight: 600;
            font-size: 1rem;
            color: var(--text);
        }
        
        .item-badges {
            display: flex;
            gap: 0.25rem;
            flex-wrap: wrap;
            margin-top: 0.25rem;
        }
        
        .badge {
            font-size: 0.65rem;
            padding: 0.2rem 0.5rem;
            border-radius: 10px;
            font-weight: 500;
        }
        
        .badge-bestseller {
            background: #FFD700;
            color: #333;
        }
        
        .badge-new {
            background: #4CAF50;
            color: white;
        }
        
        .badge-vegan {
            background: #8BC34A;
            color: white;
        }
        
        .badge-vegetarian {
            background: #AED581;
            color: #333;
        }
        
        .badge-spicy {
            background: #FF5722;
            color: white;
        }
        
        .badge-gf {
            background: #FFC107;
            color: #333;
        }
        
        .item-price {
            font-weight: 600;
            color: var(--primary);
            font-size: 1.1rem;
            white-space: nowrap;
        }
        
        .original-price {
            font-size: 0.85rem;
            color: #999;
            text-decoration: line-through;
            margin-left: 0.5rem;
        }
        
        .item-description {
            font-size: 0.85rem;
            color: #666;
            line-height: 1.5;
        }
        
        .item-meta {
            margin-top: 0.5rem;
            font-size: 0.75rem;
            color: #888;
        }
        
        /* Footer */
        .footer {
            background: var(--secondary);
            color: var(--white);
            padding: 2rem 1rem;
            text-align: center;
            margin-top: 2rem;
        }
        
        .footer-content {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .social-links {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .social-link {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s ease;
        }
        
        .social-link:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .social-link svg {
            width: 20px;
            height: 20px;
            fill: var(--white);
        }
        
        .powered-by {
            margin-top: 1.5rem;
            font-size: 0.75rem;
            opacity: 0.7;
        }
        
        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 3rem 1rem;
            color: #888;
        }
        
        .empty-state svg {
            width: 80px;
            height: 80px;
            margin-bottom: 1rem;
            opacity: 0.5;
        }
        
        /* Responsive */
        @media (min-width: 768px) {
            .header {
                padding: 3rem 2rem;
            }
            
            .cafe-name {
                font-size: 2.5rem;
            }
            
            .menu-item {
                padding: 1.25rem;
            }
            
            .item-image,
            .item-placeholder {
                width: 100px;
                height: 100px;
            }
        }
        
        /* Animations */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .menu-item {
            animation: fadeInUp 0.5s ease forwards;
        }
        
        .category-section:nth-child(1) .menu-item { animation-delay: 0.1s; }
        .category-section:nth-child(2) .menu-item { animation-delay: 0.2s; }
        .category-section:nth-child(3) .menu-item { animation-delay: 0.3s; }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="header">
        ${cafe.logo 
            ? `<img src="${cafe.logo}" alt="${this.escapeHtml(cafe.name)}" class="logo">`
            : `<div class="logo-placeholder">☕</div>`
        }
        <h1 class="cafe-name">${this.escapeHtml(cafe.name)}</h1>
        ${cafe.tagline ? `<p class="tagline">${this.escapeHtml(cafe.tagline)}</p>` : ''}
    </header>
    
    <!-- Contact Bar -->
    ${this.generateContactBar(cafe)}
    
    <!-- Categories Navigation -->
    ${categories.length > 0 ? `
    <nav class="categories-nav">
        <div class="nav-container">
            ${categories.map((cat, idx) => `
                <button class="category-btn${idx === 0 ? ' active' : ''}" data-category="${cat.id}">
                    ${cat.icon || ''} ${this.escapeHtml(cat.name)}
                </button>
            `).join('')}
        </div>
    </nav>
    ` : ''}
    
    <!-- Menu -->
    <main class="menu-container">
        ${categories.length > 0 ? categories.map(cat => `
        <section class="category-section" id="category-${cat.id}">
            <h2 class="category-title">
                ${cat.icon ? `<span class="category-icon">${cat.icon}</span>` : ''}
                ${this.escapeHtml(cat.name)}
            </h2>
            ${cat.description ? `<p style="color: #666; margin-bottom: 1rem; font-size: 0.9rem;">${this.escapeHtml(cat.description)}</p>` : ''}
            <div class="menu-items">
                ${cat.items && cat.items.length > 0 ? cat.items.map(item => this.generateItemHTML(item, currency)).join('') : `
                <div class="empty-state">
                    <p>No items in this category yet.</p>
                </div>
                `}
            </div>
        </section>
        `).join('') : `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <h3>Menu Coming Soon</h3>
            <p>Our delicious menu is being prepared.</p>
        </div>
        `}
    </main>
    
    <!-- Footer -->
    <footer class="footer">
        <div class="footer-content">
            <p>${this.escapeHtml(cafe.name)}</p>
            ${cafe.address ? `<p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.8;">${this.escapeHtml(cafe.address)}</p>` : ''}
            ${this.generateSocialLinks(cafe)}
            <p class="powered-by">Powered by QR Menu System</p>
        </div>
    </footer>
    
    <script>
        // Category navigation
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active button
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Scroll to category
                const categoryId = btn.dataset.category;
                const section = document.getElementById('category-' + categoryId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
        
        // Highlight category on scroll
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const categoryId = entry.target.id.replace('category-', '');
                    document.querySelectorAll('.category-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.category === categoryId);
                    });
                }
            });
        }, { threshold: 0.3 });
        
        document.querySelectorAll('.category-section').forEach(section => {
            observer.observe(section);
        });
    </script>
</body>
</html>`;
    }
    
    /**
     * Generate contact bar HTML
     */
    generateContactBar(cafe) {
        const contacts = [];
        
        if (cafe.phone) {
            contacts.push(`
                <a href="tel:${cafe.phone}" class="contact-item">
                    <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                    ${this.escapeHtml(cafe.phone)}
                </a>
            `);
        }
        
        if (cafe.email) {
            contacts.push(`
                <a href="mailto:${cafe.email}" class="contact-item">
                    <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    Email Us
                </a>
            `);
        }
        
        if (cafe.website) {
            contacts.push(`
                <a href="${cafe.website}" target="_blank" class="contact-item">
                    <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
                    Website
                </a>
            `);
        }
        
        if (contacts.length === 0) return '';
        
        return `
            <div class="contact-bar">
                ${contacts.join('')}
            </div>
        `;
    }
    
    /**
     * Generate social links HTML
     */
    generateSocialLinks(cafe) {
        const links = [];
        
        if (cafe.instagram) {
            links.push(`
                <a href="https://instagram.com/${cafe.instagram}" target="_blank" class="social-link" title="Instagram">
                    <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
            `);
        }
        
        if (cafe.facebook) {
            links.push(`
                <a href="https://facebook.com/${cafe.facebook}" target="_blank" class="social-link" title="Facebook">
                    <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
            `);
        }
        
        if (links.length === 0) return '';
        
        return `
            <div class="social-links">
                ${links.join('')}
            </div>
        `;
    }
    
    /**
     * Generate item HTML
     */
    generateItemHTML(item, currency) {
        const badges = [];
        if (item.is_bestseller) badges.push('<span class="badge badge-bestseller">⭐ Bestseller</span>');
        if (item.is_new) badges.push('<span class="badge badge-new">🆕 New</span>');
        if (item.is_vegan) badges.push('<span class="badge badge-vegan">🌱 Vegan</span>');
        if (item.is_vegetarian) badges.push('<span class="badge badge-vegetarian">🥬 Vegetarian</span>');
        if (item.is_spicy) badges.push('<span class="badge badge-spicy">🌶️ Spicy</span>');
        if (item.is_gluten_free) badges.push('<span class="badge badge-gf">GF</span>');
        
        return `
            <div class="menu-item">
                ${item.image 
                    ? `<img src="${item.image}" alt="${this.escapeHtml(item.name)}" class="item-image">`
                    : '<div class="item-placeholder">🍽️</div>'
                }
                <div class="item-content">
                    <div class="item-header">
                        <div>
                            <div class="item-name">${this.escapeHtml(item.name)}</div>
                            ${badges.length > 0 ? `<div class="item-badges">${badges.join('')}</div>` : ''}
                        </div>
                        <div class="item-price">
                            ${currency}${parseFloat(item.price).toFixed(2)}
                            ${item.original_price ? `<span class="original-price">${currency}${parseFloat(item.original_price).toFixed(2)}</span>` : ''}
                        </div>
                    </div>
                    ${item.description ? `<p class="item-description">${this.escapeHtml(item.description)}</p>` : ''}
                    ${item.calories ? `<p class="item-meta">${item.calories} cal</p>` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    /**
     * Generate and save static files for a café
     */
    async generateStaticFiles(cafeId) {
        const db = await getDb();
        
        // Get café
        const cafe = db.prepare('SELECT * FROM cafes WHERE id = ?').get(cafeId);
        if (!cafe) {
            throw new Error('Café not found');
        }
        
        // Get categories with items
        const categories = db.prepare(`
            SELECT * FROM categories WHERE cafe_id = ? AND is_active = 1 ORDER BY sort_order ASC
        `).all(cafeId);
        
        const items = db.prepare(`
            SELECT * FROM menu_items WHERE cafe_id = ? AND is_available = 1 ORDER BY sort_order ASC
        `).all(cafeId);
        
        // Organize items by category
        const categoriesWithItems = categories.map(cat => ({
            ...cat,
            items: items.filter(item => item.category_id === cat.id)
        }));
        
        // Generate HTML
        const html = this.generateMenuHTML(cafe, categoriesWithItems);
        
        // Save to deploy folder
        const deployDir = path.join(__dirname, '..', 'deploy', cafe.slug);
        
        if (!fs.existsSync(deployDir)) {
            fs.mkdirSync(deployDir, { recursive: true });
        }
        
        // Write HTML file
        fs.writeFileSync(path.join(deployDir, 'index.html'), html);
        
        // Copy images if they exist locally
        const imagesDir = path.join(deployDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Update last generated timestamp
        db.prepare('UPDATE cafes SET last_generated = ? WHERE id = ?')
            .run(new Date().toISOString(), cafeId);
        
        return {
            success: true,
            path: deployDir,
            slug: cafe.slug
        };
    }
}

module.exports = new MenuGenerator();
