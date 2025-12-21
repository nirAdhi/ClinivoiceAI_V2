import { useState, useEffect, useRef } from 'react'
import './MainDashboard.css'
import { CalendarIcon, UsersIcon, SparklesIcon, TimerIcon, MicIcon, FileTextIcon } from './Icons'
import AdminPanel from './AdminPanel'

function MainDashboard({ user, onLogout, theme, onToggleTheme }) {
  const [stats, setStats] = useState({ todayEncounters: 0, activePatients: 0, aiNotesGenerated: 0, timeSaved: 0 })
  const [transcription, setTranscription] = useState('')
  const [aiNote, setAiNote] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recentEncounters, setRecentEncounters] = useState([])
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const isRecordingStateRef = useRef(isRecording)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const [audioBlob, setAudioBlob] = useState(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [savePatientName, setSavePatientName] = useState('')
  const [saveDentalId, setSaveDentalId] = useState('')
  const [showSaveTranscriptModal, setShowSaveTranscriptModal] = useState(false)
  const [transcriptPatientName, setTranscriptPatientName] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyPreview, setCopyPreview] = useState('')
  const [toasts, setToasts] = useState([])
  const [showPatientsModal, setShowPatientsModal] = useState(false)
  const [patients, setPatients] = useState([])
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [patientSessions, setPatientSessions] = useState([])
  const [showTranscriptView, setShowTranscriptView] = useState(false)
  const [transcriptViewText, setTranscriptViewText] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [headerLogoLoaded, setHeaderLogoLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/stats/${user.userId}`)
      .then(res => res.json())
      .then(setStats)
      .catch(console.error)

    fetch(`/api/sessions?userId=${user.userId}`)
      .then(res => res.json())
      .then(data => setRecentEncounters(data.slice(0, 5)))
      .catch(console.error)
    try {
      const ag = localStorage.getItem('cv_auto_generate')
      if (ag != null) setAutoGenerate(ag === '1')
    } catch {}
  }, [user])

  const pushToast = (message, type = 'success', timeout = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeout)
  }

  // Derive default patient name from AI or transcription
  const guessNameFromTranscription = (text) => {
    const t = String(text || '')
    let m = t.match(/Patient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/)
    if (m && m[1]) return m[1]
    m = t.match(/name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    return ''
  }

  const derivePatientName = () => {
    const aiName = (aiNote && typeof aiNote.patient === 'string') ? aiNote.patient.trim() : ''
    if (aiName && !aiName.startsWith('[')) return aiName
    const guess = guessNameFromTranscription(transcription)
    return guess || ''
  }

  const openSaveTranscript = () => {
    setTranscriptPatientName(derivePatientName())
    setShowSaveTranscriptModal(true)
  }

  const saveRawTranscript = async () => {
    try {
      if (!transcription || transcription.trim().length === 0) { alert('No transcript to save'); return }
      const name = (transcriptPatientName || '').trim()
      if (!name) { alert('Please enter patient name'); return }
      const res = await fetch('/api/save-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, domain: user.domain || 'dental', patientName: name, transcription })
      })
      if (!res.ok) {
        let msg = `Save failed (HTTP ${res.status})`
        try { const e = await res.json(); if (e && e.error) msg = e.error } catch {
          try { const txt = await res.text(); if (txt) msg = txt.slice(0,200) } catch {}
        }
        throw new Error(msg)
      }
      const data = await res.json()
      pushToast('Transcript saved ✅', 'success')
      setShowSaveTranscriptModal(false)
      // refresh recent encounters
      fetch(`/api/sessions?userId=${user.userId}`).then(r=>r.json()).then(d=>setRecentEncounters(d.slice(0,5))).catch(()=>{})
    } catch (err) {
      console.error(err)
      pushToast(err.message || 'Failed to save transcript', 'error')
    }
  }

  const openPatients = async () => {
    setShowPatientsModal(true)
    setSelectedPatient(null)
    setPatientSessions([])
    setPatientSearch('')
    setPatientsLoading(true)
    try {
      const res = await fetch(`/api/patients?domain=${encodeURIComponent(user.domain)}`)
      const list = await res.json()
      setPatients(list)
    } catch (e) {
      pushToast('Failed to load patients', 'error')
    } finally {
      setPatientsLoading(false)
    }
  }

  const openPatientSessions = async (patient) => {
    setSelectedPatient(patient)
    try {
      const res = await fetch(`/api/patients/${patient.id}/sessions?userId=${encodeURIComponent(user.userId)}`)
      const sessions = await res.json()
      setPatientSessions(sessions)
    } catch (e) {
      pushToast('Failed to load transcripts', 'error')
    }
  }

  // Handle start/stop of speech recognition
  const copyNoteToClipboard = () => {
    if (!aiNote) { alert('No note to copy'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    setCopyPreview(text)
    setShowCopyModal(true)
  }

  const downloadNoteTxt = () => {
    if (!aiNote) { alert('No note to save'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const d = new Date().toISOString().slice(0,10)
    a.download = `DentalNote_${d}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!isRecording) {
      // stop any existing recognition and recorder
      recognitionRef.current?.stop?.()
      try { if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop() } catch {}
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('SpeechRecognition API not supported in this browser.')
      setIsRecording(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + ' '
        } else {
          interim += transcript
        }
      }
      setTranscription((finalTranscriptRef.current + interim).trim())
    }
    recognition.onerror = (e) => console.error('Recognition error', e)
    recognition.onend = () => {
      // Automatically restart if still recording (check latest state)
      if (isRecordingStateRef.current) recognition.start()
    }

    recognitionRef.current = recognition
    recognition.start()

    // Start media recorder (voice note)
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        audioChunksRef.current = []
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data) }
        recorder.onstop = () => {
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
            setAudioBlob(blob)
          } catch {}
          stream.getTracks().forEach(t => t.stop())
        }
        recorder.start()
        mediaRecorderRef.current = recorder
      } catch (err) {
        console.warn('MediaRecorder unavailable', err)
      }
    })()

    return () => {
      recognition.stop()
      recognitionRef.current = null
    }
  }, [isRecording])

  useEffect(() => {
    isRecordingStateRef.current = isRecording
  }, [isRecording])

  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedSections, setSelectedSections] = useState(new Set())
  const toggleSection = (key) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  const isSelected = (key) => selectedSections.has(key)
  const selectAllSections = () => {
    const keys = new Set([
      'header','chiefComplaint','historyOfPresentIllness','medicalHistory','dentalHistory','intraOralExamination','diagnosticProcedures','assessment','educationRecommendations','patientResponse','plan','codes'
    ])
    setSelectedSections(keys)
  }
  const clearAllSections = () => setSelectedSections(new Set())

  const toggleRecording = () => {
    setIsRecording(prev => {
      const next = !prev
      if (next) {
        // reset transcription when starting fresh
        setTranscription('')
        finalTranscriptRef.current = ''
      }
      return next
    })
  }

  // Auto-generate when recording stops with transcription
  useEffect(() => {
    if (!autoGenerate) return
    if (!isRecording && transcription.trim().length > 20 && !aiNote && !isGenerating) {
      const timer = setTimeout(() => { handleGenerate() }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isRecording, transcription, autoGenerate])

  const handleGenerate = async () => {
    if (!transcription || transcription.trim().length === 0) {
      alert('Please record or type some text first')
      return
    }
    
    setIsGenerating(true)
    try {
      console.log('🚀 Sending generate request...')
      const res = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcription: transcription.trim(), 
          domain: 'dental', 
          userId: user.userId 
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Generation failed')
      }
      
      const note = await res.json()
      console.log('✅ Note received:', note)
      setAiNote(note)

      // Sync stats after generating note
      setStats(prev => ({
        ...prev,
        aiNotesGenerated: prev.aiNotesGenerated + 1,
        todayEncounters: prev.todayEncounters + 1,
        timeSaved: prev.timeSaved + 0.5
      }))
    } catch (error) {
      console.error('❌ Error generating note:', error)
      alert(`Failed to generate note: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Build a paste-friendly plain text for dental or medical notes
  const formatNoteAsText = (note, selected) => {
    if (!note) return ''
    const hasSel = selected && selected.size > 0
    const include = (k) => !hasSel || selected.has(k)
    const includeCodes = Boolean(selected && selected.has('codes'))
    const normalize = (s) => {
      const t = String(s || '').trim()
      if (!t) return ''
      if (t.includes('\n')) return t
      return t.replace(/([.?!])\s+/g, '$1\n')
    }
    if (note.chiefComplaint || (note.patient && note.visitType)) {
      const parts = []
      if (include('header')) {
        parts.push([
          `Patient: ${note.patient || ''}`,
          `Date: ${note.date || ''}`,
          `Dentist: ${note.dentist || ''}`,
          `Visit Type: ${note.visitType || ''}`
        ].join('\n'))
      }
      if (include('chiefComplaint')) parts.push(`Chief Complaint:\n${normalize(note.chiefComplaint)}`)
      if (include('historyOfPresentIllness')) parts.push(`History of Present Illness:\n${normalize(note.historyOfPresentIllness)}`)
      if (include('medicalHistory')) parts.push(`Medical History:\n${normalize(note.medicalHistory)}`)
      if (include('dentalHistory')) parts.push(`Dental History:\n${normalize(note.dentalHistory)}`)
      if (include('intraOralExamination')) parts.push(`Intraoral Examination:\n${normalize(note.intraOralExamination)}`)
      if (include('diagnosticProcedures')) parts.push(`Diagnostic Procedures:\n${normalize(note.diagnosticProcedures)}`)
      if (include('assessment')) parts.push(`Assessment:\n${normalize(note.assessment)}`)
      if (include('educationRecommendations')) parts.push(`Education & Recommendations:\n${normalize(note.educationRecommendations)}`)
      if (include('patientResponse')) parts.push(`Patient Response:\n${normalize(note.patientResponse)}`)
      if (include('plan')) parts.push(`Plan:\n${normalize(note.plan)}`)
      if (includeCodes) {
        const icd = Array.isArray(note.icdCodes) ? note.icdCodes.join(', ') : ''
        const cpt = Array.isArray(note.cptCodes) ? note.cptCodes.join(', ') : ''
        if (icd || cpt) parts.push(`Codes:\nICD: ${icd}\nCPT: ${cpt}`)
      }
      return parts.filter(Boolean).join('\n').trim()
    }
    const parts = []
    if (include('subjective')) parts.push(`Subjective:\n${normalize(note.subjective)}`)
    if (include('objective')) parts.push(`Objective:\n${normalize(note.objective)}`)
    if (include('assessment')) parts.push(`Assessment:\n${normalize(note.assessment)}`)
    if (include('plan')) parts.push(`Plan:\n${normalize(note.plan)}`)
    if (includeCodes) {
      const icd = Array.isArray(note.icdCodes) ? note.icdCodes.join(', ') : ''
      const cpt = Array.isArray(note.cptCodes) ? note.cptCodes.join(', ') : ''
      if (icd || cpt) parts.push(`Codes:\nICD: ${icd}\nCPT: ${cpt}`)
    }
    return parts.join('\n').trim()
  }

  return (
    <div className="app-container">
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
      <header className="top-header">
        <div className="brand">
          <div className="brand-icon">
            <img src="clinivoice-logo.png" alt="Clinvoice AI" className="brand-logo" onLoad={()=>setHeaderLogoLoaded(true)} onError={(e)=>{ e.currentTarget.style.display='none'; setHeaderLogoLoaded(false) }} />
            {!headerLogoLoaded && <FileTextIcon />}
          </div>
          <div>
            <h1>Clinvoice AI</h1>
            <p>AI-Powered Clinical Documentation (Gemini)</p>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={onToggleTheme} className="theme-btn" title="Toggle Theme">
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          {user.userId === 'admin' ? (
            <button className="theme-btn" onClick={() => setShowAdmin(true)} title="Admin Panel">Admin</button>
          ) : (
            <span className="user-badge">{user.userId}</span>
          )}
          <button onClick={onLogout} className="theme-btn" title="Logout">Logout</button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ Settings</h2>
            <div className="settings-section">
              <p><strong>User:</strong> {user.userId}</p>
              <p><strong>Domain:</strong> {user.domain}</p>
              <p><strong>Theme:</strong> {theme}</p>
              <p><strong>AI Model:</strong> Google Gemini Pro</p>
              <label style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="checkbox" checked={autoGenerate} onChange={(e)=>{ setAutoGenerate(e.target.checked); try { localStorage.setItem('cv_auto_generate', e.target.checked ? '1':'0') } catch {} }} />
                Auto-generate note when recording stops
              </label>
            </div>
            <button onClick={() => setShowSettings(false)} className="modal-close-btn">Close</button>
          </div>
        </div>
      )}

      {showPatientsModal && (
        <div className="modal-overlay" onClick={() => setShowPatientsModal(false)}>
          <div className="modal-content patients-modal" onClick={(e)=>e.stopPropagation()}>
            <h2>👥 Patients</h2>
            <div className="settings-section">
              <input
                type="text"
                className="mrn-input"
                placeholder="Search patients..."
                value={patientSearch}
                onChange={e=>setPatientSearch(e.target.value)}
              />
              <div className="patients-browser">
                <div className="patients-list">
                  {patientsLoading ? <div>Loading...</div> : (
                    (patients || []).filter(p=>!patientSearch || (p.name||'').toLowerCase().includes(patientSearch.toLowerCase())).map(p => (
                      <button key={p.id} className={`patient-row ${selectedPatient?.id===p.id?'active':''}`} onClick={()=>openPatientSessions(p)}>
                        <span className="name">{p.name}</span>
                        <span className="meta">#{p.id}</span>
                      </button>
                    ))
                  )}
                  {(!patientsLoading && patients && patients.length===0) && <div>No patients</div>}
                </div>
                <div className="sessions-list">
                  {selectedPatient ? (
                    <>
                      <h4>Transcripts for {selectedPatient.name}</h4>
                      {(patientSessions||[]).map(s=> (
                        <div key={s.id} className="session-row">
                          <div>
                            <div className="date">{new Date(s.created_at).toLocaleString()}</div>
                            <div className="status">{s.status}</div>
                          </div>
                          <div className="actions">
                            <button className="pdf-btn" onClick={()=>{ setTranscriptViewText(s.transcription||''); setShowTranscriptView(true) }}>View</button>
                          </div>
                        </div>
                      ))}
                      {(patientSessions||[]).length===0 && <div>No transcripts yet</div>}
                    </>
                  ) : <div>Select a patient to view transcripts</div>}
                </div>
              </div>
            </div>
            <div className="note-actions">
              <button className="pdf-btn" onClick={()=>setShowPatientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showTranscriptView && (
        <div className="modal-overlay" onClick={() => setShowTranscriptView(false)}>
          <div className="modal-content copy-modal" onClick={(e)=>e.stopPropagation()}>
            <h2>📝 Transcript</h2>
            <textarea className="copy-preview-text" value={transcriptViewText} readOnly />
            <div className="note-actions">
              <button className="pdf-btn" onClick={()=>{ navigator.clipboard.writeText(transcriptViewText); pushToast('Copied to clipboard', 'success') }}>Copy</button>
              <button className="pdf-btn" onClick={()=>setShowTranscriptView(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showSaveTranscriptModal && (
        <div className="modal-overlay" onClick={() => setShowSaveTranscriptModal(false)}>
          <div className="modal-content" onClick={(e)=>e.stopPropagation()}>
            <h2>📝 Save Raw Transcript</h2>
            <div className="settings-section">
              <label>
                Patient Name
                <input type="text" value={transcriptPatientName} onChange={e=>setTranscriptPatientName(e.target.value)} className="mrn-input" placeholder="e.g., John Doe" />
              </label>
              <div><strong>Transcript chars:</strong> {transcription?.length || 0}</div>
              <small>This saves the transcript only. You can generate AI notes later.</small>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={saveRawTranscript}>💾 Save Transcript</button>
              <button className="pdf-btn" onClick={()=>setShowSaveTranscriptModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal-content copy-modal" onClick={(e)=>e.stopPropagation()}>
            <textarea className="copy-preview-text" value={copyPreview} onChange={(e)=>setCopyPreview(e.target.value)} placeholder="Nothing selected yet" />
            <div className="note-actions">
              <button className="pdf-btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(copyPreview); } catch { alert('Copy failed'); } }}>Copy</button>
              <button className="save-note-btn" onClick={()=>{ navigator.clipboard.writeText(copyPreview).then(()=>setShowCopyModal(false)); }}>Copy & Close</button>
              <button className="pdf-btn" onClick={()=>setShowCopyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>💾 Save Encounter</h2>
            <div className="settings-section">
              <p><strong>Instructions:</strong> Enter patient name or dental ID. We will save the generated note and attach the voice note if available.</p>
              <label>
                Patient Name
                <input type="text" value={savePatientName} onChange={e=>setSavePatientName(e.target.value)} className="mrn-input" placeholder="e.g., John Doe" />
              </label>
              <label>
                Dental ID (optional)
                <input type="text" value={saveDentalId} onChange={e=>setSaveDentalId(e.target.value)} className="mrn-input" placeholder="e.g., DNT-12345" />
              </label>
              <div>
                <strong>Voice note:</strong> {audioBlob ? `${(audioBlob.size/1024/1024).toFixed(2)} MB attached` : 'No voice note recorded this session'}
              </div>
              <label>
                Or attach audio file
                <input type="file" accept="audio/*" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) setAudioBlob(f); }} />
              </label>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={saveToDatabase}>✅ Save to Database</button>
              <button className="pdf-btn" onClick={()=>setShowSaveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showQuickActions && (
        <div className="dropdown-menu">
          <button onClick={() => { setTranscription(''); setAiNote(null); setShowQuickActions(false); }}>
            🆕 New Dictation
          </button>
          <button onClick={copyNoteToClipboard}>📋 Copy selected</button>
          <button onClick={downloadNoteTxt}>💾 Save selected (.txt)</button>
          <button onClick={selectAllSections}>✅ Select all sections</button>
          <button onClick={clearAllSections}>🧹 Clear selections</button>
          <button onClick={() => window.print()}>🖨️ Print Note</button>
          <button onClick={() => alert('Stats feature coming soon!')}>📊 View Statistics</button>
          <button onClick={() => setShowQuickActions(false)}>❌ Close</button>
        </div>
      )}

      <div className="action-bar">
        <button onClick={() => setShowSettings(!showSettings)} className="action-btn purple">⚙️ Settings</button>
        <button onClick={() => setShowQuickActions(!showQuickActions)} className="action-btn orange">⚡ Quick Actions</button>
        <button onClick={openPatients} className="action-btn blue">👥 Patients</button>
        <button onClick={() => document.querySelector('.encounters-table')?.scrollIntoView({ behavior: 'smooth' })} className="action-btn green">📋 Encounters</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card purple">
          <div className="stat-icon"><CalendarIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Today's Encounters</div>
            <div className="stat-value">{stats.todayEncounters}</div>
            <div className="stat-sub">+1.2% from yesterday</div>
          </div>
        </div>

        <div className="stat-card green">
          <div className="stat-icon"><UsersIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Active Patients</div>
            <div className="stat-value">{stats.activePatients}</div>
            <div className="stat-sub">Total registered</div>
          </div>
        </div>

        <div className="stat-card pink">
          <div className="stat-icon"><SparklesIcon /></div>
          <div className="stat-info">
            <div className="stat-label">AI Notes Generated</div>
            <div className="stat-value">{stats.aiNotesGenerated}</div>
            <div className="stat-sub">Avg 90% accuracy</div>
          </div>
        </div>

        <div className="stat-card orange">
          <div className="stat-icon"><TimerIcon /></div>
          <div className="stat-info">
            <div className="stat-label">Time Saved</div>
            <div className="stat-value">{stats.timeSaved}h</div>
            <div className="stat-sub">Since last note</div>
          </div>
        </div>
      </div>

      <div className="main-panels">
        <div className="panel live-panel">
          <div className="panel-header">
            <span className="panel-icon red"><MicIcon /></span>
            <div>
              <h3>Live Dictation</h3>
              <p>Powered by AI transcription</p>
            </div>
          </div>

          <input id="patientSearch" type="text" placeholder="🔍 Search Patient" className="search-input" />
          <input type="text" placeholder="⌨️ Type name or MRN..." className="mrn-input" />

          <button
            className="create-patient-btn"
            onClick={async () => {
              const name = prompt('Enter patient name')?.trim()
              if (!name) return
              try {
                const res = await fetch('/api/patients', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, domain: user.domain })
                })
                if (!res.ok) throw new Error('Failed to create')
                const { id } = await res.json()
                alert('Patient created!')
                // refresh stats/patients count
                setStats(prev => ({ ...prev, activePatients: prev.activePatients + 1 }))
              } catch (e) {
                console.error(e)
                alert('Error creating patient')
              }
            }}
          >
            + Create New Patient
          </button>

          <button
            onClick={toggleRecording}
            className={`record-btn ${isRecording ? 'recording' : ''}`}
          >
            🎙️ {isRecording ? 'Stop Recording (Cmd+R)' : 'Start Recording (Cmd+R)'}
          </button>

          <button
            className="mobile-mic-btn"
            onClick={() => alert('Coming soon: pair your phone microphone!')}
          >
            📱 Mobile Mic
          </button>

          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Start recording to see real-time transcription...

Your words will appear here as you speak"
            className="transcription-area"
            rows="8"
          />

          <button
            className="save-note-btn"
            onClick={openSaveTranscript}
            disabled={!transcription || transcription.trim().length === 0}
          >
            💾 Save Transcript
          </button>

          <div className="upload-section">
            <label className="upload-label">
              Or Upload Audio File
              <input type="file" accept="audio/*" style={{ display: 'none' }} />
            </label>
            <span className="no-file">No file chosen</span>
          </div>
        </div>

        <div className="panel note-panel">
          <div className="panel-header">
            <span className="panel-icon green"><FileTextIcon /></span>
            <div>
              <h3>AI-Generated Note</h3>
              <div className="note-sub">
                <span className="subtle">Dental format</span>
              </div>
            </div>
            <button onClick={handleGenerate} disabled={!transcription || isGenerating} className="generate-btn">
              {isGenerating ? '⏳ Generating...' : '✨ Generate'}
            </button>
            <button className="pdf-btn" onClick={copyNoteToClipboard} disabled={!aiNote}>📋 Copy</button>
            <button className="pdf-btn" onClick={() => window.print()} disabled={!aiNote}>📄 PDF</button>
            <button className="save-note-btn" onClick={() => setShowSaveModal(true)} disabled={!aiNote}>💾 Save</button>
          </div>

          {aiNote ? (
            <div className="soap-note">
              {aiNote.chiefComplaint ? (
                <>
                  <div className={`report-header ${selectedSections.size>0 && isSelected('header') ? 'selected-for-copy' : ''}`}>
                    <div><strong>Patient:</strong> {aiNote.patient}</div>
                    <div><strong>Date:</strong> {aiNote.date}</div>
                    <div><strong>Dentist:</strong> {aiNote.dentist}</div>
                    <div><strong>Visit Type:</strong> {aiNote.visitType}</div>
                  </div>
                  <div className="section-select" onClick={() => toggleSection('header')} role="button">
                    <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('header')} readOnly /><span>Copy header</span></label>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('chiefComplaint') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('chiefComplaint')} role="button">
                    <div className="section-head" >
                      <strong>🦷 Chief Complaint</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('chiefComplaint')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.chiefComplaint}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('historyOfPresentIllness') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('historyOfPresentIllness')} role="button">
                    <div className="section-head">
                      <strong>📋 History of Present Illness</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('historyOfPresentIllness')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.historyOfPresentIllness}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('medicalHistory') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('medicalHistory')} role="button">
                    <div className="section-head">
                      <strong>⚕️ Medical History</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('medicalHistory')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.medicalHistory}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('dentalHistory') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('dentalHistory')} role="button">
                    <div className="section-head">
                      <strong>🪥 Dental History</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('dentalHistory')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.dentalHistory}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('intraOralExamination') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('intraOralExamination')} role="button">
                    <div className="section-head">
                      <strong>👁️ Intraoral Examination</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('intraOralExamination')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.intraOralExamination}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('diagnosticProcedures') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('diagnosticProcedures')} role="button">
                    <div className="section-head">
                      <strong>🔬 Diagnostic Procedures</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('diagnosticProcedures')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.diagnosticProcedures}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('assessment') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('assessment')} role="button">
                    <div className="section-head">
                      <strong>📊 Assessment</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('assessment')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.assessment}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('educationRecommendations') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('educationRecommendations')} role="button">
                    <div className="section-head">
                      <strong>📚 Education & Recommendations</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('educationRecommendations')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.educationRecommendations}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('patientResponse') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('patientResponse')} role="button">
                    <div className="section-head">
                      <strong>💬 Patient Response</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('patientResponse')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.patientResponse}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('plan') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('plan')} role="button">
                    <div className="section-head">
                      <strong>📋 Plan</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('plan')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.plan}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className={`soap-section ${selectedSections.size>0 && isSelected('subjective') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('subjective')} role="button">
                    <div className="section-head">
                      <strong>📝 Subjective</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('subjective')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.subjective}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('objective') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('objective')} role="button">
                    <div className="section-head">
                      <strong>🔬 Objective</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('objective')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.objective}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('assessment') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('assessment')} role="button">
                    <div className="section-head">
                      <strong>🩺 Assessment</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('assessment')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.assessment}</p>
                  </div>

                  <div className={`soap-section ${selectedSections.size>0 && isSelected('plan') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('plan')} role="button">
                    <div className="section-head">
                      <strong>📋 Plan</strong>
                      <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('plan')} readOnly /><span>Copy me</span></label>
                    </div>
                    <p>{aiNote.plan}</p>
                  </div>
                </>
              )}

              <div className={`coding-section ${selectedSections.size>0 && isSelected('codes') ? 'selected-for-copy' : ''}`} onClick={() => toggleSection('codes')} role="button">
                <div className="section-head">
                  <strong>💊 Coding Suggestions</strong>
                  <label onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected('codes')} readOnly /><span>Copy me</span></label>
                </div>
                <div className="codes">
                  <div><strong>ICD:</strong> {aiNote.icdCodes?.join(', ')}</div>
                  <div><strong>CPT:</strong> {aiNote.cptCodes?.join(', ')}</div>
                </div>
              </div>

              <div className="note-actions">
                <button
                  className="save-note-btn"
                  onClick={async () => {
                    if (!aiNote) return
                    try {
                      if (aiNote.sessionId) {
                        await fetch(`/api/sessions/${aiNote.sessionId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ai_notes: JSON.stringify(aiNote), status: 'finalized' })
                        })
                        alert('Note saved!')
                      } else {
                        downloadNoteTxt()
                      }
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save note')
                    }
                  }}
                >
                  💾 Save Note
                </button>
                <button className="pdf-btn" onClick={copyNoteToClipboard}>📋 Copy Text</button>
                <button className="pdf-btn" onClick={() => window.print()}>
                  📄 PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-note">
              <div className="empty-icon">📝</div>
              <p>No note generated yet</p>
              <small>Click "Generate" to create an AI-powered SOAP note</small>
            </div>
          )}
        </div>
      </div>

      <div className="encounters-table">
        <div className="table-header">
          <span className="table-icon">📋</span>
          <h3>Recent Encounters</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>PATIENT</th>
              <th>DATE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {recentEncounters.map(enc => (
              <tr key={enc.id}>
                <td>{enc.patient_name || 'Unknown'}</td>
                <td>{new Date(enc.created_at).toLocaleDateString()}</td>
                <td><span className={`status ${enc.status}`}>{enc.status}</span></td>
                <td><button className="view-btn">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div >
  )
}

export default MainDashboard
