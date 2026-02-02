/**
 * Google Link Extractor Service
 * Extracts café basic info from Google Maps links
 * Menu items must be added manually as Google doesn't expose menu data reliably
 */

const puppeteer = require('puppeteer');

/**
 * Extract café data from Google Maps/Business link
 */
async function extractFromGoogleLink(url) {
    const data = {
        name: '',
        description: '',
        phone: '',
        address: '',
        website: '',
        categories: [],
        theme: {
            primaryColor: '#2C5F2D',
            secondaryColor: '#97BC62',
            accentColor: '#DAA520',
            backgroundColor: '#FDFBF7',
            textColor: '#2D3436'
        }
    };
    
    let browser = null;
    
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('Navigating to:', url);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise(r => setTimeout(r, 4000));
        
        console.log('Final URL:', page.url());
        
        // Extract name
        data.name = await page.evaluate(() => {
            const selectors = ['h1.DUwDvf', 'h1.fontHeadlineLarge', 'h1', '.qBF1Pd'];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el?.textContent?.trim()) return el.textContent.trim();
            }
            const title = document.title;
            return title.includes(' - Google') ? title.split(' - Google')[0].trim() : 'My Café';
        });
        
        // Extract phone
        data.phone = await page.evaluate(() => {
            const phoneEl = document.querySelector('[data-item-id*="phone"]');
            if (phoneEl) {
                const match = phoneEl.textContent?.match(/[\d\s\-\+\(\)]{7,}/);
                if (match) return match[0].trim();
            }
            const telLink = document.querySelector('a[href^="tel:"]');
            return telLink ? telLink.href.replace('tel:', '').trim() : '';
        });
        
        // Extract address
        data.address = await page.evaluate(() => {
            const addressEl = document.querySelector('[data-item-id="address"]');
            if (addressEl) {
                const textEl = addressEl.querySelector('.Io6YTe, .fontBodyMedium');
                if (textEl) return textEl.textContent.trim();
            }
            return '';
        });
        
        // Extract website
        data.website = await page.evaluate(() => {
            const el = document.querySelector('[data-item-id="authority"] a');
            return el?.href || '';
        });
        
        await page.close();
        
    } catch (error) {
        console.error('Google extraction error:', error.message);
        data.name = data.name || 'My Café';
    } finally {
        if (browser) await browser.close();
    }
    
    console.log('Extracted café info:', { name: data.name, phone: data.phone, address: data.address });
    return data;
}

/**
 * Get a sample café menu template
 */
function getSampleCafeMenu() {
    return [
        {
            name: 'Hot Beverages',
            icon: '☕',
            items: [
                { name: 'Espresso', price: 3.50, description: 'Rich and bold single shot' },
                { name: 'Americano', price: 4.00, description: 'Espresso with hot water' },
                { name: 'Cappuccino', price: 4.50, description: 'Espresso with steamed milk foam' },
                { name: 'Latte', price: 5.00, description: 'Espresso with steamed milk' },
                { name: 'Mocha', price: 5.50, description: 'Espresso, chocolate, steamed milk' },
                { name: 'Hot Chocolate', price: 4.50, description: 'Rich chocolate with whipped cream' }
            ]
        },
        {
            name: 'Cold Beverages',
            icon: '🧊',
            items: [
                { name: 'Iced Coffee', price: 4.50, description: 'Chilled brewed coffee' },
                { name: 'Iced Latte', price: 5.50, description: 'Espresso with cold milk over ice' },
                { name: 'Cold Brew', price: 5.00, description: 'Slow-steeped for 12 hours' },
                { name: 'Frappe', price: 6.00, description: 'Blended iced coffee drink' },
                { name: 'Fresh Lemonade', price: 4.00, description: 'House-made with fresh lemons' }
            ]
        },
        {
            name: 'Pastries & Snacks',
            icon: '🥐',
            items: [
                { name: 'Croissant', price: 3.50, description: 'Buttery, flaky French pastry' },
                { name: 'Chocolate Muffin', price: 4.00, description: 'Rich chocolate chip muffin' },
                { name: 'Blueberry Scone', price: 3.75, description: 'Fresh blueberries, lemon glaze' },
                { name: 'Cinnamon Roll', price: 4.50, description: 'Warm with cream cheese frosting' },
                { name: 'Banana Bread', price: 3.50, description: 'Moist, with walnuts' }
            ]
        },
        {
            name: 'Breakfast',
            icon: '🍳',
            items: [
                { name: 'Avocado Toast', price: 8.50, description: 'Sourdough, avocado, poached egg' },
                { name: 'Breakfast Sandwich', price: 7.50, description: 'Egg, cheese, bacon on brioche' },
                { name: 'Granola Bowl', price: 6.50, description: 'Greek yogurt, granola, fresh berries' },
                { name: 'Bagel with Cream Cheese', price: 4.50, description: 'Toasted, with choice of spread' }
            ]
        },
        {
            name: 'Sandwiches',
            icon: '🥪',
            items: [
                { name: 'Club Sandwich', price: 9.50, description: 'Turkey, bacon, lettuce, tomato' },
                { name: 'Grilled Cheese', price: 7.00, description: 'Three cheeses on sourdough' },
                { name: 'Veggie Wrap', price: 8.50, description: 'Hummus, fresh vegetables, feta' },
                { name: 'Chicken Panini', price: 10.00, description: 'Grilled chicken, pesto, mozzarella' }
            ]
        }
    ];
}

/**
 * Category icon mapper
 */
function getCategoryIcon(categoryName) {
    const name = categoryName.toLowerCase();
    if (name.includes('coffee') || name.includes('hot') || name.includes('beverage')) return '☕';
    if (name.includes('cold') || name.includes('ice') || name.includes('frappe')) return '🧊';
    if (name.includes('tea')) return '🍵';
    if (name.includes('pastry') || name.includes('bakery') || name.includes('dessert')) return '🥐';
    if (name.includes('breakfast') || name.includes('brunch')) return '🍳';
    if (name.includes('sandwich') || name.includes('lunch')) return '🥪';
    if (name.includes('salad')) return '🥗';
    if (name.includes('soup')) return '🍲';
    if (name.includes('pizza')) return '🍕';
    if (name.includes('burger')) return '🍔';
    return '🍽️';
}

module.exports = { 
    extractFromGoogleLink, 
    getSampleCafeMenu,
    getCategoryIcon 
};
