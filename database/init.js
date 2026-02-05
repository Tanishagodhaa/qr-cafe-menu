/**
 * Database Initialization
 * Creates tables and default admin user
 * Using sql.js (SQLite compiled to WebAssembly - no native compilation needed)
 * Works with Vercel serverless (in-memory) or local (file-based)
 */

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Detect if running on Vercel (read-only filesystem)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const dbPath = path.join(__dirname, 'qrmenu.db');

let db = null;
let SQL = null;

async function getDb() {
    if (db) return db;
    
    if (!SQL) {
        // On Vercel, fetch WASM from CDN and load it
        if (isVercel) {
            const wasmUrl = 'https://sql.js.org/dist/sql-wasm.wasm';
            const response = await fetch(wasmUrl);
            const wasmBinary = await response.arrayBuffer();
            SQL = await initSqlJs({ wasmBinary });
        } else {
            // Locally, use the default bundled WASM
            SQL = await initSqlJs();
        }
    }
    
    // On Vercel: use in-memory database
    // Locally: try to load from file
    if (!isVercel && fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }
    
    return db;
}

function saveDb() {
    // Only save to file if not on Vercel (Vercel has read-only filesystem)
    if (!isVercel && db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        } catch (e) {
            console.log('Note: Could not save database to file (read-only filesystem)');
        }
    }
}

// Helper function to run queries with parameters
function run(sql, params = []) {
    db.run(sql, params);
    saveDb();
}

// Helper function to get single row
function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

// Helper function to get all rows
function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Get last insert ID
function lastInsertRowId() {
    const result = db.exec("SELECT last_insert_rowid() as id")[0];
    return result ? result.values[0][0] : null;
}

async function initializeDatabase() {
    await getDb();
    
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            cafe_id INTEGER,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cafe_id) REFERENCES cafes(id)
        )
    `);
    
    // Cafes table
    db.run(`
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
            currency TEXT DEFAULT '$',
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    `);
    
    // Categories table
    db.run(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '🍽️',
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE
        )
    `);
    
    // Menu Items table
    db.run(`
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        )
    `);
    
    // Try to add is_popular column if it doesn't exist (for existing databases)
    try {
        db.run('ALTER TABLE menu_items ADD COLUMN is_popular INTEGER DEFAULT 0');
    } catch (e) {
        // Column already exists, ignore
    }
    
    // Activity Log table
    db.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            cafe_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (cafe_id) REFERENCES cafes(id)
        )
    `);
    
    saveDb();
    
    // Create default admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qrmenu.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    const existingAdmin = get('SELECT * FROM users WHERE email = ?', [adminEmail]);
    
    if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        run(`
            INSERT INTO users (email, password, name, role) 
            VALUES (?, ?, ?, ?)
        `, [adminEmail, hashedPassword, 'System Admin', 'admin']);
        
        console.log('✅ Default admin user created');
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
    }
    
    console.log('✅ Database initialized successfully');
    return { db, run, get, all, lastInsertRowId, saveDb };
}

// Wrapper class for consistent API
class DatabaseWrapper {
    constructor() {
        this.ready = false;
    }
    
    async init() {
        if (!this.ready) {
            await initializeDatabase();
            this.ready = true;
        }
        return this;
    }
    
    prepare(sql) {
        return {
            run: function(...params) {
                run(sql, params);
                return { lastInsertRowid: lastInsertRowId(), changes: db.getRowsModified() };
            },
            get: function(...params) {
                return get(sql, params);
            },
            all: function(...params) {
                return all(sql, params);
            }
        };
    }
    
    exec(sql) {
        db.run(sql);
        saveDb();
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

module.exports = { getDb: getDatabaseWrapper, initializeDatabase, saveDb };
