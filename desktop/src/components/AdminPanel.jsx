import { useEffect, useState } from 'react'
import './AdminPanel.css'

function AdminPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [plans, setPlans] = useState([])
  const [whitelistedUsers, setWhitelistedUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [planHistory, setPlanHistory] = useState([])
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [toasts, setToasts] = useState([])

  const token = localStorage.getItem('clinivoice_token')

  const pushToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/users/details?adminId=admin')
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/admin/plans?adminId=admin')
      if (!res.ok) throw new Error('Failed to load plans')
      const data = await res.json()
      setPlans(data)
    } catch (e) {
      console.error('Failed to load plans:', e)
    }
  }

  const fetchWhitelist = async () => {
    try {
      if (!token) return
      const res = await fetch('/api/admin/whitelist', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWhitelistedUsers(data)
      }
    } catch (e) {
      console.error('Failed to load whitelist:', e)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/admin/analytics?adminId=admin')
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch (e) {
      console.error('Failed to load analytics:', e)
    }
  }

  const fetchPlanHistory = async () => {
    try {
      const res = await fetch('/api/admin/plans/history?adminId=admin')
      if (res.ok) {
        const data = await res.json()
        setPlanHistory(data)
      }
    } catch (e) {
      console.error('Failed to load plan history:', e)
    }
  }

  const searchUsers = async (term) => {
    if (!term || term.length < 2) {
      fetchUsers()
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(term)}&adminId=admin`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchPlans()
    fetchWhitelist()
    fetchAnalytics()
    fetchPlanHistory()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) searchUsers(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const deleteUser = async (user_id) => {
    if (!confirm(`Delete user ${user_id}? This also deletes their sessions.`)) return
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user_id)}?adminId=admin`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      await fetchUsers()
      pushToast('User deleted successfully')
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const changeRole = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role?adminId=admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      if (!res.ok) throw new Error('Failed to update role')
      pushToast('Role updated')
      fetchUsers()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const toggleTranscriptionAccess = async (userId, enabled) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/transcription-access?adminId=admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })
      if (!res.ok) throw new Error('Failed to update access')
      pushToast(enabled ? 'Transcription enabled' : 'Transcription disabled')
      fetchUsers()
      fetchWhitelist()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const assignPlan = async (userId, planId) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/assign-plan?adminId=admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, status: 'active' })
      })
      if (!res.ok) throw new Error('Failed to assign plan')
      pushToast('Plan assigned successfully')
      fetchUsers()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const cancelSubscription = async (userId) => {
    if (!confirm('Cancel this subscription?')) return
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/cancel-subscription?adminId=admin`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Failed to cancel subscription')
      pushToast('Subscription cancelled')
      fetchUsers()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const addToWhitelist = async (userId) => {
    const reason = prompt('Reason for whitelisting (e.g., VIP customer, staff member):')
    if (!reason) return

    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, reason })
      })

      if (!res.ok) throw new Error('Failed to add to whitelist')

      pushToast('User added to whitelist')
      fetchWhitelist()
      fetchUsers()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const removeFromWhitelist = async (userId) => {
    if (!confirm('Remove unlimited access for this user?')) return

    try {
      const res = await fetch(`/api/admin/whitelist/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) throw new Error('Failed to remove from whitelist')

      pushToast('User removed from whitelist')
      fetchWhitelist()
      fetchUsers()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const savePlan = async (planData) => {
    try {
      const url = editingPlan 
        ? `/api/admin/plans/${editingPlan.id}?adminId=admin`
        : '/api/admin/plans?adminId=admin'
      const method = editingPlan ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planData)
      })

      if (!res.ok) throw new Error('Failed to save plan')

      pushToast(editingPlan ? 'Plan updated' : 'Plan created')
      setShowPlanModal(false)
      setEditingPlan(null)
      fetchPlans()
      fetchPlanHistory()
    } catch (e) {
      pushToast(e.message || 'Failed', 'error')
    }
  }

  const filteredUsers = searchTerm 
    ? users 
    : users

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <h2>👑 Admin Portal</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>

        <div className="admin-tabs">
          <button
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => setActiveTab('users')}
          >
            👥 Users ({users.length})
          </button>
          <button
            className={activeTab === 'pricing' ? 'active' : ''}
            onClick={() => setActiveTab('pricing')}
          >
            💰 Pricing
          </button>
          <button
            className={activeTab === 'subscriptions' ? 'active' : ''}
            onClick={() => setActiveTab('subscriptions')}
          >
            💳 Subscriptions
          </button>
          <button
            className={activeTab === 'whitelist' ? 'active' : ''}
            onClick={() => setActiveTab('whitelist')}
          >
            ⭐ Whitelist ({whitelistedUsers.length})
          </button>
          <button
            className={activeTab === 'analytics' ? 'active' : ''}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Analytics
          </button>
        </div>

        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
          ))}
        </div>

        {loading && activeTab === 'users' ? (
          <p className="loading-text">Loading...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            {/* USERS TAB */}
            {activeTab === 'users' && (
              <div className="admin-content">
                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="Search users by name, email, or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  {searchTerm && (
                    <button onClick={() => { setSearchTerm(''); fetchUsers() }} className="clear-btn">✕</button>
                  )}
                </div>

                <div className="table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Domain</th>
                        <th>Role</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>Usage</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.user_id}>
                          <td><strong>{u.user_id}</strong></td>
                          <td>{u.name || '-'}</td>
                          <td>{u.email || '-'}</td>
                          <td><span className="domain-badge">{u.domain}</span></td>
                          <td>
                            <select
                              value={u.role || 'clinician'}
                              onChange={(e) => changeRole(u.user_id, e.target.value)}
                              className="role-select"
                              disabled={u.user_id === 'admin'}
                            >
                              <option value="admin">Admin</option>
                              <option value="clinician">Clinician</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>
                          <td>{u.plan_display_name || 'No plan'}</td>
                          <td>
                            <span className={`status-badge ${u.subscription_status || 'none'}`}>
                              {u.subscription_status || 'none'}
                            </span>
                            {u.whitelist_id && <span className="whitelist-badge">⭐</span>}
                          </td>
                          <td className="usage-cell">
                            {u.usage_count || 0} / {u.transcription_limit || '∞'}
                          </td>
                          <td className="admin-actions">
                            {u.user_id !== 'admin' && (
                              <>
                                {!u.whitelist_id ? (
                                  <button onClick={() => addToWhitelist(u.id)} className="btn-small btn-success" title="Give unlimited access">
                                    ⭐
                                  </button>
                                ) : (
                                  <button onClick={() => removeFromWhitelist(u.id)} className="btn-small btn-warning" title="Remove unlimited access">
                                    🔓
                                  </button>
                                )}
                                <button onClick={() => deleteUser(u.user_id)} className="btn-small btn-danger" title="Delete user">
                                  🗑️
                                </button>
                              </>
                            )}
                            {u.user_id === 'admin' && <span className="admin-label">System</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PRICING TAB */}
            {activeTab === 'pricing' && (
              <div className="admin-content">
                <div className="section-header">
                  <h3>Plan Management</h3>
                  <button 
                    className="btn btn-primary"
                    onClick={() => { setEditingPlan(null); setShowPlanModal(true) }}
                  >
                    ＋ New Plan
                  </button>
                </div>

                <div className="plans-grid">
                  {plans.map(plan => (
                    <div key={plan.id} className={`plan-card ${!plan.is_active ? 'inactive' : ''}`}>
                      <div className="plan-card-header">
                        <h4>{plan.display_name}</h4>
                        <span className={`plan-status ${plan.is_active ? 'active' : 'inactive'}`}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="plan-price">${plan.price}<span>/mo</span></div>
                      <ul className="plan-features">
                        <li>📋 {plan.transcription_limit || 'Unlimited'} transcriptions</li>
                        <li>📁 Audio upload: {plan.audio_upload_allowed ? '✅' : '❌'}</li>
                        {plan.features && JSON.parse(plan.features).map((f, i) => (
                          <li key={i}>✓ {f}</li>
                        ))}
                      </ul>
                      <div className="plan-actions">
                        <button 
                          className="btn-small"
                          onClick={() => { setEditingPlan(plan); setShowPlanModal(true) }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-small btn-ghost"
                          onClick={async () => {
                            await fetch(`/api/admin/plans/${plan.id}?adminId=admin`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ is_active: !plan.is_active })
                            })
                            fetchPlans()
                          }}
                        >
                          {plan.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="history-section">
                  <h4>📋 Pricing History</h4>
                  {planHistory.length === 0 ? (
                    <p className="empty-state">No history yet</p>
                  ) : (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Plan</th>
                          <th>Changes</th>
                          <th>Changed By</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planHistory.slice(0, 10).map(h => (
                          <tr key={h.id}>
                            <td>{h.plan_name}</td>
                            <td><code>{h.changes}</code></td>
                            <td>{h.changed_by}</td>
                            <td>{new Date(h.created_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* SUBSCRIPTIONS TAB */}
            {activeTab === 'subscriptions' && (
              <div className="admin-content">
                <div className="table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Current Plan</th>
                        <th>Status</th>
                        <th>Usage</th>
                        <th>Limit</th>
                        <th>Whitelisted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => u.plan_name || u.subscription_status).map(u => (
                        <tr key={u.user_id}>
                          <td><strong>{u.user_id}</strong></td>
                          <td>{u.plan_display_name || 'No plan'}</td>
                          <td>
                            <span className={`status-badge ${u.subscription_status || 'none'}`}>
                              {u.subscription_status || 'none'}
                            </span>
                          </td>
                          <td>{u.usage_count || 0}</td>
                          <td>{u.transcription_limit || '∞'}</td>
                          <td>{u.whitelist_id ? '⭐ Yes' : 'No'}</td>
                          <td className="admin-actions">
                            <select
                              className="plan-select"
                              onChange={(e) => e.target.value && assignPlan(u.id, parseInt(e.target.value))}
                              defaultValue=""
                            >
                              <option value="">Change Plan...</option>
                              {plans.map(p => (
                                <option key={p.id} value={p.id}>{p.display_name}</option>
                              ))}
                            </select>
                            {u.subscription_status === 'active' && (
                              <button 
                                className="btn-small btn-danger"
                                onClick={() => cancelSubscription(u.id)}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* WHITELIST TAB */}
            {activeTab === 'whitelist' && (
              <div className="admin-content">
                <div className="whitelist-info">
                  <p>⭐ Whitelisted users have <strong>unlimited transcriptions</strong> regardless of their subscription plan.</p>
                </div>

                {whitelistedUsers.length === 0 ? (
                  <p className="empty-state">No whitelisted users. Add users from the Users tab.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Reason</th>
                        <th>Granted By</th>
                        <th>Date Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whitelistedUsers.map(w => (
                        <tr key={w.user_id}>
                          <td><strong>{w.user_id}</strong></td>
                          <td>{w.name || '-'}</td>
                          <td>{w.reason}</td>
                          <td>{w.granted_by}</td>
                          <td>{new Date(w.created_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              onClick={() => removeFromWhitelist(w.id)}
                              className="btn-small btn-danger"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === 'analytics' && analytics && (
              <div className="admin-content">
                <div className="analytics-grid">
                  <div className="analytics-card">
                    <div className="analytics-icon">👥</div>
                    <div className="analytics-value">{analytics.totalUsers}</div>
                    <div className="analytics-label">Total Users</div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-icon">📋</div>
                    <div className="analytics-value">{analytics.totalSessions}</div>
                    <div className="analytics-label">Total Sessions</div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-icon">🧑‍⚕️</div>
                    <div className="analytics-value">{analytics.totalPatients}</div>
                    <div className="analytics-label">Patients</div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-icon">💳</div>
                    <div className="analytics-value">{analytics.activeSubscriptions}</div>
                    <div className="analytics-label">Active Subscriptions</div>
                  </div>
                  <div className="analytics-card">
                    <div className="analytics-icon">⭐</div>
                    <div className="analytics-value">{analytics.whitelistedUsers}</div>
                    <div className="analytics-label">Whitelisted</div>
                  </div>
                </div>

                <div className="plan-distribution">
                  <h4>📊 Plan Distribution</h4>
                  {analytics.planDistribution.map(p => (
                    <div key={p.display_name} className="plan-dist-item">
                      <span className="plan-name">{p.display_name}</span>
                      <div className="plan-bar">
                        <div 
                          className="plan-bar-fill" 
                          style={{ width: `${Math.max(5, (p.count / analytics.activeSubscriptions) * 100)}%` }}
                        ></div>
                      </div>
                      <span className="plan-count">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Plan Edit Modal */}
        {showPlanModal && (
          <div className="modal-overlay sub-modal" onClick={() => setShowPlanModal(false)}>
            <div className="modal-content plan-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</h3>
              <PlanForm 
                plan={editingPlan} 
                onSave={savePlan}
                onCancel={() => { setShowPlanModal(false); setEditingPlan(null) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanForm({ plan, onSave, onCancel }) {
  const [formData, setFormData] = useState(plan || {
    name: '',
    display_name: '',
    description: '',
    price: 0,
    billing_period: 'monthly',
    transcription_limit: 50,
    audio_upload_allowed: true,
    is_active: true
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="plan-form">
      <div className="form-group">
        <label>Plan Name (internal)</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="starter"
          required
        />
      </div>
      <div className="form-group">
        <label>Display Name</label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          placeholder="Starter Plan"
          required
        />
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Perfect for getting started..."
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Price ($/month)</label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
            min="0"
            step="0.01"
            required
          />
        </div>
        <div className="form-group">
          <label>Transcription Limit</label>
          <input
            type="number"
            value={formData.transcription_limit || ''}
            onChange={(e) => setFormData({ ...formData, transcription_limit: parseInt(e.target.value) || null })}
            placeholder="Leave empty for unlimited"
          />
        </div>
      </div>
      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.audio_upload_allowed}
            onChange={(e) => setFormData({ ...formData, audio_upload_allowed: e.target.checked })}
          />
          Allow Audio Upload
        </label>
        <label>
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          Active Plan
        </label>
      </div>
      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button type="submit" className="btn btn-primary">{plan ? 'Update Plan' : 'Create Plan'}</button>
      </div>
    </form>
  )
}

export default AdminPanel
