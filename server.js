require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const db = require('./database');
const crypto = require('crypto');
const aiService = require('./ai-service');
const logger = require('./middleware/logger');
const { generateToken, checkAuth, checkAdmin, checkSubscription, incrementUsage } = require('./middleware/auth');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Use the same server for both HTTP and WebSocket
server.listen(PORT, () => {
    logger.info(`\n✅ Clinvoice AI Server Running`);
    logger.info(`🚀 http://localhost:${PORT}`);
    logger.info(`🖥️  Desktop: http://localhost:${PORT}/desktop`);
    logger.info(`📱 Mobile: http://localhost:${PORT}/mobile\n`);
});

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Serve static files from desktop/dist
app.use('/desktop/assets', express.static(path.join(__dirname, 'desktop', 'dist', 'assets')));
app.use('/desktop', express.static(path.join(__dirname, 'desktop', 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Redirect root to /desktop
app.get('/', (req, res) => {
    res.redirect('/desktop');
});

// Mobile microphone web page
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'mobile.html'));
});

// SPA fallback for /desktop routes (must be after static assets)
app.get('/desktop/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'desktop', 'dist', 'index.html'));
});

// ==================== WEBSOCKET FOR MOBILE AUDIO STREAMING ====================
const mobileConnections = new Map(); // sessionCode -> { mobile: ws, web: ws, session: dbSession }
const webConnections = new Map();    // sessionCode -> ws

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionCode = url.searchParams.get('sessionCode');
    const userId = url.searchParams.get('userId');
    const type = url.searchParams.get('type'); // 'mobile' or 'web'

    console.log(`📱 WebSocket connection: type=${type}, sessionCode=${sessionCode}, userId=${userId}`);

    if (type === 'mobile') {
        // Mobile device connecting - wait for session code verification
        ws.sessionCode = sessionCode;
        ws.userId = userId;
        ws.type = 'mobile';
        
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'auth') {
                    // Mobile authenticates with session code
                    const session = await db.getMobileSessionByCode(data.sessionCode);
                    if (!session) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired session code' }));
                        ws.close();
                        return;
                    }
                    if (session.status === 'active') {
                        ws.send(JSON.stringify({ type: 'error', message: 'Session already connected' }));
                        ws.close();
                        return;
                    }
                    
                    ws.sessionCode = data.sessionCode;
                    ws.userId = session.user_id;
                    
                    // Update session status
                    await db.updateMobileSession(data.sessionCode, { status: 'active' });
                    
                    // Store connection
                    if (!mobileConnections.has(data.sessionCode)) {
                        mobileConnections.set(data.sessionCode, { mobile: null, web: null, session });
                    }
                    mobileConnections.get(data.sessionCode).mobile = ws;
                    
                    // Notify web client if exists
                    const conn = mobileConnections.get(data.sessionCode);
                    if (conn.web) {
                        conn.web.send(JSON.stringify({ type: 'mobile_connected', sessionCode: data.sessionCode }));
                    }
                    
                    ws.send(JSON.stringify({ type: 'authenticated', message: 'Connected successfully' }));
                    console.log(`✅ Mobile connected to session ${data.sessionCode}`);
                }
                else if (data.type === 'audio') {
                    // Forward audio data to web client
                    const conn = mobileConnections.get(ws.sessionCode);
                    if (conn && conn.web && conn.web.readyState === WebSocket.OPEN) {
                        conn.web.send(JSON.stringify({ 
                            type: 'audio', 
                            audio: data.audio,
                            timestamp: Date.now()
                        }));
                    }
                }
                else if (data.type === 'transcript') {
                    // Forward transcript to web client
                    const conn = mobileConnections.get(ws.sessionCode);
                    if (conn && conn.web && conn.web.readyState === WebSocket.OPEN) {
                        conn.web.send(JSON.stringify({ 
                            type: 'transcript', 
                            transcript: data.transcript,
                            isFinal: data.isFinal
                        }));
                    }
                }
                else if (data.type === 'stop') {
                    const conn = mobileConnections.get(ws.sessionCode);
                    if (conn && conn.web) {
                        conn.web.send(JSON.stringify({ type: 'mobile_stopped' }));
                    }
                    await db.closeMobileSession(ws.sessionCode);
                    mobileConnections.delete(ws.sessionCode);
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        ws.on('close', async () => {
            console.log(`📱 Mobile disconnected from session ${ws.sessionCode}`);
            const conn = mobileConnections.get(ws.sessionCode);
            if (conn) {
                conn.mobile = null;
                if (conn.web) {
                    conn.web.send(JSON.stringify({ type: 'mobile_disconnected' }));
                }
                if (!conn.mobile && !conn.web) {
                    await db.closeMobileSession(ws.sessionCode);
                    mobileConnections.delete(ws.sessionCode);
                }
            }
        });
    }
    else if (type === 'web') {
        // Web client connecting to watch session
        ws.sessionCode = sessionCode;
        ws.userId = userId;
        ws.type = 'web';

        if (sessionCode) {
            const conn = mobileConnections.get(sessionCode);
            if (conn) {
                conn.web = ws;
                ws.send(JSON.stringify({ type: 'session_info', session: conn.session }));
                
                // Notify if mobile already connected
                if (conn.mobile) {
                    ws.send(JSON.stringify({ type: 'mobile_connected', sessionCode }));
                }
            }
            webConnections.set(sessionCode, ws);
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                const conn = mobileConnections.get(ws.sessionCode);
                
                if (data.type === 'request_transcript' && conn && conn.mobile) {
                    // Web client requesting real-time transcript from mobile
                    conn.mobile.send(JSON.stringify({ type: 'request_transcript' }));
                }
            } catch (err) {
                console.error('WebSocket message error:', err);
            }
        });

        ws.on('close', () => {
            console.log(`🖥️ Web disconnected from session ${ws.sessionCode}`);
            const conn = mobileConnections.get(ws.sessionCode);
            if (conn) {
                conn.web = null;
                if (conn.mobile && conn.mobile.readyState === WebSocket.OPEN) {
                    conn.mobile.send(JSON.stringify({ type: 'web_disconnected' }));
                }
                if (!conn.mobile && !conn.web) {
                    db.closeMobileSession(ws.sessionCode);
                    mobileConnections.delete(ws.sessionCode);
                }
            }
            webConnections.delete(ws.sessionCode);
        });
    }
});

