// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'clinivoice-dev-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Generate JWT token for authenticated user
 * @param {Object} user - User object from database
 * @returns {string} JWT token
 */
function generateToken(user) {
    const payload = {
        userId: user.user_id,
        id: user.id,
        role: user.role || 'clinician',
        domain: user.domain
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Middleware to verify JWT token and attach user to request
 * Usage: app.get('/api/protected', checkAuth, (req, res) => { ... })
 */
function checkAuth(req, res, next) {
    try {
        // Get token from Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Attach user info to request
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

/**
 * Middleware to check if user is admin
 * MUST be used after checkAuth
 * Usage: app.delete('/api/admin/users/:id', checkAuth, checkAdmin, (req, res) => { ... })
 */
function checkAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

/**
 * Middleware to check if user has active subscription
 * MUST be used after checkAuth
 * Usage: app.post('/api/generate-note', checkAuth, checkSubscription, (req, res) => { ... })
 */
async function checkSubscription(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        console.log('checkSubscription - user:', req.user);
        console.log('checkSubscription - role:', req.user.role);

        // Admins bypass subscription check
        if (req.user.role === 'admin') {
            console.log('Admin user detected, bypassing subscription check');
            return next();
        }

        const db = require('../database');

        // Check if user can transcribe (handles whitelist + subscription + usage)
        const check = await db.canUserTranscribe(req.user.id);

        if (!check.allowed) {
            const messages = {
                'no_subscription': 'No active subscription found. Please subscribe to continue.',
                'inactive_subscription': 'Your subscription is not active. Please renew or contact support.',
                'limit_exceeded': `You have reached your monthly transcription limit (${check.limit}). Upgrade your plan or wait for next month.`,
                'trial_expired': 'Your free trial (10 uses) has expired. Please subscribe to continue.',
                'subscription_expired': 'Your subscription has expired. Please renew to continue.',
                'locked': 'Your account has been locked. Please contact admin for assistance.'
            };

            return res.status(403).json({
                error: messages[check.reason] || 'Subscription required',
                reason: check.reason,
                usage: check.usage,
                limit: check.limit
            });
        }

        // Attach subscription info to request for tracking
        req.subscription = check;
        next();
    } catch (error) {
        logger.error('Subscription check error:', error);
        return res.status(500).json({ error: 'Failed to verify subscription' });
    }
}

/**
 * Optional middleware to increment usage count after successful transcription
 * Call this AFTER the transcription is successful
 */
async function incrementUsage(req, res, next) {
    try {
        if (req.user && req.user.id) {
            const db = require('../database');
            await db.incrementTranscriptionUsage(req.user.id);
        }
        next();
    } catch (error) {
        logger.error('Usage increment error:', error);
        next();
    }
}

module.exports = {
    generateToken,
    checkAuth,
    checkAdmin,
    checkSubscription,
    incrementUsage
};
