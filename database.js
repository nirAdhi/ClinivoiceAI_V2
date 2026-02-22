// Database Module for Clinivoice - MySQL
require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const logger = require('./middleware/logger');

const isDev = process.env.NODE_ENV !== 'production';

// Support Railway MySQL environment variables
let dbConfig;
if (process.env.MYSQL_URL) {
    const url = new URL(process.env.MYSQL_URL);
    dbConfig = {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.replace('/', ''),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
} else if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    dbConfig = {
        host: url.hostname,
        port: url.port || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.replace('/', ''),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
} else if (process.env.MYSQLHOST) {
    // Railway provides separate MySQL environment variables
    dbConfig = {
        host: process.env.MYSQLHOST,
        port: parseInt(process.env.MYSQLPORT) || 3306,
        user: process.env.MYSQLUSER || 'root',
        password: process.env.MYSQLPASSWORD || '',
        database: process.env.MYSQLDATABASE || 'railway',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
} else {
    dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'clinivoice_v2',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

logger.success('MySQL connection pool created');

async function initializeTables() {
    try {
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                external_id VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain),
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                patient_id INT,
                domain VARCHAR(50) NOT NULL,
                tooth_number VARCHAR(100),
                audio_url TEXT,
                transcription TEXT,
                ai_notes TEXT,
                status VARCHAR(50) DEFAULT 'recording',
                duration INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                domain VARCHAR(50) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'clinician',
                reset_token VARCHAR(255) NULL,
                reset_expires DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create plans table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) DEFAULT 0.00,
                billing_period VARCHAR(20) DEFAULT 'monthly',
                transcription_limit INT NULL,
                audio_upload_allowed BOOLEAN DEFAULT TRUE,
                features JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create subscriptions table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                plan_id INT NOT NULL,
                stripe_subscription_id VARCHAR(255),
                stripe_customer_id VARCHAR(255),
                start_date DATE,
                end_date DATE,
                status VARCHAR(20) DEFAULT 'trial',
                cancel_at_period_end BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_subscription (user_id),
                FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create transcription whitelist table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS transcription_whitelist (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                reason TEXT,
                granted_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_whitelist (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create transcription usage table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS transcription_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                month DATE NOT NULL,
                usage_count INT DEFAULT 0,
                UNIQUE KEY unique_user_month (user_id, month)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create plan history table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS plan_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                plan_id INT NOT NULL,
                changes JSON,
                changed_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create user_features table
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS user_features (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                transcription_enabled BOOLEAN DEFAULT TRUE,
                audio_upload_enabled BOOLEAN DEFAULT TRUE,
                UNIQUE KEY unique_user_features (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Insert default plans if none exist
        const [planCount] = await promisePool.query('SELECT COUNT(*) as count FROM plans');
        if (planCount[0].count === 0) {
            await promisePool.query(`
                INSERT INTO plans (name, display_name, description, price, transcription_limit, audio_upload_allowed, features) VALUES
                ('free_trial', 'Free Trial', '10 free test transcriptions', 0.00, 10, TRUE, '["10 free transcriptions", "Basic SOAP notes", "Test all features"]'),
                ('starter', 'Starter', 'Perfect for individual clinicians', 19.00, 100, TRUE, '["100 transcriptions/month", "AI Clinical Notes", "Audio Upload", "Email Support"]'),
                ('enterprise', 'Enterprise', 'Unlimited transcription for large practices', 0.00, NULL, TRUE, '["Unlimited transcriptions", "Priority Support", "Custom AI Training", "API Access", "White-label Options"]')
            `);
            logger.info('Default plans created');
        }

        // Add new columns for manual payment system
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN plan_type VARCHAR(50) DEFAULT "free_trial"');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN transcription_count INT DEFAULT 0');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN transcription_limit INT DEFAULT 10');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        
        try {
            await promisePool.query("ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active'");
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN plan_expires_at DATETIME NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN payment_notes TEXT NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

        // Ensure legacy tables have missing columns
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
        } catch (e) {
            // ER_DUP_FIELDNAME = column already exists: safe to ignore
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add tooth_number column if missing
        try {
            await promisePool.query('ALTER TABLE sessions ADD COLUMN tooth_number VARCHAR(100)');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add input_source column for tracking WEB vs MOBILE
        try {
            await promisePool.query("ALTER TABLE sessions ADD COLUMN input_source VARCHAR(20) DEFAULT 'WEB'");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add user_id column to patients if missing (for user isolation)
        try {
            await promisePool.query('ALTER TABLE patients ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT \'\'');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        // Add index on user_id for patients
        try {
            await promisePool.query('ALTER TABLE patients ADD INDEX idx_user_id (user_id)');
        } catch (e) {
            // Index may already exist
        }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE patients ADD COLUMN external_id VARCHAR(255)');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'clinician'");
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
        try {
            await promisePool.query('ALTER TABLE users ADD COLUMN reset_expires DATETIME NULL');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

        // Mobile sessions table for remote microphone feature
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS mobile_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_code VARCHAR(10) UNIQUE NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                web_session_id VARCHAR(255),
                status VARCHAR(20) DEFAULT 'waiting',
                input_source VARCHAR(20) DEFAULT 'MOBILE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                INDEX idx_session_code (session_code),
                INDEX idx_user_id (user_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Create default admin user if none exists (avoid hoisting issues)
        const [adminExists] = await promisePool.query('SELECT id FROM users WHERE user_id = ? LIMIT 1', ['admin']);
        if (adminExists.length === 0) {
            const hash = await bcrypt.hash('Admin@123', 10);
            await promisePool.query(
                'INSERT INTO users (user_id, domain, password_hash) VALUES (?, ?, ?)',
                ['admin', 'medical', hash]
            );
            logger.info('Default admin user created: admin / Admin@123');
        }

        logger.success('Database tables ready');
    } catch (error) {
        logger.error('Error initializing tables:', error);
    }
}

initializeTables();

// Database helper functions (simplified for brevity)
const getAllPatients = async (userId) => {
    const query = userId ? 'SELECT * FROM patients WHERE user_id = ? ORDER BY created_at DESC' : 'SELECT * FROM patients ORDER BY created_at DESC';
    const params = userId ? [userId] : [];
    const [rows] = await promisePool.query(query, params);
    return rows;
};

const createPatient = async (data) => {
    const { name, email, phone, domain, notes, external_id = null, user_id } = data;
    const [result] = await promisePool.query(
        'INSERT INTO patients (name, email, phone, external_id, domain, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, phone, external_id, domain, notes, user_id]
    );
    return { id: result.insertId };
};

// Ensure a patient exists by name for a specific user; return patient id
const ensurePatientByName = async ({ name, domain, user_id }) => {
    const [[row]] = await promisePool.query('SELECT id FROM patients WHERE name = ? AND domain = ? AND user_id = ? LIMIT 1', [name, domain, user_id]);
    if (row && row.id) return row.id;
    const [result] = await promisePool.query('INSERT INTO patients (name, domain, user_id) VALUES (?, ?, ?)', [name, domain, user_id]);
    return result.insertId;
};

const getAllSessions = async (userId) => {
    const query = userId
        ? 'SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC'
        : 'SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id ORDER BY s.created_at DESC';
    const params = userId ? [userId] : [];
    const [rows] = await promisePool.query(query, params);
    return rows;
};

const createSession = async (data) => {
    const { user_id, patient_id, domain } = data;
    const [result] = await promisePool.query(
        'INSERT INTO sessions (user_id, patient_id, domain, status) VALUES (?, ?, ?, ?)',
        [user_id, patient_id, domain, 'recording']
    );
    return { id: result.insertId };
};

const updateSession = async (id, data) => {
    const updates = [];
    const params = [];

    if (data.transcription !== undefined) { updates.push('transcription = ?'); params.push(data.transcription); }
    if (data.ai_notes !== undefined) { updates.push('ai_notes = ?'); params.push(data.ai_notes); }
    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.audio_url !== undefined) { updates.push('audio_url = ?'); params.push(data.audio_url); }
    if (data.duration !== undefined) { updates.push('duration = ?'); params.push(data.duration); }
    if (data.tooth_number !== undefined) { updates.push('tooth_number = ?'); params.push(data.tooth_number); }

    params.push(id);
    const sql = `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`;
    await promisePool.query(sql, params);
};

const createUser = async ({ user_id, password, domain, role = 'clinician', name = null, email = null }) => {
    const password_hash = await bcrypt.hash(password, 10);
    
    // Insert new user with FREE_TRIAL plan (10 transcriptions)
    try {
        await promisePool.query(
            `INSERT INTO users (user_id, domain, password_hash, role, name, email, plan_type, transcription_count, transcription_limit, account_status) 
             VALUES (?, ?, ?, ?, ?, ?, 'free_trial', 0, 10, 'active')`,
            [user_id, domain || 'medical', password_hash, role, name, email]
        );
    } catch (e) {
        // Handle missing columns - add them and retry
        const msg = String(e && (e.sqlMessage || e.message) || '');
        
        // Add any missing columns
        const columnsToAdd = [
            { check: 'password_hash', sql: 'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)' },
            { check: "'domain'", sql: "ALTER TABLE users ADD COLUMN domain VARCHAR(50) NOT NULL DEFAULT 'medical'" },
            { check: "'role'", sql: "ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'clinician'" },
            { check: "'name'", sql: 'ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL' },
            { check: "'email'", sql: 'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL' },
            { check: "'plan_type'", sql: 'ALTER TABLE users ADD COLUMN plan_type VARCHAR(50) DEFAULT "free_trial"' },
            { check: "'transcription_count'", sql: 'ALTER TABLE users ADD COLUMN transcription_count INT DEFAULT 0' },
            { check: "'transcription_limit'", sql: 'ALTER TABLE users ADD COLUMN transcription_limit INT DEFAULT 10' },
            { check: "'account_status'", sql: "ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active'" }
        ];
        
        for (const col of columnsToAdd) {
            if (msg.includes(col.check)) {
                try {
                    await promisePool.query(col.sql);
                } catch (err) { /* ignore if already exists */ }
            }
        }
        
        // Retry insert
        await promisePool.query(
            `INSERT INTO users (user_id, domain, password_hash, role, name, email, plan_type, transcription_count, transcription_limit, account_status) 
             VALUES (?, ?, ?, ?, ?, ?, 'free_trial', 0, 10, 'active')`,
            [user_id, domain || 'medical', password_hash, role, name, email]
        );
    }
};

const verifyUser = async ({ user_id, password }) => {
    const [[user]] = await promisePool.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password_hash);
    return match ? user : null;
};

const getAllUsers = async () => {
    const [rows] = await promisePool.query('SELECT id, user_id, name, email, domain, role, created_at, last_login FROM users ORDER BY created_at DESC');
    return rows;
};

const updateUserProfile = async (user_id, data) => {
    const updates = [];
    const params = [];
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.email !== undefined) { updates.push('email = ?'); params.push(data.email); }
    if (data.domain !== undefined) { updates.push('domain = ?'); params.push(data.domain); }
    if (data.role !== undefined) { updates.push('role = ?'); params.push(data.role); }
    if (data.password) {
        const hash = await bcrypt.hash(data.password, 10);
        updates.push('password_hash = ?'); params.push(hash);
    }
    if (updates.length === 0) return;
    params.push(user_id);
    await promisePool.query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);
};

const deleteUser = async (user_id) => {
    await promisePool.query('DELETE FROM sessions WHERE user_id = ?', [user_id]);
    await promisePool.query('DELETE FROM users WHERE user_id = ?', [user_id]);
};

const setResetToken = async (user_id, token, expires) => {
    await promisePool.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE user_id = ?', [token, expires, user_id]);
};

const findUserByResetToken = async (token) => {
    const now = new Date();
    const [[user]] = await promisePool.query('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', [token, now]);
    return user || null;
};

const clearResetTokenAndSetPassword = async (user_id, newPassword) => {
    const hash = await bcrypt.hash(newPassword, 10);
    await promisePool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE user_id = ?', [hash, user_id]);
};

const getUserStats = async (userId) => {
    const [[sessionsCount]] = await promisePool.query('SELECT COUNT(*) as total FROM sessions WHERE user_id = ?', [userId]);
    const [[patientsCount]] = await promisePool.query('SELECT COUNT(*) as total FROM patients WHERE user_id = ?', [userId]);
    const [[todayCount]] = await promisePool.query('SELECT COUNT(*) as total FROM sessions WHERE user_id = ? AND DATE(created_at) = CURDATE()', [userId]);

    return {
        totalSessions: sessionsCount.total,
        totalPatients: patientsCount.total,
        sessionsToday: todayCount.total,
        aiNotesGenerated: sessionsCount.total,
    };
};

// ==================== SUBSCRIPTION & PLANS ====================

const getAllPlans = async () => {
    const [rows] = await promisePool.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY price ASC');
    return rows;
};

const getPlanById = async (planId) => {
    const [[plan]] = await promisePool.query('SELECT * FROM plans WHERE id = ?', [planId]);
    return plan || null;
};

const getPlanByName = async (planName) => {
    const [[plan]] = await promisePool.query('SELECT * FROM plans WHERE name = ?', [planName]);
    return plan || null;
};

const createPlan = async ({ name, display_name, description, price, billing_period = 'monthly', transcription_limit, audio_upload_allowed = true, features = [] }) => {
    const [result] = await promisePool.query(
        'INSERT INTO plans (name, display_name, description, price, billing_period, transcription_limit, audio_upload_allowed, features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, display_name, description, price, billing_period, transcription_limit, audio_upload_allowed, JSON.stringify(features)]
    );
    return { id: result.insertId };
};

// ==================== SUBSCRIPTIONS ====================

const getUserSubscription = async (userId) => {
    const [[sub]] = await promisePool.query(
        `SELECT s.*, p.name as plan_name, p.display_name, p.price, p.transcription_limit, p.features 
         FROM subscriptions s 
         JOIN plans p ON s.plan_id = p.id 
         WHERE s.user_id = ? 
         ORDER BY s.created_at DESC LIMIT 1`,
        [userId]
    );
    return sub || null;
};

const createSubscription = async ({ user_id, plan_id, stripe_subscription_id = null, stripe_customer_id = null, start_date, end_date = null, status = 'trial' }) => {
    const [result] = await promisePool.query(
        'INSERT INTO subscriptions (user_id, plan_id, stripe_subscription_id, stripe_customer_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, plan_id, stripe_subscription_id, stripe_customer_id, start_date, end_date, status]
    );
    return { id: result.insertId };
};

const updateSubscription = async (subscriptionId, data) => {
    const updates = [];
    const params = [];

    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.end_date !== undefined) { updates.push('end_date = ?'); params.push(data.end_date); }
    if (data.stripe_subscription_id !== undefined) { updates.push('stripe_subscription_id = ?'); params.push(data.stripe_subscription_id); }
    if (data.stripe_customer_id !== undefined) { updates.push('stripe_customer_id = ?'); params.push(data.stripe_customer_id); }
    if (data.cancel_at_period_end !== undefined) { updates.push('cancel_at_period_end = ?'); params.push(data.cancel_at_period_end); }

    if (updates.length === 0) return;
    params.push(subscriptionId);
    await promisePool.query(`UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`, params);
};

const getSubscriptionByStripeId = async (stripeSubscriptionId) => {
    const [[sub]] = await promisePool.query('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?', [stripeSubscriptionId]);
    return sub || null;
};

// ==================== TRANSCRIPTION WHITELIST ====================

const isWhitelisted = async (userId) => {
    const [[row]] = await promisePool.query('SELECT id FROM transcription_whitelist WHERE user_id = ?', [userId]);
    return !!row;
};

const addToWhitelist = async (userId, reason = null, grantedBy = null) => {
    try {
        await promisePool.query(
            'INSERT INTO transcription_whitelist (user_id, reason, granted_by) VALUES (?, ?, ?)',
            [userId, reason, grantedBy]
        );
        return true;
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return false; // Already whitelisted
        throw err;
    }
};

const removeFromWhitelist = async (userId) => {
    await promisePool.query('DELETE FROM transcription_whitelist WHERE user_id = ?', [userId]);
};

const getAllWhitelistedUsers = async () => {
    const [rows] = await promisePool.query(
        `SELECT w.*, u.user_id, u.name, u.email 
         FROM transcription_whitelist w 
         JOIN users u ON w.user_id = u.id 
         ORDER BY w.created_at DESC`
    );
    return rows;
};

// ==================== USAGE TRACKING ====================

const getTranscriptionUsage = async (userId, month = null) => {
    // If no month specified, use current month
    const targetMonth = month || new Date().toISOString().slice(0, 7) + '-01';
    const [[usage]] = await promisePool.query(
        'SELECT usage_count FROM transcription_usage WHERE user_id = ? AND month = ?',
        [userId, targetMonth]
    );
    return usage ? usage.usage_count : 0;
};

const incrementTranscriptionUsage = async (userId, month = null) => {
    const targetMonth = month || new Date().toISOString().slice(0, 7) + '-01';
    await promisePool.query(
        `INSERT INTO transcription_usage (user_id, month, usage_count) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE usage_count = usage_count + 1`,
        [userId, targetMonth]
    );
};

const resetMonthlyUsage = async (userId) => {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    await promisePool.query(
        'UPDATE transcription_usage SET usage_count = 0 WHERE user_id = ? AND month = ?',
        [userId, currentMonth]
    );
};

// ==================== COMBINED CHECKS ====================

/**
 * Check if user can transcribe based on subscription + whitelist + usage
 * Returns { allowed: boolean, reason: string, usage: number, limit: number }
 */
const canUserTranscribe = async (userId) => {
    // Check whitelist first (always allow)
    const whitelisted = await isWhitelisted(userId);
    if (whitelisted) {
        return { allowed: true, reason: 'whitelisted', usage: 0, limit: null };
    }

    // Check subscription
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
        return { allowed: false, reason: 'no_subscription', usage: 0, limit: 0 };
    }

    if (subscription.status !== 'active' && subscription.status !== 'trial') {
        return { allowed: false, reason: 'inactive_subscription', usage: 0, limit: 0 };
    }

    // Check usage vs limit (null limit = unlimited)
    const limit = subscription.transcription_limit;
    if (limit === null) {
        return { allowed: true, reason: 'unlimited_plan', usage: 0, limit: null };
    }

    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const usage = await getTranscriptionUsage(userId, currentMonth);

    if (usage >= limit) {
        return { allowed: false, reason: 'limit_exceeded', usage, limit };
    }

    return { allowed: true, reason: 'within_limit', usage, limit };
};

// ==================== ADMIN FUNCTIONS ====================

const getAllUsersWithDetails = async () => {
    const [rows] = await promisePool.query(`
        SELECT 
            u.id, u.user_id, u.name, u.email, u.domain, u.role, u.created_at, u.last_login,
            s.plan_id, s.status as subscription_status, s.cancel_at_period_end,
            p.name as plan_name, p.display_name as plan_display_name, p.price, p.transcription_limit,
            w.id as whitelist_id,
            COALESCE(tu.usage_count, 0) as usage_count
        FROM users u
        LEFT JOIN subscriptions s ON u.id = s.user_id AND (s.status = 'active' OR s.status = 'trial')
        LEFT JOIN plans p ON s.plan_id = p.id
        LEFT JOIN transcription_whitelist w ON u.id = w.user_id
        LEFT JOIN transcription_usage tu ON u.id = tu.user_id AND tu.month = DATE_FORMAT(NOW(), '%Y-%m-01')
        ORDER BY u.created_at DESC
    `);
    return rows;
};

const updateUserRole = async (userId, role) => {
    await promisePool.query('UPDATE users SET role = ? WHERE user_id = ?', [role, userId]);
};

const updateUserFeatures = async (userId, features) => {
    const { transcription_enabled, audio_upload_enabled } = features;
    const updates = [];
    const params = [];
    
    if (transcription_enabled !== undefined) {
        updates.push('transcription_enabled = ?');
        params.push(transcription_enabled ? 1 : 0);
    }
    if (audio_upload_enabled !== undefined) {
        updates.push('audio_upload_enabled = ?');
        params.push(audio_upload_enabled ? 1 : 0);
    }
    
    if (updates.length === 0) return;
    
    params.push(userId);
    await promisePool.query(`UPDATE user_features SET ${updates.join(', ')} WHERE user_id = ?`, params);
};

const getUserFeatures = async (userId) => {
    const [[features]] = await promisePool.query(
        'SELECT * FROM user_features WHERE user_id = ?',
        [userId]
    );
    return features || { transcription_enabled: true, audio_upload_enabled: true };
};

const assignPlanToUser = async (userId, planId, status = 'active') => {
    const plan = await getPlanById(planId);
    if (!plan) throw new Error('Plan not found');
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    await promisePool.query(
        `INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, status) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE plan_id = ?, start_date = ?, end_date = ?, status = ?`,
        [userId, planId, startDate, endDate, status, planId, startDate, endDate, status]
    );
};

const cancelUserSubscription = async (userId) => {
    await promisePool.query(
        'UPDATE subscriptions SET status = ?, cancel_at_period_end = TRUE WHERE user_id = ?',
        ['cancelled', userId]
    );
};

const updatePlan = async (planId, data) => {
    const updates = [];
    const params = [];
    
    if (data.display_name !== undefined) { updates.push('display_name = ?'); params.push(data.display_name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.price !== undefined) { updates.push('price = ?'); params.push(data.price); }
    if (data.transcription_limit !== undefined) { updates.push('transcription_limit = ?'); params.push(data.transcription_limit); }
    if (data.audio_upload_allowed !== undefined) { updates.push('audio_upload_allowed = ?'); params.push(data.audio_upload_allowed ? 1 : 0); }
    if (data.features !== undefined) { updates.push('features = ?'); params.push(JSON.stringify(data.features)); }
    if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }
    
    if (updates.length === 0) return;
    
    params.push(planId);
    await promisePool.query(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, params);
};

const createPlanHistory = async (planId, changes, changedBy) => {
    await promisePool.query(
        'INSERT INTO plan_history (plan_id, changes, changed_by) VALUES (?, ?, ?)',
        [planId, JSON.stringify(changes), changedBy]
    );
};

const getPlanHistory = async (planId = null) => {
    const query = planId 
        ? 'SELECT ph.*, p.display_name as plan_name FROM plan_history ph JOIN plans p ON ph.plan_id = p.id WHERE ph.plan_id = ? ORDER BY ph.created_at DESC'
        : 'SELECT ph.*, p.display_name as plan_name FROM plan_history ph JOIN plans p ON ph.plan_id = p.id ORDER BY ph.created_at DESC';
    const params = planId ? [planId] : [];
    const [rows] = await promisePool.query(query, params);
    return rows;
};

const searchUsers = async (searchTerm) => {
    const term = `%${searchTerm}%`;
    const [rows] = await promisePool.query(
        `SELECT id, user_id, name, email, domain, role, created_at, last_login 
         FROM users 
         WHERE user_id LIKE ? OR name LIKE ? OR email LIKE ? OR role LIKE ?
         ORDER BY created_at DESC`,
        [term, term, term, term]
    );
    return rows;
};

const toggleUserTranscriptionAccess = async (userId, enabled) => {
    if (enabled) {
        await removeFromWhitelist(userId);
    } else {
        await addToWhitelist(userId, 'Access disabled by admin', 'admin');
    }
};

// ==================== MANUAL PAYMENT SYSTEM ====================

const getUserWithUsage = async (userId) => {
    const [[user]] = await promisePool.query(
        `SELECT id, user_id, name, email, domain, role, plan_type, transcription_count, transcription_limit, account_status, created_at, last_login, payment_notes, plan_expires_at
         FROM users WHERE user_id = ?`,
        [userId]
    );
    return user || null;
};

const getUserWithUsageById = async (id) => {
    const [[user]] = await promisePool.query(
        `SELECT id, user_id, name, email, domain, role, plan_type, transcription_count, transcription_limit, account_status, created_at, last_login, payment_notes, plan_expires_at
         FROM users WHERE id = ?`,
        [id]
    );
    return user || null;
};

const incrementUserTranscriptionCount = async (userId) => {
    await promisePool.query(
        'UPDATE users SET transcription_count = transcription_count + 1 WHERE user_id = ?',
        [userId]
    );
};

const checkUserTranscriptionLimit = async (userId) => {
    const user = await getUserWithUsage(userId);
    if (!user) return { allowed: false, reason: 'user_not_found' };
    
    // Check account status
    if (user.account_status === 'suspended') {
        return { allowed: false, reason: 'account_suspended', user };
    }
    
    // Check limit (NULL = unlimited)
    if (user.transcription_limit === null) {
        return { allowed: true, reason: 'unlimited', user };
    }
    
    if (user.transcription_count >= user.transcription_limit) {
        return { allowed: false, reason: 'limit_exceeded', user };
    }
    
    return { allowed: true, reason: 'within_limit', user };
};

const assignUserPlan = async (userId, planType, transcriptionLimit, paymentNotes = null, expiresAt = null) => {
    const updates = ['plan_type = ?', 'transcription_limit = ?', 'account_status = ?'];
    const params = [planType, transcriptionLimit, 'active'];
    
    if (paymentNotes !== null) {
        updates.push('payment_notes = ?');
        params.push(paymentNotes);
    }
    if (expiresAt !== null) {
        updates.push('plan_expires_at = ?');
        params.push(expiresAt);
    }
    
    params.push(userId);
    await promisePool.query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);
};

const resetUserUsage = async (userId) => {
    await promisePool.query('UPDATE users SET transcription_count = 0 WHERE user_id = ?', [userId]);
};

const suspendUser = async (userId) => {
    await promisePool.query("UPDATE users SET account_status = 'suspended' WHERE user_id = ?", [userId]);
};

const activateUser = async (userId) => {
    await promisePool.query("UPDATE users SET account_status = 'active' WHERE user_id = ?", [userId]);
};

const updateUserPaymentNotes = async (userId, notes) => {
    await promisePool.query('UPDATE users SET payment_notes = ? WHERE user_id = ?', [notes, userId]);
};

const getAllUsersForAdmin = async () => {
    const [rows] = await promisePool.query(`
        SELECT 
            id, user_id, name, email, domain, role, 
            plan_type, transcription_count, transcription_limit, 
            account_status, created_at, last_login,
            payment_notes, plan_expires_at
        FROM users 
        WHERE user_id != 'admin'
        ORDER BY created_at DESC
    `);
    return rows;
};

const updateUserLimit = async (userId, limit) => {
    await promisePool.query('UPDATE users SET transcription_limit = ? WHERE user_id = ?', [limit, userId]);
};

// Mobile Sessions for Remote Microphone
const createMobileSession = async (userId) => {
    const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const [result] = await promisePool.query(
        'INSERT INTO mobile_sessions (session_code, user_id, status, expires_at) VALUES (?, ?, ?, ?)',
        [sessionCode, userId, 'waiting', expiresAt]
    );
    return { id: result.insertId, session_code: sessionCode };
};

const getMobileSessionByCode = async (sessionCode) => {
    const [[session]] = await promisePool.query(
        'SELECT * FROM mobile_sessions WHERE session_code = ? AND status != "expired" AND (expires_at IS NULL OR expires_at > NOW())',
        [sessionCode]
    );
    return session || null;
};

const updateMobileSession = async (sessionCode, data) => {
    const updates = [];
    const params = [];
    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.web_session_id !== undefined) { updates.push('web_session_id = ?'); params.push(data.web_session_id); }
    if (data.expires_at !== undefined) { updates.push('expires_at = ?'); params.push(data.expires_at); }
    if (updates.length === 0) return;
    params.push(sessionCode);
    await promisePool.query(`UPDATE mobile_sessions SET ${updates.join(', ')} WHERE session_code = ?`, params);
};

const getActiveMobileSession = async (userId) => {
    const [[session]] = await promisePool.query(
        'SELECT * FROM mobile_sessions WHERE user_id = ? AND status = "active" AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1',
        [userId]
    );
    return session || null;
};

const closeMobileSession = async (sessionCode) => {
    await promisePool.query('UPDATE mobile_sessions SET status = "closed" WHERE session_code = ?', [sessionCode]);
};

module.exports = {
    pool,
    promisePool,
    getAllPatients,
    createPatient,
    ensurePatientByName,
    getAllSessions,
    createSession,
    updateSession,
    getUserStats,
    createUser,
    verifyUser,
    getAllUsers,
    updateUserProfile,
    deleteUser,
    setResetToken,
    findUserByResetToken,
    clearResetTokenAndSetPassword,
    // Subscription & Plans
    getAllPlans,
    getPlanById,
    getPlanByName,
    createPlan,
    // Subscriptions
    getUserSubscription,
    createSubscription,
    updateSubscription,
    getSubscriptionByStripeId,
    // Whitelist
    isWhitelisted,
    addToWhitelist,
    removeFromWhitelist,
    getAllWhitelistedUsers,
    // Usage Tracking
    getTranscriptionUsage,
    incrementTranscriptionUsage,
    resetMonthlyUsage,
    // Combined Checks
    canUserTranscribe,
    // Admin Functions
    getAllUsersWithDetails,
    updateUserRole,
    updateUserFeatures,
    getUserFeatures,
    assignPlanToUser,
    cancelUserSubscription,
    updatePlan,
    createPlanHistory,
    getPlanHistory,
    searchUsers,
    toggleUserTranscriptionAccess,
    // Manual Payment System
    getUserWithUsage,
    getUserWithUsageById,
    incrementUserTranscriptionCount,
    checkUserTranscriptionLimit,
    assignUserPlan,
    resetUserUsage,
    suspendUser,
    activateUser,
    updateUserPaymentNotes,
    getAllUsersForAdmin,
    updateUserLimit,
    // Mobile Sessions
    createMobileSession,
    getMobileSessionByCode,
    updateMobileSession,
    getActiveMobileSession,
    closeMobileSession
};