console.log('📡 WebSocket server initialized');

const upload = multer({ storage: multer.memoryStorage() });

// Simple AES-256-GCM helpers for securing transcripts at rest
function getKeyBuffer() {
    const raw = process.env.ENC_KEY || process.env.ENCRYPTION_KEY || '';
    if (!raw) {
        return Buffer.from('dev_default_key_dev_default_key__32', 'utf8').slice(0, 32);
    }
    try {
        if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
            const buf = Buffer.from(raw, 'base64');
            if (buf.length === 32) return buf;
        }
    } catch { }
    try {
        if (/^[0-9a-fA-F]+$/.test(raw)) {
            const buf = Buffer.from(raw, 'hex');
            if (buf.length === 32) return buf;
        }
    } catch { }
    return Buffer.from(raw.padEnd(32, '0'), 'utf8').slice(0, 32);
}
const ENC_KEY_BUF = getKeyBuffer();
function encryptField(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY_BUF, iv);
    let enc = cipher.update(String(text), 'utf8', 'base64');
    enc += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return `${iv.toString('base64')}:${tag}:${enc}`;
}
function decryptField(payload) {
    if (!payload) return '';
    try {
        const [ivB64, tagB64, dataB64] = String(payload).split(':');
        const iv = Buffer.from(ivB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY_BUF, iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(dataB64, 'base64', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch {
        return String(payload);
    }
}

// Save a raw transcript with an editable patient name
app.post('/api/save-transcript', async (req, res) => {
    try {
        const { userId, domain, patientName, transcription } = req.body;
        if (!userId || !domain || !patientName || !transcription) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const patientId = await db.ensurePatientByName({ name: patientName, domain, user_id: userId });
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
        await db.updateSession(session.id, { transcription: encryptField(transcription), status: 'transcript_only' });
        res.status(201).json({ sessionId: session.id, patientId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Secure save transcript with patient name and dentist name, with salting/hashing
app.post('/api/save-transcript-secure', async (req, res) => {
    try {
        const { userId, domain, patientName, dentistName, transcription, aiSummary } = req.body;
        if (!userId || !domain || !patientName || !dentistName || !transcription) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate unique salt for this record
        const salt = crypto.randomBytes(16).toString('hex');

        // Create hash of the combined data for integrity verification
        const dataToHash = `${patientName}:${dentistName}:${transcription}:${Date.now()}`;
        const hash = crypto.createHmac('sha256', salt + process.env.ENC_KEY || 'default_key')
            .update(dataToHash)
            .digest('hex');

        // Encrypt the data
        const encryptedTranscription = encryptField(transcription);
        const encryptedAiSummary = aiSummary ? encryptField(JSON.stringify(aiSummary)) : null;

        // Store with patient and dentist info
        const patientId = await db.ensurePatientByName({ name: patientName, domain, user_id: userId });
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });

        // Update with encrypted data and metadata
        await db.updateSession(session.id, {
            transcription: encryptedTranscription,
            ai_notes: encryptedAiSummary,
            status: 'finalized',
            tooth_number: req.body.toothNumber || null,
            metadata: JSON.stringify({
                salt,
                hash,
                dentistName,
                patientName,
                savedAt: new Date().toISOString()
            })
        });

        res.status(201).json({
            sessionId: session.id,
            patientId,
            message: 'Transcript saved securely with encryption'
        });
    } catch (error) {
        console.error('Secure save error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Upload voice note (audio/webm) and return a URL
app.post('/api/upload-voice', upload.single('voice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file' });
        const fs = require('fs');
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
        const fname = `voice_${Date.now()}.webm`;
        const fpath = path.join(uploadsDir, fname);
        await fs.promises.writeFile(fpath, req.file.buffer);
        const url = `/uploads/${fname}`;
        res.status(201).json({ url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Create a new session and store the note + transcription (and optional audio)
app.post('/api/sessions', async (req, res) => {
    try {
        const { userId, patientId, domain, transcription, aiNote } = req.body;
        if (!userId || !patientId || !domain) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const session = await db.createSession({ user_id: userId, patient_id: patientId, domain });
        const audioUrl = aiNote && (aiNote.audio_url || aiNote.audio_file) ? (aiNote.audio_url || aiNote.audio_file) : null;
        const payload = {
            transcription: encryptField(transcription || ''),
            ai_notes: JSON.stringify(aiNote || {}),
            status: 'finalized',
            audio_url: audioUrl || undefined
        };
        await db.updateSession(session.id, payload);
        res.status(201).json({ id: session.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// -------------------- Auth Routes --------------------
app.post('/api/register', async (req, res) => {
    try {
        const { userId, password, domain = 'dental', name = null, email = null } = req.body;
        if (!userId || !password) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        await db.createUser({ user_id: userId, password, domain, name, email });
        res.status(201).json({ message: 'User registered' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'User already exists' });
        }
        console.error('Registration failed:', err);
        res.status(500).json({ error: `Registration failed: ${err.message || 'Unknown error'}` });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        const user = await db.verifyUser({ user_id: userId, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        // Generate JWT token
        const token = generateToken(user);

        // Update last login
        try { await db.promisePool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [userId]); } catch { }

        // Return token and user info
        res.json({
            message: 'Login successful',
            token,
            user: {
                userId: user.user_id,
                domain: user.domain,
                role: user.role || 'clinician',
                name: user.name,
                email: user.email
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});
// -----------------------------------------------------

// ==================== MOBILE MICROPHONE APIs ====================

// Create a new mobile session (generates session code)
app.post('/api/mobile/session', checkAuth, async (req, res) => {
    try {
        // Check user can transcribe
        const canTranscribe = await db.checkUserTranscriptionLimit(req.user.userId);
        if (!canTranscribe.allowed) {
            return res.status(403).json({ 
                error: canTranscribe.reason === 'limit_exceeded' ? 'Transcription limit reached' : 'Account suspended',
                reason: canTranscribe.reason,
                usage: canTranscribe.user?.transcription_count || 0,
                limit: canTranscribe.user?.transcription_limit || 0
            });
        }

        const session = await db.createMobileSession(req.user.userId);
        
        res.json({
            sessionCode: session.session_code,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            wsUrl: `ws://localhost:${PORT}`
        });
    } catch (error) {
        console.error('Error creating mobile session:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Get mobile session status
app.get('/api/mobile/session/:code', checkAuth, async (req, res) => {
    try {
        const session = await db.getMobileSessionByCode(req.params.code);
        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }
        
        if (session.user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json({
            sessionCode: session.session_code,
            status: session.status,
            inputSource: session.input_source,
            createdAt: session.created_at,
            expiresAt: session.expires_at
        });
    } catch (error) {
        console.error('Error getting mobile session:', error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

// Close mobile session
app.post('/api/mobile/session/:code/close', checkAuth, async (req, res) => {
    try {
        const session = await db.getMobileSessionByCode(req.params.code);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await db.closeMobileSession(req.params.code);
        
        // Notify WebSocket clients
        const conn = mobileConnections.get(req.params.code);
        if (conn) {
            if (conn.mobile) conn.mobile.send(JSON.stringify({ type: 'session_closed' }));
            if (conn.web) conn.web.send(JSON.stringify({ type: 'mobile_disconnected' }));
            mobileConnections.delete(req.params.code);
        }

        res.json({ message: 'Session closed' });
    } catch (error) {
        console.error('Error closing mobile session:', error);
        res.status(500).json({ error: 'Failed to close session' });
    }
});

// Get active mobile session for user
app.get('/api/mobile/active', checkAuth, async (req, res) => {
    try {
        const session = await db.getActiveMobileSession(req.user.userId);
        if (!session) {
            return res.json({ active: false });
        }
        res.json({
            active: true,
            sessionCode: session.session_code,
            status: session.status,
            createdAt: session.created_at
        });
    } catch (error) {
        console.error('Error getting active mobile session:', error);
        res.status(500).json({ error: 'Failed to get active session' });
    }
});

// ==================== API ENDPOINTS ====================
app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: Date.now() }));

app.post('/api/test-gemini', async (req, res) => {
    try {
        console.log('🧪 /api/test-gemini AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        const testTranscription = 'Patient presents with fever and cough for 3 days. Temperature is 101.5F. Chest X-ray shows mild pneumonia. Prescribed amoxicillin.';
        const note = await aiService.generateMedicalNote(testTranscription, 'medical');
        console.log('🧪 /api/test-gemini result keys:', Object.keys(note));
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Dental test endpoint
app.post('/api/test-gemini-dental', async (req, res) => {
    try {
        console.log('🧪 /api/test-gemini-dental AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        const testTranscription = 'Patient John reports sensitivity in the lower right molar and bleeding gums during brushing. Last dental visit was a while ago. Patient is nervous about this appointment.';
        const note = await aiService.generateMedicalNote(testTranscription, 'dental');
        console.log('🧪 /api/test-gemini-dental result keys:', Object.keys(note));
        res.json({ success: true, note });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        const transcription = await aiService.transcribeAudio(req.file.buffer);
        res.json(transcription);
    } catch (error) {
        res.status(500).json({ error: 'Transcription failed' });
    }
});

app.post('/api/generate-note', checkAuth, checkSubscription, async (req, res) => {
    try {
        const { transcription, patientId, domain, userId } = req.body;

        if (!transcription || transcription.trim().length === 0) {
            return res.status(400).json({ error: 'Transcription is empty' });
        }

        console.log(`\n📝 Generating note for domain: ${domain}`);
        console.log('🔧 AI_PROVIDER=', process.env.AI_PROVIDER, 'OPENAI_MODEL=', process.env.OPENAI_MODEL);
        console.log(`📄 Transcription length: ${transcription.length} chars`);

        const aiNote = await aiService.generateMedicalNote(transcription, domain);

        console.log(`✅ Note generated successfully`);
        console.log(`📊 Note keys:`, Object.keys(aiNote));

        // Increment usage count after successful generation
        try {
            await db.incrementTranscriptionUsage(req.user.id);
            console.log(`📈 Usage incremented for user ${req.user.userId}`);
        } catch (usageErr) {
            console.error(`⚠️  Usage increment failed:`, usageErr);
            // Don't fail the request if usage increment fails
        }

        if (patientId && userId) {
            const session = await db.createSession({ user_id: req.user.id, patient_id: patientId, domain });
            aiNote.sessionId = session.id;
            await db.updateSession(session.id, { transcription: encryptField(transcription), ai_notes: JSON.stringify(aiNote), status: 'draft' });
            console.log(`💾 Session saved with ID: ${session.id}`);
        }

        res.json(aiNote);
    } catch (error) {
        console.error(`❌ Note generation error:`, error.message || error);
        res.status(500).json({ error: error.message || 'Note generation failed' });
    }
});

app.get('/api/stats/:userId', async (req, res) => {
    try {
        const rawStats = await db.getUserStats(req.params.userId);

        // Map database stats to the property names expected by the front-end
        const formattedStats = {
            todayEncounters: rawStats.sessionsToday,
            activePatients: rawStats.totalPatients,
            aiNotesGenerated: rawStats.aiNotesGenerated,
            timeSaved: Math.floor(rawStats.totalSessions * 5 / 60)
        };

        res.json(formattedStats);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/patients', async (req, res) => {
    try {
        const patients = await db.getAllPatients(req.query.userId);
        res.json(patients);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Return sessions for a specific patient (for the requesting user), with decrypted transcripts
app.get('/api/patients/:patientId/sessions', async (req, res) => {
    try {
        const { patientId } = req.params;
        const { userId } = req.query;
        if (!userId || !patientId) return res.status(400).json({ error: 'Missing userId or patientId' });
        const [rows] = await db.promisePool.query(
            'SELECT id, user_id, patient_id, domain, transcription, status, created_at FROM sessions WHERE user_id = ? AND patient_id = ? ORDER BY created_at DESC',
            [userId, patientId]
        );
        const sessions = rows.map(r => ({
            id: r.id,
            patient_id: r.patient_id,
            status: r.status,
            created_at: r.created_at,
            transcription: decryptField(r.transcription)
        }));
        res.json(sessions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/patients', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        const result = await db.createPatient(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await db.getAllSessions(req.query.userId);
        // Decrypt the encrypted fields before returning
        const decryptedSessions = sessions.map(session => ({
            ...session,
            transcription: session.transcription ? decryptField(session.transcription) : null,
            ai_notes: session.ai_notes ? decryptField(session.ai_notes) : null
        }));
        res.json(decryptedSessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/sessions/:id', async (req, res) => {
    try {
        await db.updateSession(req.params.id, req.body);
        res.json({ message: 'Session updated' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// ----- Admin & Password Reset APIs -----
function assertAdmin(req, res) {
    const adminId = req.headers['x-admin-id'] || req.query.adminId || (req.body && req.body.adminId);
    if (adminId !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return false;
    }
    return true;
}

app.get('/api/admin/users', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const rows = await db.getAllUsers();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/admin/users/:userId', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        await db.updateUserProfile(req.params.userId, req.body);
        res.json({ message: 'User updated' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/admin/users/:userId', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        await db.deleteUser(req.params.userId);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin: Get whitelist
app.get('/api/admin/whitelist', checkAuth, checkAdmin, async (req, res) => {
    try {
        const whitelist = await db.getAllWhitelistedUsers();
        res.json(whitelist);
    } catch (error) {
        console.error('Error fetching whitelist:', error);
        res.status(500).json({ error: 'Failed to fetch whitelist' });
    }
});

// Admin: Add user to whitelist
app.post('/api/admin/whitelist', checkAuth, checkAdmin, async (req, res) => {
    try {
        const { userId, reason } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        await db.addToWhitelist(userId, reason || 'Admin granted', req.user.id);
        res.json({ message: 'User added to whitelist' });
    } catch (error) {
        console.error('Error adding to whitelist:', error);
        res.status(500).json({ error: 'Failed to add to whitelist' });
    }
});

// Admin: Remove user from whitelist
app.delete('/api/admin/whitelist/:userId', checkAuth, checkAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        await db.removeFromWhitelist(userId);
        res.json({ message: 'User removed from whitelist' });
    } catch (error) {
        console.error('Error removing from whitelist:', error);
        res.status(500).json({ error: 'Failed to remove from whitelist' });
    }
});

app.post('/api/request-password-reset', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const token = crypto.randomBytes(24).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60);
        await db.setResetToken(userId, token, expires);
        res.json({ message: 'Reset requested', token });
    } catch (error) {
        res.status(500).json({ error: 'Failed to request reset' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: 'Missing fields' });
        const user = await db.findUserByResetToken(token);
        if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
        await db.clearResetTokenAndSetPassword(user.user_id, newPassword);
        res.json({ message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

// ==================== SUBSCRIPTION & STRIPE ENDPOINTS ====================
const stripeService = require('./middleware/stripe');

// Get all available plans
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await db.getAllPlans();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

// Get current user's subscription status (requires auth)
app.get('/api/subscription-status', checkAuth, async (req, res) => {
    try {
        const subscription = await db.getUserSubscription(req.user.id);
        if (!subscription) {
            return res.json({ subscribed: false, plan: null });
        }

        // Get current usage
        const usage = await db.getTranscriptionUsage(req.user.id);
        const isWhitelisted = await db.isWhitelisted(req.user.id);

        res.json({
            subscribed: true,
            subscription: {
                id: subscription.id,
                plan_name: subscription.plan_name,
                display_name: subscription.display_name,
                price: subscription.price,
                status: subscription.status,
                transcription_limit: subscription.transcription_limit,
                usage,
                whitelisted: isWhitelisted,
                cancel_at_period_end: subscription.cancel_at_period_end
            }
        });
    } catch (error) {
        console.error('Subscription status error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
});

// Create Stripe checkout session
app.post('/api/create-checkout-session', checkAuth, async (req, res) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(503).json({ error: 'Stripe not configured. Please add STRIPE_SECRET_KEY to environment variables.' });
        }

        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ error: 'Plan ID required' });
        }

        const baseUrl = process.env.NODE_ENV === 'production'
            ? process.env.BASE_URL
            : `http://localhost:${PORT}`;

        const session = await stripeService.createCheckoutSession({
            userId: req.user.id,
            planId,
            successUrl: `${baseUrl}/desktop/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${baseUrl}/desktop/pricing`
        });

        res.json(session);
    } catch (error) {
        console.error('Checkout session error:', error);
        res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
});

// Stripe webhook endpoint
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(503).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];

    try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        await stripeService.handleWebhookEvent(event);
        res.json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// Cancel subscription
app.post('/api/cancel-subscription', checkAuth, async (req, res) => {
    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(503).json({ error: 'Stripe not configured' });
        }

        const subscription = await db.getUserSubscription(req.user.id);
        if (!subscription) {
            return res.status(404).json({ error: 'No active subscription found' });
        }

        await stripeService.cancelSubscription(subscription.id);
        res.json({ message: 'Subscription will be cancelled at the end of the billing period' });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// ==================== ADMIN PORTAL ENDPOINTS ====================

// Get all users with subscription details
app.get('/api/admin/users/details', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const users = await db.getAllUsersWithDetails();
        res.json(users);
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Search users
app.get('/api/admin/users/search', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const { q } = req.query;
        if (!q) return res.json([]);
        const users = await db.searchUsers(q);
        res.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update user role
app.put('/api/admin/users/:userId/role', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const { role } = req.body;
        if (!role || !['admin', 'clinician', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        await db.updateUserRole(req.params.userId, role);
        res.json({ message: 'Role updated' });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Toggle user transcription access
app.put('/api/admin/users/:userId/transcription-access', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const { enabled } = req.body;
        await db.toggleUserTranscriptionAccess(req.params.userId, enabled);
        res.json({ message: enabled ? 'Transcription access enabled' : 'Transcription access disabled' });
    } catch (error) {
        console.error('Error toggling transcription access:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Assign plan to user
app.post('/api/admin/users/:userId/assign-plan', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const { planId, status } = req.body;
        await db.assignPlanToUser(req.params.userId, planId, status || 'active');
        res.json({ message: 'Plan assigned successfully' });
    } catch (error) {
        console.error('Error assigning plan:', error);
        res.status(500).json({ error: error.message || 'Database error' });
    }
});

// Cancel user subscription (admin)
app.post('/api/admin/users/:userId/cancel-subscription', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        await db.cancelUserSubscription(req.params.userId);
        res.json({ message: 'Subscription cancelled' });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==================== PLAN MANAGEMENT ====================

// Get all plans (including inactive for admin)
app.get('/api/admin/plans', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const [rows] = await db.promisePool.query('SELECT * FROM plans ORDER BY price ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create new plan
app.post('/api/admin/plans', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const { name, display_name, description, price, billing_period, transcription_limit, audio_upload_allowed, features } = req.body;
        const plan = await db.createPlan({ name, display_name, description, price, billing_period, transcription_limit, audio_upload_allowed, features });
        await db.createPlanHistory(plan.id, { action: 'created', ...req.body }, 'admin');
        res.status(201).json({ id: plan.id, message: 'Plan created' });
    } catch (error) {
        console.error('Error creating plan:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update plan
app.put('/api/admin/plans/:planId', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        await db.updatePlan(req.params.planId, req.body);
        await db.createPlanHistory(req.params.planId, req.body, 'admin');
        res.json({ message: 'Plan updated' });
    } catch (error) {
        console.error('Error updating plan:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get plan history
app.get('/api/admin/plans/:planId/history', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const history = await db.getPlanHistory(req.params.planId);
        res.json(history);
    } catch (error) {
        console.error('Error fetching plan history:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get all plan history
app.get('/api/admin/plans/history', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const history = await db.getPlanHistory();
        res.json(history);
    } catch (error) {
        console.error('Error fetching plan history:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==================== ANALYTICS ====================

app.get('/api/admin/analytics', async (req, res) => {
    if (!assertAdmin(req, res)) return;
    try {
        const [[userCount]] = await db.promisePool.query('SELECT COUNT(*) as count FROM users');
        const [[sessionCount]] = await db.promisePool.query('SELECT COUNT(*) as count FROM sessions');
        const [[patientCount]] = await db.promisePool.query('SELECT COUNT(*) as count FROM patients');
        const [[whitelistCount]] = await db.promisePool.query('SELECT COUNT(*) as count FROM transcription_whitelist');
        const [[activeSubs]] = await db.promisePool.query("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'");
        
        const [planDistribution] = await db.promisePool.query(`
            SELECT p.display_name, COUNT(s.id) as count 
            FROM plans p 
            LEFT JOIN subscriptions s ON p.id = s.plan_id AND s.status = 'active'
            GROUP BY p.id
        `);
        
        res.json({
            totalUsers: userCount.count,
            totalSessions: sessionCount.count,
            totalPatients: patientCount.count,
            whitelistedUsers: whitelistCount.count,
            activeSubscriptions: activeSubs.count,
            planDistribution
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

