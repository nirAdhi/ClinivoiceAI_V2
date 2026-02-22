import './About.css'

function About() {
    return (
    <div className="about-page">
      <div className="about-header">
        <h1>About Clinvoice AI</h1>
        <p className="about-tagline">Revolutionizing Clinical Documentation with AI</p>
      </div>

      <div className="about-content">
        <section className="about-section hero-section">
          <div className="section-icon">🎯</div>
          <h2>Our Mission</h2>
          <p>
            Clinivoice AI was created to solve one of the biggest pain points in healthcare: 
            <strong> time-consuming clinical documentation</strong>. We believe that healthcare professionals 
            should spend more time with patients and less time on paperwork.
          </p>
          <p className="highlight">
            Our AI-powered platform reduces documentation time by up to <strong>70%</strong>, 
            allowing clinicians to focus on what matters most: patient care.
          </p>
        </section>

        <section className="about-section">
          <div className="section-icon">✨</div>
          <h2>How It Works</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-number">1</div>
              <h3>🎤 Voice Dictation</h3>
              <p>Simply speak your clinical notes naturally, as if you're talking to a colleague.</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">2</div>
              <h3>🤖 AI Processing</h3>
              <p>Our advanced AI (powered by Google Gemini) analyzes and structures your notes.</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">3</div>
              <h3>📝 Structured Notes</h3>
              <p>Receive properly formatted SOAP notes ready for your EMR system.</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">4</div>
              <h3>💾 Secure Storage</h3>
              <p>All notes are encrypted and stored securely, HIPAA-compliant.</p>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="section-icon">🦷</div>
          <h2>Specialized for Your Practice</h2>
          <div className="specialties">
            <div className="specialty-card">
              <span className="specialty-icon">🦷</span>
              <h3>Dental</h3>
              <p>Comprehensive dental note templates including intraoral exams, procedures, and treatment plans.</p>
            </div>
            <div className="specialty-card">
              <span className="specialty-icon">🏥</span>
              <h3>Medical</h3>
              <p>Full SOAP note support for general practice, urgent care, and specialty consultations.</p>
            </div>
          </div>
        </section>

        <section className="about-section stats-section">
          <div className="section-icon">📊</div>
          <h2>By the Numbers</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">70%</div>
              <div className="stat-label">Time Saved</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">95%</div>
              <div className="stat-label">Accuracy Rate</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">1000+</div>
              <div className="stat-label">Happy Clinicians</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">50K+</div>
              <div className="stat-label">Notes Generated</div>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="section-icon">🔒</div>
          <h2>Security & Compliance</h2>
          <div className="security-features">
            <div className="security-item">
              <span>✓</span>
              <div>
                <strong>HIPAA Compliant</strong>
                <p>All data handling meets HIPAA security and privacy requirements</p>
              </div>
            </div>
            <div className="security-item">
              <span>✓</span>
              <div>
                <strong>End-to-End Encryption</strong>
                <p>Your patient data is encrypted both in transit and at rest</p>
              </div>
            </div>
            <div className="security-item">
              <span>✓</span>
              <div>
                <strong>SOC 2 Certified</strong>
                <p>Regular security audits and compliance verification</p>
              </div>
            </div>
            <div className="security-item">
              <span>✓</span>
              <div>
                <strong>Data Privacy</strong>
                <p>We never share or sell your data. Your notes belong to you.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="about-section team-section">
          <div className="section-icon">👥</div>
          <h2>Our Team</h2>
          <p>
            Built by healthcare professionals and AI engineers who understand the challenges 
            of clinical documentation. Our team combines expertise in medicine, dentistry, 
            and cutting-edge artificial intelligence.
          </p>
        </section>

        <section className="about-section cta-section">
          <h2>Ready to Transform Your Practice?</h2>
          <p>Join thousands of clinicians who have already saved countless hours with Clinvoice AI.</p>
        </section>

        <footer className="about-footer">
          <p>© 2026 Clinivoice AI. All rights reserved.</p>
          <div className="footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact Us</a>
          </div>
        </footer>
      </div >
    </div >
  )
}

export default About
