// API Utility for Authenticated Requests
const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Get JWT token from localStorage
 */
export function getToken() {
    return localStorage.getItem('clinivoice_token');
}

/**
 * Save JWT token to localStorage
 */
export function setToken(token) {
    localStorage.setItem('clinivoice_token', token);
}

/**
 * Remove JWT token from localStorage
 */
export function clearToken() {
    localStorage.removeItem('clinivoice_token');
}

/**
 * Get user data from localStorage
 */
export function getUser() {
    const userStr = localStorage.getItem('clinivoice_user');
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * Save user data to localStorage
 */
export function setUser(user) {
    localStorage.setItem('clinivoice_user', JSON.stringify(user));
}

/**
 * Clear user data from localStorage
 */
export function clearUser() {
    localStorage.removeItem('clinivoice_user');
}

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/generate-note')
 * @param {Object} options - Fetch options
 * @returns {Promise} Response data
 */
export async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Add Authorization header if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, config);

        // Handle 401 Unauthorized (token expired or invalid)
        if (response.status === 401) {
            clearToken();
            clearUser();
            window.location.reload(); // Force re-login
            throw new Error('Session expired. Please login again.');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API Error: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

/**
 * Login user and store token
 */
export async function login(userId, password) {
    const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ userId, password })
    });

    if (data.token) {
        setToken(data.token);
        setUser(data.user);
    }

    return data;
}

/**
 * Register new user
 */
export async function register(userId, password, domain, name = null, email = null) {
    return await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ userId, password, domain, name, email })
    });
}

/**
 * Generate AI note (requires auth)
 */
export async function generateNote(transcription, domain, patientId = null, userId = null) {
    return await apiRequest('/generate-note', {
        method: 'POST',
        body: JSON.stringify({ transcription, domain, patientId, userId })
    });
}

/**
 * Get subscription status (requires auth)
 */
export async function getSubscriptionStatus() {
    return await apiRequest('/subscription-status', {
        method: 'GET'
    });
}

/**
 * Get available plans
 */
export async function getPlans() {
    return await apiRequest('/plans', {
        method: 'GET'
    });
}

/**
 * Create Stripe checkout session (requires auth)
 */
export async function createCheckoutSession(planId) {
    return await apiRequest('/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ planId })
    });
}

/**
 * Get user stats (requires auth)
 */
export async function getUserStats(userId) {
    return await apiRequest(`/stats/${userId}`, {
        method: 'GET'
    });
}

/**
 * Get all patients (requires auth)
 */
export async function getPatients(userId) {
    return await apiRequest(`/patients?userId=${userId}`, {
        method: 'GET'
    });
}

/**
 * Get all sessions (requires auth)
 */
export async function getSessions(userId) {
    return await apiRequest(`/sessions?userId=${userId}`, {
        method: 'GET'
    });
}

export default {
    login,
    register,
    generateNote,
    getSubscriptionStatus,
    getPlans,
    createCheckoutSession,
    getUserStats,
    getPatients,
    getSessions,
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    clearUser
};
