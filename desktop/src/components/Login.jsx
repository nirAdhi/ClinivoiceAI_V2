import { useState } from 'react'
import './Login.css'

function Login({ onLogin, theme, onToggleTheme }) {
    const [mode, setMode] = useState('login')
    const [userId, setUserId] = useState('')
    const [password, setPassword] = useState('')
    const [domain, setDomain] = useState('')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [resetToken, setResetToken] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(false)

    const [captchaQ, setCaptchaQ] = useState(() => {
        const a = Math.floor(Math.random() * 10) + 1
        const b = Math.floor(Math.random() * 10) + 1
        return { text: `${a} + ${b}`, answer: a + b }
    })
    const [captchaInput, setCaptchaInput] = useState('')
    const [authError, setAuthError] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [showRegPass, setShowRegPass] = useState(false)
    const [showResetPass, setShowResetPass] = useState(false)

    const getPasswordStrength = (pwd) => {
        if (!pwd) return { score: 0, label: '', color: '#e2e8f0' }
        let score = 0
        if (pwd.length >= 8) score++
        if (pwd.length >= 12) score++
        if (/[A-Z]/.test(pwd)) score++
        if (/[a-z]/.test(pwd)) score++
        if (/[0-9]/.test(pwd)) score++
        if (/[^A-Za-z0-9]/.test(pwd)) score++
        if (score <= 2) return { score, label: 'Weak', color: '#ef4444' }
        if (score <= 4) return { score, label: 'Fair', color: '#f59e0b' }
        return { score, label: 'Strong', color: '#10b981' }
    }
    const passwordStrength = getPasswordStrength(password)

    const regenCaptcha = () => {
        const a = Math.floor(Math.random() * 10) + 1
        const b = Math.floor(Math.random() * 10) + 1
        setCaptchaQ({ text: `${a} + ${b}`, answer: a + b })
        setCaptchaInput('')
    }

    const submitLogin = async (e) => {
        e.preventDefault()
        setAuthError('')
        if (parseInt(captchaInput, 10) !== captchaQ.answer) { setAuthError('Captcha incorrect'); regenCaptcha(); return }
        try {
            const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password }) })
            let data = {}
            try { data = await res.json() } catch { data = {} }
            if (!res.ok) throw new Error(data.error || 'Invalid credentials')

            if (data.token) {
                localStorage.setItem('clinivoice_token', data.token)
                localStorage.setItem('clinivoice_user', JSON.stringify(data.user))
            }

            const { domain: userDomain } = data.user || data
            onLogin(userId, userDomain)
        } catch (err) { setAuthError(err.message || 'Login failed') }
    }

    const submitRegister = async (e) => {
        e.preventDefault()
        try {
            setAuthError('')
            const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password, domain: domain || 'dental', name, email }) })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error((data && data.error) || (res.status === 409 ? 'User already exists' : 'Registration failed'))
            setMode('login')
        } catch (err) { setAuthError(err.message || 'Registration failed') }
    }

    const submitForgot = async (e) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
            let data = {}
            try { data = await res.json() } catch { data = {} }
            if (!res.ok) throw new Error(data.error || 'Failed')
            setResetToken(data.token)
            setMode('reset')
        } catch (err) { alert(err.message || 'Failed') }
    }

    const submitReset = async (e) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, newPassword }) })
            let data = {}
            try { data = await res.json() } catch { data = {} }
            if (!res.ok) throw new Error(data.error || 'Reset failed')
            setMode('login')
        } catch (err) { setAuthError(err.message || 'Failed') }
    }

    return (
        <div className="login-container" data-theme={theme}>
            <button className="theme-toggle-btn" onClick={onToggleTheme} type="button" title="Toggle theme">
                {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <div className="login-card">
                {/* Logo Section */}
                <div className="login-logo-section">
                    <div className="login-logo">
                        <img 
                            src="/desktop/clinivoice-logo.png" 
                            alt="Clinvoice AI" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.innerHTML = '<span class="logo-emoji">🧠</span>' }}
                        />
                    </div>
                    <h1 className="login-brand-name">Clinvoice AI</h1>
                    <p className="login-brand-tagline">AI-Powered Clinical Documentation</p>
                </div>

                {mode === 'login' && (
                    <>
                        <div className="login-header-text">
                            <h2>Welcome Back</h2>
                            <p>Sign in to continue</p>
                        </div>

                        <form onSubmit={submitLogin}>
                            <div className="form-group">
                                <label className="form-label">Username or Email</label>
                                <input 
                                    type="text" 
                                    placeholder="you@clinic.com" 
                                    value={userId} 
                                    onChange={(e) => setUserId(e.target.value)} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <div className="input-wrap">
                                    <input 
                                        type={showPass ? 'text' : 'password'} 
                                        placeholder="••••••••" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        required 
                                    />
                                    <span className="input-icon-right" onClick={() => setShowPass(!showPass)}>
                                        {showPass ? '🙈' : '👁️'}
                                    </span>
                                </div>
                                {password && (
                                    <div className="password-strength">
                                        <div className="strength-bar">
                                            <div className="strength-fill" style={{ width: `${(passwordStrength.score / 6) * 100}%`, background: passwordStrength.color }}></div>
                                        </div>
                                        <span className="strength-label" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                                    </div>
                                )}
                            </div>

                            <div className="captcha-row">
                                <div className="captcha-badge">{captchaQ.text}</div>
                                <button type="button" className="captcha-refresh" onClick={regenCaptcha}>↻</button>
                                <input 
                                    type="number" 
                                    className="captcha-input" 
                                    placeholder="?" 
                                    value={captchaInput} 
                                    onChange={(e) => setCaptchaInput(e.target.value)} 
                                    required 
                                />
                            </div>

                            <div className="form-row">
                                <label className="remember-me">
                                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                                    <span>Remember me</span>
                                </label>
                                <span className="forgot-link" onClick={() => setMode('forgot')}>Forgot password?</span>
                            </div>

                            {authError && <div className="auth-error">{authError}</div>}

                            <button type="submit" className="btn-signin">Sign In</button>
                        </form>

                        <div className="login-footer">
                            <p>Don't have an account? <span className="link" onClick={() => setMode('register')}>Register</span></p>
                        </div>
                    </>
                )}

                {mode === 'register' && (
                    <>
                        <div className="login-header-text">
                            <h2>Create Account</h2>
                            <p>Join Clinvoice AI today</p>
                        </div>

                        <form onSubmit={submitRegister}>
                            <div className="form-row-2">
                                <div className="form-group">
                                    <label className="form-label">Name</label>
                                    <input type="text" placeholder="Dr. Smith" value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input type="email" placeholder="you@clinic.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <input type="text" placeholder="drsmith" value={userId} onChange={(e) => setUserId(e.target.value)} required />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Domain</label>
                                <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                                    <option value="dental">Dental</option>
                                    <option value="medical">Medical</option>
                                    <option value="veterinary">Veterinary</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <div className="input-wrap">
                                    <input type={showRegPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                    <span className="input-icon-right" onClick={() => setShowRegPass(!showRegPass)}>
                                        {showRegPass ? '🙈' : '👁️'}
                                    </span>
                                </div>
                            </div>

                            {authError && <div className="auth-error">{authError}</div>}

                            <button type="submit" className="btn-signin">Create Account</button>
                        </form>

                        <div className="login-footer">
                            <p>Already have an account? <span className="link" onClick={() => setMode('login')}>Sign in</span></p>
                        </div>
                    </>
                )}

                {mode === 'forgot' && (
                    <>
                        <div className="login-header-text">
                            <h2>Reset Password</h2>
                            <p>Enter your username to receive a reset link</p>
                        </div>

                        <form onSubmit={submitForgot}>
                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <input type="text" placeholder="drsmith" value={userId} onChange={(e) => setUserId(e.target.value)} required />
                            </div>

                            <button type="submit" className="btn-signin">Send Reset Link</button>
                        </form>

                        <div className="login-footer">
                            <span className="link" onClick={() => setMode('login')}>← Back to login</span>
                        </div>
                    </>
                )}

                {mode === 'reset' && (
                    <>
                        <div className="login-header-text">
                            <h2>Set New Password</h2>
                            <p>Enter your new password</p>
                        </div>

                        <form onSubmit={submitReset}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <div className="input-wrap">
                                    <input type={showResetPass ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                                    <span className="input-icon-right" onClick={() => setShowResetPass(!showResetPass)}>
                                        {showResetPass ? '🙈' : '👁️'}
                                    </span>
                                </div>
                            </div>

                            {authError && <div className="auth-error">{authError}</div>}

                            <button type="submit" className="btn-signin">Reset Password</button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}

export default Login
