/**
 * Database Initialization
 * Uses Turso (libSQL) for cloud-hosted SQLite
 * Works on Vercel and locally with persistent data
 */

const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// Turso database configuration
const TURSO_URL = process.env.TURSO_URL || 'libsql://qrmenu-tanishagodhaa.aws-ap-south-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzAyODU2NDEsImlkIjoiZTU1ZWE0ZjEtMmQ0Yi00M2YwLTkwMzktZjU5Nzc3YzIwZjA3IiwicmlkIjoiYTJkNmY3MjYtZWE5YS00ODdiLWFiNWUtOWFhOWQwYmEzNjZjIn0.O535XfKTX73IKP0m_MIwvPCZuly7L0Zd6tOU1Yd3LVgdqjp2-EvWs8M265FJcWj1fxYCltG9JFPoueyFzTPjDA';

let client = null;

function getClient() {
    if (!client) {
        client = createClient({
            url: TURSO_URL,
            authToken: TURSO_TOKEN
        });
    }
    return client;
}

async function initializeDatabase() {
    const db = getClient();
    
    // Users table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            cafe_id INTEGER,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Cafes table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS cafes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            tagline TEXT,
            description TEXT,
            logo TEXT,
            cover_image TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            website TEXT,
            google_link TEXT,
            instagram TEXT,
            facebook TEXT,
            currency TEXT DEFAULT '₹',
            primary_color TEXT DEFAULT '#2C5F2D',
            secondary_color TEXT DEFAULT '#97BC62',
            accent_color TEXT DEFAULT '#DAA520',
            background_color TEXT DEFAULT '#FDFBF7',
            text_color TEXT DEFAULT '#2D3436',
            is_published INTEGER DEFAULT 0,
            is_deployed INTEGER DEFAULT 0,
            deployed_url TEXT,
            qr_code_path TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Categories table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '🍽️',
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Menu Items table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL,
            original_price REAL,
            image TEXT,
            calories INTEGER,
            is_vegan INTEGER DEFAULT 0,
            is_vegetarian INTEGER DEFAULT 0,
            is_gluten_free INTEGER DEFAULT 0,
            is_spicy INTEGER DEFAULT 0,
            is_bestseller INTEGER DEFAULT 0,
            is_popular INTEGER DEFAULT 0,
            is_new INTEGER DEFAULT 0,
            is_available INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Activity Log table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            cafe_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Create default admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qrmenu.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    const existingAdmin = await db.execute({
        sql: 'SELECT * FROM users WHERE email = ?',
        args: [adminEmail]
    });
    
    if (existingAdmin.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await db.execute({
            sql: 'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
            args: [adminEmail, hashedPassword, 'System Admin', 'admin']
        });
        
        console.log('✅ Default admin user created');
        console.log(`   Email: ${adminEmail}`);
    }
    
    console.log('✅ Database initialized successfully (Turso)');
}

// Wrapper class for consistent API (mimics better-sqlite3 style)
class DatabaseWrapper {
    constructor() {
        this.ready = false;
        this.client = null;
    }
    
    async init() {
        if (!this.ready) {
            this.client = getClient();
            await initializeDatabase();
            this.ready = true;
        }
        return this;
    }
    
    prepare(sql) {
        const client = this.client;
        return {
            run: async function(...params) {
                const result = await client.execute({ sql, args: params });
                return { 
                    lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null, 
                    changes: result.rowsAffected 
                };
            },
            get: async function(...params) {
                const result = await client.execute({ sql, args: params });
                return result.rows.length > 0 ? result.rows[0] : null;
            },
            all: async function(...params) {
                const result = await client.execute({ sql, args: params });
                return result.rows;
            }
        };
    }
    
    async exec(sql) {
        await this.client.execute(sql);
    }
}

let wrapper = null;

async function getDatabaseWrapper() {
    if (!wrapper) {
        wrapper = new DatabaseWrapper();
        await wrapper.init();
    }
    return wrapper;
}

module.exports = { getDb: getDatabaseWrapper, initializeDatabase };
