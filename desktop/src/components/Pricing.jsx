import { useState, useEffect } from 'react'
import './Pricing.css'

function Pricing({ user }) {
    const [plans, setPlans] = useState([])
    const [loading, setLoading] = useState(true)
    const [billingPeriod, setBillingPeriod] = useState('monthly')

    const defaultPlans = [
        {
            id: 1,
            name: 'starter',
            display_name: 'Starter',
            description: 'Perfect for individual clinicians',
            price: 19,
            originalPrice: 29,
            billing_period: 'monthly',
            transcription_limit: 50,
            audio_upload_allowed: true,
            features: [
                'Live Voice Dictation',
                'AI Clinical Notes Generation',
                'Encounter Tracking',
                '50 Transcriptions/month',
                'Audio Upload Support',
                'Email Support'
            ],
            popular: false
        },
        {
            id: 2,
            name: 'professional',
            display_name: 'Professional',
            description: 'For busy practices that need more',
            price: 49.99,
            originalPrice: 79,
            billing_period: 'monthly',
            transcription_limit: 200,
            audio_upload_allowed: true,
            features: [
                'Everything in Starter',
                '200 Transcriptions/month',
                'Priority AI Processing',
                'Advanced Analytics Dashboard',
                'Custom Note Templates',
                'Priority Email Support',
                'Export to PDF/DOCX'
            ],
            popular: true
        },
        {
            id: 3,
            name: 'enterprise',
            display_name: 'Enterprise',
            description: 'Unlimited power for large practices',
            price: 0,
            billing_period: 'custom',
            transcription_limit: null,
            audio_upload_allowed: true,
            features: [
                'Unlimited Transcriptions',
                'Multi-User Admin Panel',
                'Dedicated Account Manager',
                'Custom AI Model Training',
                'API Access',
                'White-Label Options',
                '24/7 Priority Support',
                'SLA Guarantee'
            ],
            popular: false
        }
    ]

    useEffect(() => {
        const loadPlans = async () => {
            try {
                const res = await fetch('/api/plans')
                if (res.ok) {
                    const data = await res.json()
                    if (data && data.length > 0) {
                        setPlans(defaultPlans)
                    } else {
                        setPlans(defaultPlans)
                    }
                } else {
                    setPlans(defaultPlans)
                }
            } catch (err) {
                console.error('Failed to load plans:', err)
                setPlans(defaultPlans)
            } finally {
                setLoading(false)
            }
        }
        loadPlans()
    }, [])

    const handleSelectPlan = async (plan) => {
        if (plan.name === 'enterprise') {
            window.location.href = 'mailto:sales@clinivoice.ai?subject=Enterprise%20Plan%20Inquiry&body=Hello%2C%0A%0AI%20am%20interested%20in%20the%20Enterprise%20plan%20for%20my%20practice.%0A%0APlease%20provide%20more%20details%20about%20pricing%20and%20features.%0A%0AThank%20you!'
            return
        }

        const token = localStorage.getItem('clinivoice_token')
        if (!token) {
            alert('Please login to subscribe to a plan')
            return
        }

        alert(`🎉 Great choice! You selected the ${plan.display_name} plan at €${plan.price}/month.\n\nSubscription will be activated after payment.`)
    }

    const getFeatures = (plan) => {
        if (Array.isArray(plan.features)) return plan.features
        if (typeof plan.features === 'string') {
            try {
                return JSON.parse(plan.features)
            } catch {
                return []
            }
        }
        return []
    }

    const featureComparison = [
        { feature: 'Live Voice Dictation', starter: true, professional: true, enterprise: true },
        { feature: 'AI Clinical Notes', starter: true, professional: true, enterprise: true },
        { feature: 'Patient Management', starter: true, professional: true, enterprise: true },
        { feature: 'Transcriptions/month', starter: '50', professional: '200', enterprise: '∞' },
        { feature: 'Audio Upload', starter: true, professional: true, enterprise: true },
        { feature: 'Export PDF/DOCX', starter: false, professional: true, enterprise: true },
        { feature: 'Analytics Dashboard', starter: 'Basic', professional: 'Advanced', enterprise: 'Full' },
        { feature: 'Priority Support', starter: false, professional: true, enterprise: true },
        { feature: 'API Access', starter: false, professional: false, enterprise: true },
        { feature: 'White-Label', starter: false, professional: false, enterprise: true },
    ]

    if (loading) {
        return (
            <div className="pricing-page">
                <div className="pricing-loader">
                    <div className="loader-spinner"></div>
                    <p>Loading plans...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="pricing-page">
            {/* Hero Section */}
            <div className="pricing-hero">
                <div className="pricing-hero-badge">💰 Simple, Transparent Pricing</div>
                <h1 className="pricing-hero-title">Choose Your Plan</h1>
                <p className="pricing-hero-subtitle">
                    Start with our free trial, then upgrade when you're ready. 
                    No hidden fees, cancel anytime.
                </p>
                
                {/* Trust Badges */}
                <div className="trust-badges">
                    <div className="trust-badge">
                        <span className="trust-icon">🔒</span>
                        <span>Secure Payments</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">✅</span>
                        <span>14-Day Free Trial</span>
                    </div>
                    <div className="trust-badge">
                        <span className="trust-icon">🔄</span>
                        <span>Cancel Anytime</span>
                    </div>
                </div>
            </div>

            {/* Pricing Cards */}
            <div className="pricing-cards-container">
                {defaultPlans.map((plan, index) => (
                    <div 
                        key={plan.id || index} 
                        className={`pricing-card-new ${plan.popular ? 'popular' : ''}`}
                    >
                        {plan.popular && (
                            <div className="popular-ribbon">
                                <span>🔥 MOST POPULAR</span>
                            </div>
                        )}
                        
                        <div className="plan-header-new">
                            <h3 className="plan-name-new">{plan.display_name}</h3>
                            <p className="plan-desc-new">{plan.description}</p>
                        </div>

                        <div className="plan-price-new">
                            {plan.price === 0 ? (
                                <div className="custom-pricing">
                                    <span className="price-label">Custom</span>
                                    <span className="price-period">Contact Sales</span>
                                </div>
                            ) : (
                                <>
                                    <div className="price-row">
                                        <span className="currency">€</span>
                                        <span className="amount">{plan.price}</span>
                                        <span className="period">/month</span>
                                    </div>
                                    {plan.originalPrice && (
                                        <div className="original-price">
                                            <span className="strike">€{plan.originalPrice}</span>
                                            <span className="save-badge">Save {Math.round((1 - plan.price / plan.originalPrice) * 100)}%</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="plan-limit-new">
                            {plan.transcription_limit === null 
                                ? '✨ Unlimited transcriptions' 
                                : `📊 ${plan.transcription_limit} transcriptions/month`}
                        </div>

                        <ul className="plan-features-new">
                            {getFeatures(plan).map((feature, idx) => (
                                <li key={idx}>
                                    <span className="feature-check">✓</span>
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <button 
                            className={`plan-cta-new ${plan.popular ? 'cta-popular' : ''}`}
                            onClick={() => handleSelectPlan(plan)}
                        >
                            {plan.name === 'enterprise' ? '📬 Contact Sales' : '🚀 Get Started'}
                        </button>

                        {plan.name !== 'enterprise' && (
                            <p className="plan-guarantee">
                                ✓ 14-day free trial • No credit card required
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* Feature Comparison Table */}
            <div className="comparison-section-new">
                <h2 className="comparison-title">📊 Compare All Features</h2>
                <p className="comparison-subtitle">See exactly what you get with each plan</p>
                
                <div className="comparison-table-wrapper">
                    <table className="comparison-table-new">
                        <thead>
                            <tr>
                                <th className="feature-col">Feature</th>
                                <th>Starter<br/><span className="table-price">€19/mo</span></th>
                                <th className="popular-col">Professional<br/><span className="table-price">€49.99/mo</span></th>
                                <th>Enterprise<br/><span className="table-price">Custom</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {featureComparison.map((row, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'even-row' : 'odd-row'}>
                                    <td className="feature-col">{row.feature}</td>
                                    <td>
                                        {typeof row.starter === 'boolean' 
                                            ? (row.starter ? <span className="check-yes">✓</span> : <span className="check-no">—</span>)
                                            : <span className="feature-value">{row.starter}</span>
                                        }
                                    </td>
                                    <td className="popular-col">
                                        {typeof row.professional === 'boolean'
                                            ? (row.professional ? <span className="check-yes">✓</span> : <span className="check-no">—</span>)
                                            : <span className="feature-value">{row.professional}</span>
                                        }
                                    </td>
                                    <td>
                                        {typeof row.enterprise === 'boolean'
                                            ? (row.enterprise ? <span className="check-yes">✓</span> : <span className="check-no">—</span>)
                                            : <span className="feature-value">{row.enterprise}</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="faq-section-new">
                <h2 className="faq-title">❓ Frequently Asked Questions</h2>
                
                <div className="faq-grid">
                    <div className="faq-card">
                        <h4>Can I change plans anytime?</h4>
                        <p>Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
                    </div>
                    <div className="faq-card">
                        <h4>What happens if I exceed my limit?</h4>
                        <p>We'll notify you when you're close to your limit. You can upgrade or wait for the next billing cycle.</p>
                    </div>
                    <div className="faq-card">
                        <h4>Is there a free trial?</h4>
                        <p>Yes! All plans come with a 14-day free trial. No credit card required to start.</p>
                    </div>
                    <div className="faq-card">
                        <h4>Do you offer refunds?</h4>
                        <p>We offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund.</p>
                    </div>
                    <div className="faq-card">
                        <h4>What payment methods do you accept?</h4>
                        <p>We accept all major credit cards, PayPal, and bank transfers for Enterprise plans.</p>
                    </div>
                    <div className="faq-card">
                        <h4>Is my data secure?</h4>
                        <p>Absolutely. We use bank-level encryption and are fully GDPR compliant.</p>
                    </div>
                </div>
            </div>

            {/* CTA Section */}
            <div className="pricing-cta-section">
                <h2>Ready to Transform Your Documentation?</h2>
                <p>Join thousands of healthcare professionals saving hours every week</p>
                <button className="cta-button-big" onClick={() => handleSelectPlan(defaultPlans[1])}>
                    Start Free Trial →
                </button>
            </div>
        </div>
    )
}

export default Pricing
