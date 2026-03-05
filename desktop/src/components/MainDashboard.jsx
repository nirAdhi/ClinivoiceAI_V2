import { useState, useEffect, useRef } from 'react'
import './MainDashboard.css'
import { CalendarIcon, UsersIcon, SparklesIcon, TimerIcon, MicIcon, FileTextIcon } from './Icons'
import { QRCodeSVG } from 'qrcode.react'
import AdminPanel from './AdminPanel'
import About from './About'
import Pricing from './Pricing'

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
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfType, setPdfType] = useState('ai') // 'ai' or 'raw'
  const [savePatientName, setSavePatientName] = useState('')
  const [saveToothNumber, setSaveToothNumber] = useState('')
  const [saveType, setSaveType] = useState('both')
  const [showSaveDropdown, setShowSaveDropdown] = useState(false)
  const [showPatientsModal, setShowPatientsModal] = useState(false)
  const [patientsList, setPatientsList] = useState([])
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyPreview, setCopyPreview] = useState('')
  const [toasts, setToasts] = useState([])
  const [showTranscriptView, setShowTranscriptView] = useState(false)
  const [transcriptViewText, setTranscriptViewText] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [headerLogoLoaded, setHeaderLogoLoaded] = useState(false)
  const [viewingEncounter, setViewingEncounter] = useState(null)
  const [subscriptionInfo, setSubscriptionInfo] = useState(null)
  const [loadingSubscription, setLoadingSubscription] = useState(true)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [globalSearch, setGlobalSearch] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [inputSource, setInputSource] = useState('computer') // 'computer' or 'mobile'
  const [mobileSessionCode, setMobileSessionCode] = useState(null)
  const [isMobileConnected, setIsMobileConnected] = useState(false)
  const [isMobileRecording, setIsMobileRecording] = useState(false)
  const [showMobileCodeModal, setShowMobileCodeModal] = useState(false)
  const mobileWsRef = useRef(null)

  useEffect(() => {
    fetch(`/api/stats/${user.userId}`)
      .then(res => res.ok ? res.json() : { todayEncounters: 0, activePatients: 0, aiNotesGenerated: 0, timeSaved: 0 })
      .then(setStats)
      .catch(() => setStats({ todayEncounters: 0, activePatients: 0, aiNotesGenerated: 0, timeSaved: 0 }))

    fetch(`/api/sessions?userId=${user.userId}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setRecentEncounters((data || []).slice(0, 5)))
      .catch(() => setRecentEncounters([]))
    try {
      const ag = localStorage.getItem('cv_auto_generate')
      if (ag != null) setAutoGenerate(ag === '1')
    } catch { }
  }, [user])

  const pushToast = (message, type = 'success', timeout = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeout)
  }

  // Derive default patient name from AI or transcription
  const guessNameFromTranscription = (text) => {
    const t = String(text || '')
    // Look for "Patient [Name]" pattern
    let m = t.match(/Patient\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/)
    if (m && m[1]) return m[1]
    // Look for "name is [Name]" pattern
    m = t.match(/name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "Good morning [Name]" or "Hello [Name]" patterns
    m = t.match(/(?:Good\s+(?:morning|afternoon|evening)|Hello|Hi|Hey)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "How are you [Name]" patterns
    m = t.match(/How\s+are\s+you\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "this is [Name]" when introducing
    m = t.match(/this\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "I'm [Name]" pattern
    m = t.match(/I'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i)
    if (m && m[1]) return m[1]
    // Look for "gums [Name] your teeth" or similar dentist addressing patient
    m = t.match(/gums\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+your/i)
    if (m && m[1]) return m[1]
    // Look for dentist addressing patient directly "[Name] your teeth"
    m = t.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+your\s+(?:teeth|gums|mouth)/i)
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
    setSavePatientName(derivePatientName())
    setSaveToothNumber('')
    setSaveType('both')
    setShowSaveModal(true)
  }

  const openSaveDropdown = () => {
    setSavePatientName(derivePatientName())
    setSaveToothNumber('')
    setShowSaveDropdown(true)
  }

  const selectSaveOption = (type) => {
    setSaveType(type)
    setShowSaveDropdown(false)
    setShowSaveModal(true)
  }

  const openPatientsList = async () => {
    try {
      const res = await fetch(`/api/patients?userId=${user.userId}`)
      if (res.ok) {
        const data = await res.json()
        setPatientsList(data)
        setShowPatientsModal(true)
      } else {
        pushToast('Failed to load patients', 'error')
      }
    } catch (err) {
      console.error(err)
      pushToast('Failed to load patients', 'error')
    }
  }

  const saveTranscript = async () => {
    try {
      if (!transcription || transcription.trim().length === 0 && saveType !== 'ai') {
        pushToast('No transcript to save', 'error');
        return
      }
      if (!aiNote && (saveType === 'ai' || saveType === 'both')) {
        pushToast('No AI note generated yet', 'error');
        return
      }
      const patientName = (savePatientName || '').trim()
      const toothNumber = (saveToothNumber || '').trim()
      const dentistName = user?.userId || ''
      if (!patientName) {
        pushToast('Please enter patient name', 'error');
        return
      }

      // Generate preview text based on save type
      let previewText = ''
      if (saveType === 'ai' && aiNote) {
        previewText = formatNoteAsText(aiNote, selectedSections)
      } else if (saveType === 'raw') {
        previewText = transcription
      } else if (saveType === 'both') {
        previewText = `AI NOTE:\n${formatNoteAsText(aiNote, selectedSections)}\n\n---\n\nRAW TRANSCRIPT:\n${transcription}`
      }

      // Show preview first
      setPreviewData({ patientName, toothNumber, dentistName, transcript: transcription, aiSummary: aiNote, previewText, saveType })
      setShowSaveModal(false) // Close the save modal to prevent double modal
      setShowPreviewModal(true)
    } catch (err) {
      console.error(err)
      pushToast(err.message || 'Failed to save transcript', 'error')
    }
  }

  const confirmSave = async () => {
    try {
      const payload = {
        userId: user.userId,
        domain: 'dental',
        patientName: previewData.patientName,
        toothNumber: previewData.toothNumber,
        dentistName: previewData.dentistName,
        saveType: previewData.saveType,
        // Always include transcription to satisfy backend validation
        transcription: previewData.transcript || '[AI Note Only - No Transcript]'
      }

      // Include AI summary if needed
      if (previewData.saveType === 'ai' || previewData.saveType === 'both') {
        payload.aiSummary = previewData.aiSummary
      }

      const res = await fetch('/api/save-transcript-secure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        let msg = `Save failed (HTTP ${res.status})`
        try { const e = await res.json(); if (e && e.error) msg = e.error } catch { }
        throw new Error(msg)
      }
      pushToast('Transcript saved securely', 'success')
      setShowPreviewModal(false)
      setShowSaveModal(false)
      // refresh recent encounters
      fetch(`/api/sessions?userId=${user.userId}`).then(r => r.json()).then(d => setRecentEncounters(d.slice(0, 5))).catch(() => { })
    } catch (err) {
      pushToast(err.message || 'Failed to save', 'error')
    }
  }

  // Handle start/stop of speech recognition
  const copyNoteToClipboard = () => {
    if (!aiNote) { alert('No note to copy'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    setCopyPreview(text)
    // Close any open modals first to prevent double modal
    setShowPreviewModal(false)
    setShowSaveModal(false)
    setShowCopyModal(true)
  }

  const downloadNoteTxt = () => {
    if (!aiNote) { alert('No note to save'); return }
    const text = formatNoteAsText(aiNote, selectedSections)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const d = new Date().toISOString().slice(0, 10)
    a.download = `DentalNote_${d}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Generate PDF with Clinivoice AI template
  const generatePDF = () => {
    const content = pdfType === 'ai' && aiNote 
      ? formatNoteAsText(aiNote, selectedSections)
      : pdfType === 'raw' && transcription
        ? transcription
        : ''
    
    if (!content) {
      pushToast('No content to export', 'error')
      return
    }

    // Create a clean print window with Clinivoice template
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) {
      pushToast('Please allow popups to generate PDF', 'error')
      return
    }

    const date = new Date().toLocaleDateString()
    const patientName = derivePatientName() || 'Patient'
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Clinivoice AI - Dental Note</title>
        <style>
          @page { size: auto; margin: 20mm; }
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header { 
            text-align: center; 
            border-bottom: 3px solid #6366f1;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo { 
            font-size: 28px; 
            font-weight: bold; 
            color: #6366f1;
            margin-bottom: 5px;
          }
          .tagline { 
            font-size: 14px; 
            color: #64748b;
          }
          .meta {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .meta-row {
            display: flex;
            margin-bottom: 8px;
          }
          .meta-label {
            font-weight: bold;
            width: 120px;
            color: #475569;
          }
          .content {
            white-space: pre-wrap;
            font-size: 14px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #64748b;
            text-align: center;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">🦷 Clinivoice AI</div>
          <div class="tagline">AI-Powered Dental Documentation</div>
        </div>
        
        <div class="meta">
          <div class="meta-row">
            <span class="meta-label">Patient:</span>
            <span>${patientName}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Date:</span>
            <span>${date}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Dentist:</span>
            <span>${user?.userId || 'Unknown'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Type:</span>
            <span>${pdfType === 'ai' ? 'AI Generated Note' : 'Raw Transcript'}</span>
          </div>
        </div>
        
        <div class="content">${content.replace(/\n/g, '<br>')}</div>
        
        <div class="footer">
          Generated by Clinivoice AI | ${date}<br>
          This document is electronically generated and confidential.
        </div>
        
        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">
            🖨️ Print / Save as PDF
          </button>
        </div>
        
        <script>
          // Auto-trigger print dialog after a short delay
          setTimeout(() => {
            window.print()
          }, 500)
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
    pushToast('PDF window opened. Click Print to save.', 'success')
  }

  useEffect(() => {
    if (!isRecording) {
      // stop any existing recognition and recorder
      recognitionRef.current?.stop?.()
      try { if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop() } catch { }
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
      ; (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const recorder = new MediaRecorder(stream)
          audioChunksRef.current = []
          recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data) }
          recorder.onstop = () => {
            try {
              const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
              setAudioBlob(blob)
            } catch { }
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

  useEffect(() => {
    let timer
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      setRecordingTime(0)
    }
    return () => clearInterval(timer)
  }, [isRecording])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

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
      'header', 'chiefComplaint', 'historyOfPresentIllness', 'medicalHistory', 
      'dentalHistory', 'intraOralExamination', 'extraoralTMJExam', 'diagnosticProcedures', 
      'assessment', 'educationRecommendations', 'patientResponse', 'plan', 
      'treatmentProvided', 'prognosis'
    ])
    setSelectedSections(keys)
  }
  const clearAllSections = () => setSelectedSections(new Set())

  const toggleRecording = () => {
    if (inputSource === 'mobile' && !mobileSessionCode) {
      alert('Please start a mobile session first')
      return
    }
    setIsRecording(prev => {
      const next = !prev
      if (next) {
        setTranscription('')
        finalTranscriptRef.current = ''
      }
      return next
    })
  }

  const startMobileSession = async () => {
    try {
      const token = localStorage.getItem('clinivoice_token')
      const res = await fetch('/api/mobile/session', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const err = await res.json()
        if (res.status === 403 && err.reason === 'limit_exceeded') {
          alert(`Transcription limit reached (${err.limit}). Please upgrade your plan.`)
        } else {
          alert(err.error || 'Failed to start mobile session')
        }
        return
      }
      
      const data = await res.json()
      setMobileSessionCode(data.sessionCode)
      setShowMobileCodeModal(true)
      
      // Connect WebSocket - use current host
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsHost = window.location.host
      const wsUrl = `${wsProtocol}//${wsHost}?sessionCode=${data.sessionCode}&userId=${user.userId}&type=web`
      console.log('Connecting to WebSocket:', wsUrl)
      
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = () => {
        console.log('Connected to mobile session')
        // Request current session status
        ws.send(JSON.stringify({ type: 'get_session_status' }))
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('WebSocket received:', data.type)
        
        if (data.type === 'mobile_connected') {
          setIsMobileConnected(true)
          setInputSource('mobile')
          setShowMobileCodeModal(false)
          pushToast('Mobile device connected! Start dictation from your phone.', 'success')
        }
        else if (data.type === 'session_status') {
          // Check if mobile is already connected
          if (data.mobileConnected) {
            setIsMobileConnected(true)
            setInputSource('mobile')
            setShowMobileCodeModal(false)
          }
        }
        else if (data.type === 'session_info') {
          // Session info received, mobile might already be connected
          console.log('Session info:', data.session)
          if (data.session && data.session.status === 'active') {
            setIsMobileConnected(true)
            setInputSource('mobile')
            setShowMobileCodeModal(false)
          }
        }
        else if (data.type === 'mobile_disconnected') {
          setIsMobileConnected(false)
          setIsMobileRecording(false)
          setInputSource('computer')
          setIsRecording(false)
          pushToast('Mobile device disconnected', 'error')
        }
        else if (data.type === 'transcript') {
          console.log('Received transcript:', data.transcript, 'isFinal:', data.isFinal)
          // Only add final transcripts to avoid duplicates
          if (data.isFinal) {
            finalTranscriptRef.current += data.transcript + ' '
            setTranscription(finalTranscriptRef.current.trim())
          }
        }
        else if (data.type === 'mobile_recording_started') {
          setIsMobileRecording(true)
          // Clear previous transcript when starting new recording
          setTranscription('')
          finalTranscriptRef.current = ''
          pushToast('Mobile is recording...', 'success')
        }
        else if (data.type === 'mobile_recording_stopped') {
          setIsMobileRecording(false)
        }
        else if (data.type === 'mobile_stopped') {
          setIsMobileRecording(false)
          setIsMobileConnected(false)
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      ws.onclose = () => {
        console.log('WebSocket closed')
        // Don't close modal on WebSocket disconnect - let user manually close
        // setMobileSessionCode(null)
      }
      
      mobileWsRef.current = ws
      
    } catch (err) {
      console.error('Error starting mobile session:', err)
      alert('Failed to start mobile session')
    }
  }

  const stopMobileSession = async () => {
    try {
      if (mobileWsRef.current) {
        mobileWsRef.current.send(JSON.stringify({ type: 'stop_recording' }))
        mobileWsRef.current.close()
        mobileWsRef.current = null
      }
      
      if (mobileSessionCode) {
        const token = localStorage.getItem('clinivoice_token')
        await fetch(`/api/mobile/session/${mobileSessionCode}/close`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      }
      
      setMobileSessionCode(null)
      setIsMobileConnected(false)
      setShowMobileCodeModal(false)
      
    } catch (err) {
      console.error('Error stopping mobile session:', err)
    }
  }

  useEffect(() => {
    // Check for active mobile session on load
    const checkActiveSession = async () => {
      try {
        const token = localStorage.getItem('clinivoice_token')
        const res = await fetch('/api/mobile/active', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.active) {
          setMobileSessionCode(data.sessionCode)
          setIsMobileConnected(true)
        }
      } catch (err) {
        console.log('No active mobile session')
      }
    }
    checkActiveSession()
    
    return () => {
      if (mobileWsRef.current) {
        mobileWsRef.current.close()
      }
    }
  }, [])

  // Auto-generate when recording stops with transcription
  useEffect(() => {
    if (!autoGenerate) return
    if (!isRecording && transcription.trim().length > 20 && !aiNote && !isGenerating) {
      const timer = setTimeout(() => { handleGenerate() }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isRecording, transcription, autoGenerate])

  // ESC key handler to close modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showPreviewModal) setShowPreviewModal(false)
        if (showSaveModal) setShowSaveModal(false)
        if (showPatientsModal) setShowPatientsModal(false)
        if (showSettings) setShowSettings(false)
        if (showCopyModal) setShowCopyModal(false)
        if (viewingEncounter) setViewingEncounter(null)
        if (showQuickActions) setShowQuickActions(false)
        if (showSaveDropdown) setShowSaveDropdown(false)
        if (showNotifPanel) setShowNotifPanel(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [showPreviewModal, showSaveModal, showPatientsModal, showSettings, showCopyModal, viewingEncounter, showQuickActions, showSaveDropdown, showNotifPanel])

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClick = (e) => {
      if (showQuickActions && !e.target.closest('.dropdown-menu') && !e.target.closest('.nav-item')) {
        setShowQuickActions(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showQuickActions])

  const handleGenerate = async () => {
    if (!transcription || transcription.trim().length === 0) {
      alert('Please record or type some text first')
      return
    }

    setIsGenerating(true)
    try {
      console.log('🚀 Sending generate request...')

      // Get JWT token from localStorage
      const token = localStorage.getItem('clinivoice_token')
      if (!token) {
        alert('Session expired. Please login again.')
        onLogout()
        return
      }

      const res = await fetch('/api/generate-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transcription: transcription.trim(),
          domain: 'dental',
          userId: user.userId
        })
      })

      if (!res.ok) {
        const error = await res.json()

        // Handle subscription limit errors specifically
        if (res.status === 403 && error.reason === 'limit_exceeded') {
          alert(`⚠️ Subscription Limit Reached\n\nYou've used ${error.usage} of ${error.limit} transcriptions this month.\n\nPlease upgrade your plan to continue.`)
          return
        }

        if (res.status === 401) {
          alert('Session expired. Please login again.')
          onLogout()
          return
        }

        throw new Error(error.error || 'Generation failed')
      }

      const note = await res.json()
      console.log('✅ Note received:', note)

      // Fix dentist name to use logged-in username if placeholder
      if (!note.dentist || note.dentist === '[Dentist Name]' || note.dentist.includes('[Dentist') || note.dentist.includes('Dentist Name')) {
        note.dentist = user?.userId || 'Dr. [Name]'
      }

      // Try to extract patient name from transcription if placeholder
      if (!note.patient || note.patient === '[Patient Name]' || note.patient.includes('[Patient')) {
        const extractedName = guessNameFromTranscription(transcription)
        note.patient = extractedName || '[Patient Name]'
      }

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

  // Build a paste-friendly plain text for dental notes - matching user's template format exactly
  const formatNoteAsText = (note, selected) => {
    if (!note) return ''
    const hasSel = selected && selected.size > 0
    const include = (k) => !hasSel || selected.has(k)
    
    const parts = []
    
    // Header section - always include if header is selected or nothing is selected
    if (include('header')) {
      const headerLines = []
      const patientName = note.patient || note.patientInfo?.name || derivePatientName() || '[Patient Name]'
      const date = note.date || new Date().toLocaleDateString()
      const dentist = note.dentist || note.patientInfo?.provider || user?.userId || '[Dentist Name]'
      const visitType = note.visitType || note.patientInfo?.visitType || 'Routine Dental Examination & Consultation'
      
      headerLines.push(`Patient: ${patientName}`)
      headerLines.push(`Date: ${date}`)
      headerLines.push(`Dentist: ${dentist}`)
      headerLines.push(`Visit Type: ${visitType}`)
      
      parts.push(headerLines.join('\n'))
    }
    
    // Helper to add section if content exists and is selected
    const addSection = (key, title, content) => {
      if (!include(key)) return
      const text = String(content || '').trim()
      if (!text || text === '-' || text === '[object Object]') return
      parts.push(`${title}:\n\n${text}`)
    }
    
    // Chief Complaint
    if (note.chiefComplaint) {
      addSection('chiefComplaint', 'Chief Complaint', note.chiefComplaint)
    }
    
    // History of Present Illness
    if (note.historyOfPresentIllness) {
      addSection('historyOfPresentIllness', 'History of Present Illness', note.historyOfPresentIllness)
    }
    
    // Medical History
    if (note.medicalHistory && include('medicalHistory')) {
      if (typeof note.medicalHistory === 'object') {
        const medParts = []
        if (note.medicalHistory.allergies) medParts.push(`Allergies: ${note.medicalHistory.allergies}`)
        if (note.medicalHistory.disorders) medParts.push(`Disorders: ${note.medicalHistory.disorders}`)
        if (note.medicalHistory.psychosocial) medParts.push(`Psychosocial: ${note.medicalHistory.psychosocial}`)
        if (medParts.length > 0) {
          parts.push(`Medical History:\n\n${medParts.join('\n')}`)
        }
      } else {
        addSection('medicalHistory', 'Medical History', note.medicalHistory)
      }
    }
    
    // Dental History
    if (note.dentalHistory) {
      addSection('dentalHistory', 'Dental History', note.dentalHistory)
    }
    
    // Intraoral Examination (from either new field or TMJ exam for now)
    if (note.intraOralExamination && include('intraOralExamination')) {
      addSection('intraOralExamination', 'Intraoral Examination', note.intraOralExamination)
    }
    
    // Extraoral & TMJ Examination (TMJ-specific notes)
    if (note.extraoralTMJExam && include('extraoralTMJExam')) {
      const tmjParts = []
      if (typeof note.extraoralTMJExam === 'object') {
        if (note.extraoralTMJExam.musclePalpation) {
          const muscleParts = []
          if (note.extraoralTMJExam.musclePalpation.temporalisRight) 
            muscleParts.push(`Temporalis Right: ${note.extraoralTMJExam.musclePalpation.temporalisRight}`)
          if (note.extraoralTMJExam.musclePalpation.temporalisLeft) 
            muscleParts.push(`Temporalis Left: ${note.extraoralTMJExam.musclePalpation.temporalisLeft}`)
          if (note.extraoralTMJExam.musclePalpation.masseterRight) 
            muscleParts.push(`Masseter Right: ${note.extraoralTMJExam.musclePalpation.masseterRight}`)
          if (note.extraoralTMJExam.musclePalpation.masseterLeft) 
            muscleParts.push(`Masseter Left: ${note.extraoralTMJExam.musclePalpation.masseterLeft}`)
          if (muscleParts.length > 0) tmjParts.push(`Muscle Palpation:\n${muscleParts.join('\n')}`)
        }
        if (note.extraoralTMJExam.tmjEvaluation) 
          tmjParts.push(`TMJ Evaluation: ${note.extraoralTMJExam.tmjEvaluation}`)
      }
      if (tmjParts.length > 0) {
        parts.push(`Extraoral & TMJ Examination:\n\n${tmjParts.join('\n\n')}`)
      }
    }
    
    // Diagnostic Procedures
    if (note.diagnosticProcedures) {
      addSection('diagnosticProcedures', 'Diagnostic Procedures', note.diagnosticProcedures)
    }
    
    // Assessment (Diagnosis)
    if (note.assessment || note.diagnosis) {
      const assessmentText = note.assessment || note.diagnosis
      addSection('assessment', 'Assessment', assessmentText)
    }
    
    // Education & Recommendations
    if (note.educationRecommendations) {
      addSection('educationRecommendations', 'Education & Recommendations', note.educationRecommendations)
    }
    
    // Patient Response
    if (note.patientResponse) {
      addSection('patientResponse', 'Patient Response', note.patientResponse)
    }
    
    // Plan (Treatment Plan)
    if (note.plan || note.treatmentPlan) {
      const planText = note.plan || note.treatmentPlan
      addSection('plan', 'Plan', planText)
    }
    
    // Treatment Provided (if different from diagnostic procedures)
    if (note.treatmentProvided) {
      addSection('treatmentProvided', 'Treatment Provided', note.treatmentProvided)
    }
    
    // Prognosis
    if (note.prognosis) {
      addSection('prognosis', 'Prognosis', note.prognosis)
    }
    
    return parts.join('\n\n')
  }

  return (
    <div className="app-container">
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
      
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/desktop/clinivoice-logo.png" alt="Clinvoice AI" className="sidebar-logo" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div className="sidebar-brand-text">
            <strong>Clinvoice AI</strong>
            <small>Powered by Gemini</small>
          </div>
        </div>

        <div className="sidebar-search">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search patients..." 
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Workspace</div>
          <a href="#" className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setCurrentPage('dashboard') }}>
            <span className="nav-icon">🏠</span>
            <span>Dashboard</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setCurrentPage('dashboard'); setTimeout(() => document.querySelector('.encounters-table')?.scrollIntoView({ behavior: 'smooth' }), 100) }}>
            <span className="nav-icon">📋</span>
            <span>Encounters</span>
            {recentEncounters.length > 0 && <span className="nav-badge">{recentEncounters.length}</span>}
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); openPatientsList() }}>
            <span className="nav-icon">👥</span>
            <span>Patients</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setCurrentPage('dashboard'); setTimeout(() => document.querySelector('.mic-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}>
            <span className="nav-icon">🎙</span>
            <span>Live Dictation</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setCurrentPage('dashboard'); setTimeout(() => document.querySelector('.note-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100) }}>
            <span className="nav-icon">📄</span>
            <span>Notes & Reports</span>
          </a>

          <div className="nav-section-label" style={{ marginTop: '8px' }}>Management</div>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setShowQuickActions(!showQuickActions) }}>
            <span className="nav-icon">⚡</span>
            <span>Quick Actions</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); alert('📊 Analytics\n\nToday\'s Encounters: ' + stats.todayEncounters + '\nActive Patients: ' + stats.activePatients + '\nAI Notes Generated: ' + stats.aiNotesGenerated + '\nTime Saved: ' + stats.timeSaved + 'h') }}>
            <span className="nav-icon">📊</span>
            <span>Analytics</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setShowSettings(true) }}>
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </a>
          
          <div className="nav-section-label" style={{ marginTop: '8px' }}>Info</div>
          <a href="#" className={`nav-item ${currentPage === 'about' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setCurrentPage('about') }}>
            <span className="nav-icon">ℹ️</span>
            <span>About</span>
          </a>
          <a href="#" className={`nav-item ${currentPage === 'pricing' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setCurrentPage('pricing') }}>
            <span className="nav-icon">💰</span>
            <span>Pricing</span>
          </a>
          
          {user.userId === 'admin' && (
            <>
              <div className="nav-section-label" style={{ marginTop: '8px' }}>Admin</div>
              <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setShowAdmin(true) }}>
                <span className="nav-icon">👑</span>
                <span>Admin Portal</span>
              </a>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">{user.userId.slice(0, 2).toUpperCase()}</div>
            <div className="user-info">
              <strong>{user.userId}</strong>
              <small>{user.domain || 'Clinician'}</small>
            </div>
            <span className="user-logout" onClick={onLogout} title="Logout">⏻</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topnav">
          <div className="topnav-title">{currentPage === 'about' ? 'About' : currentPage === 'pricing' ? 'Pricing' : 'Dashboard'}</div>
          <div className="topnav-actions">
            <button className="btn btn-primary" onClick={toggleRecording}>
              {isRecording ? '⏹️ Stop Recording' : '＋ New Encounter'}
            </button>
            <button className="notif-btn" onClick={() => setShowNotifPanel(!showNotifPanel)}>
              🔔
              <span className="notif-dot"></span>
            </button>
            <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {showNotifPanel && (
          <div className="notif-panel open">
            <div className="notif-panel-header">
              Notifications
              <span className="mark-read" onClick={() => setShowNotifPanel(false)}>Mark all read</span>
            </div>
            <div className="notif-item">
              <div className="notif-item-dot"></div>
              <div className="notif-item-body">
                <div>Welcome to Clinvoice AI!</div>
                <div className="notif-item-time">Just now</div>
              </div>
            </div>
            <div className="notif-item">
              <div className="notif-item-dot" style={{ background: '#f59e0b' }}></div>
              <div className="notif-item-body">
                <div>AI model updated to Gemini Pro</div>
                <div className="notif-item-time">System</div>
              </div>
            </div>
          </div>
        )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ Settings</h2>
            <div className="settings-section">
              <p><strong>User:</strong> {user.userId}</p>
              <p><strong>Domain:</strong> {user.domain}</p>
              <p><strong>Theme:</strong> {theme}</p>
              <p><strong>AI Model:</strong> Google Gemini Pro</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={autoGenerate} onChange={(e) => { setAutoGenerate(e.target.checked); try { localStorage.setItem('cv_auto_generate', e.target.checked ? '1' : '0') } catch { } }} />
                Auto-generate note when recording stops
              </label>
            </div>
            <button onClick={() => setShowSettings(false)} className="modal-close-btn">Close</button>
          </div>
        </div>
      )}

      {showTranscriptView && (
        <div className="modal-overlay" onClick={() => setShowTranscriptView(false)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📝 Transcript</h2>
            <textarea className="copy-preview-text" value={transcriptViewText} readOnly />
            <div className="note-actions">
              <button className="pdf-btn" onClick={() => { navigator.clipboard.writeText(transcriptViewText); pushToast('Copied to clipboard', 'success') }}>Copy</button>
              <button className="pdf-btn" onClick={() => setShowTranscriptView(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <h3>📋 Select Sections to Copy</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, maxHeight: 200, overflowY: 'auto', padding: 8, background: 'var(--surface2)', borderRadius: 8 }}>
              {[
                { key: 'header', label: '📝 Header', emoji: '📝' },
                { key: 'chiefComplaint', label: '🦷 Chief Complaint', emoji: '🦷' },
                { key: 'historyOfPresentIllness', label: '📋 History of Present Illness', emoji: '📋' },
                { key: 'medicalHistory', label: '⚕️ Medical History', emoji: '⚕️' },
                { key: 'dentalHistory', label: '🪥 Dental History', emoji: '🪥' },
                { key: 'intraOralExamination', label: '👁️ Intraoral Examination', emoji: '👁️' },
                { key: 'diagnosticProcedures', label: '🔬 Diagnostic Procedures', emoji: '🔬' },
                { key: 'assessment', label: '📊 Assessment', emoji: '📊' },
                { key: 'educationRecommendations', label: '📚 Education & Recommendations', emoji: '📚' },
                { key: 'patientResponse', label: '💬 Patient Response', emoji: '💬' },
                { key: 'plan', label: '📋 Plan', emoji: '📋' },
              ].map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: 4 }}>
                  <input type="checkbox" checked={isSelected(s.key)} onChange={() => toggleSection(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
              <button onClick={selectAllSections} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}>Select All</button>
              <button onClick={clearAllSections} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}>Clear All</button>
            </div>
            <textarea className="copy-preview-text" value={copyPreview} onChange={(e) => setCopyPreview(e.target.value)} placeholder="Select sections above and click Preview" />
            <div className="note-actions">
              <button className="pdf-btn" onClick={async () => { try { await navigator.clipboard.writeText(copyPreview); } catch { alert('Copy failed'); } }}>Copy</button>
              <button className="save-note-btn" onClick={() => { navigator.clipboard.writeText(copyPreview).then(() => setShowCopyModal(false)); }}>Copy & Close</button>
              <button className="pdf-btn" onClick={() => setShowCopyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>💾 Save {saveType === 'ai' ? 'AI Note' : saveType === 'raw' ? 'Raw Transcript' : 'Both'}</h2>
            <div className="settings-section">
              <p><strong>Instructions:</strong> Enter patient name and tooth number to save securely. Dentist: <strong>{user?.userId}</strong></p>
              <label>
                Patient Name
                <input type="text" value={savePatientName} onChange={e => setSavePatientName(e.target.value)} className="mrn-input" placeholder="e.g., John Doe" />
              </label>
              <label>
                Tooth Number / Area
                <input type="text" value={saveToothNumber} onChange={e => setSaveToothNumber(e.target.value)} className="mrn-input" placeholder="e.g., Lower right molar #30" />
              </label>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={saveTranscript}>✅ Preview & Save</button>
              <button className="pdf-btn" onClick={() => setShowSaveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '85vh' }}>
            <h2>🔒 Preview - {previewData?.saveType === 'ai' ? 'AI Note Only' : previewData?.saveType === 'raw' ? 'Raw Transcript Only' : 'Both AI & Raw'}</h2>
            <div className="settings-section" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <label style={{ marginBottom: '12px', display: 'block' }}>
                <strong>Patient:</strong>
                <input
                  type="text"
                  value={previewData?.patientName || ''}
                  onChange={(e) => setPreviewData(prev => ({ ...prev, patientName: e.target.value }))}
                  className="mrn-input"
                  style={{ marginTop: '6px', display: 'block', width: '100%', padding: '8px 12px', fontSize: '14px' }}
                  placeholder="Enter patient name"
                />
              </label>
              <label style={{ marginBottom: '12px', display: 'block' }}>
                <strong>Tooth Number/Area:</strong>
                <input
                  type="text"
                  value={previewData?.toothNumber || ''}
                  onChange={(e) => setPreviewData(prev => ({ ...prev, toothNumber: e.target.value }))}
                  className="mrn-input"
                  style={{ marginTop: '6px', display: 'block', width: '100%', padding: '8px 12px', fontSize: '14px' }}
                  placeholder="e.g., Lower right molar #30"
                />
              </label>
              <p><strong>Dentist:</strong> {previewData?.dentistName}</p>
              <p><strong>Save Type:</strong> {previewData?.saveType === 'ai' ? '🤖 AI Note Only' : previewData?.saveType === 'raw' ? '📝 Raw Transcript Only' : '📋 Both AI & Raw'}</p>
              
              {/* Editable preview text area */}
              <label style={{ marginTop: '16px', display: 'block' }}>
                <strong>Preview Content (Editable):</strong>
                <textarea
                  value={previewData?.previewText || ''}
                  onChange={(e) => setPreviewData(prev => ({ ...prev, previewText: e.target.value }))}
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    marginTop: '8px',
                    padding: '12px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    resize: 'vertical'
                  }}
                  placeholder="Preview content will appear here..."
                />
              </label>
              
              <small style={{ color: '#64748b', display: 'block', marginTop: '10px' }}>This will be saved securely with encryption.</small>
            </div>
            <div className="note-actions">
              <button className="save-note-btn" onClick={confirmSave}>🔒 Confirm Save</button>
              <button className="pdf-btn" onClick={() => {
                // Go back to save modal with current data
                setSavePatientName(previewData?.patientName || '')
                setSaveToothNumber(previewData?.toothNumber || '')
                setSaveType(previewData?.saveType || 'both')
                setShowPreviewModal(false)
                setShowSaveModal(true)
              }}>← Back to Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {showPdfModal && (
        <div className="modal-overlay" onClick={() => setShowPdfModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>📄 Export PDF</h2>
            <div className="settings-section">
              <p style={{ marginBottom: '20px' }}>Select what content to include in the PDF:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '16px', 
                  border: pdfType === 'ai' ? '2px solid var(--brand-purple)' : '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: pdfType === 'ai' ? 'rgba(124,58,237,0.08)' : 'var(--surface2)'
                }}>
                  <input 
                    type="radio" 
                    name="pdfType" 
                    value="ai" 
                    checked={pdfType === 'ai'}
                    onChange={() => setPdfType('ai')}
                    disabled={!aiNote}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>🤖 AI Generated Note Only</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>
                      {aiNote ? 'Include only the AI-structured note' : 'Generate AI note first'}
                    </div>
                  </div>
                </label>
                
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '16px', 
                  border: pdfType === 'raw' ? '2px solid var(--brand-purple)' : '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: pdfType === 'raw' ? 'rgba(124,58,237,0.08)' : 'var(--surface2)'
                }}>
                  <input 
                    type="radio" 
                    name="pdfType" 
                    value="raw" 
                    checked={pdfType === 'raw'}
                    onChange={() => setPdfType('raw')}
                    disabled={!transcription}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>📝 Raw Transcript Only</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>
                      {transcription ? 'Include only the original transcript' : 'Record or type transcript first'}
                    </div>
                  </div>
                </label>
              </div>
              
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                The PDF will include the Clinivoice AI template with logo at the top.
              </p>
            </div>
            <div className="note-actions">
              <button 
                className="save-note-btn" 
                onClick={() => {
                  generatePDF()
                  setShowPdfModal(false)
                }}
                disabled={(pdfType === 'ai' && !aiNote) || (pdfType === 'raw' && !transcription)}
              >
                📄 Generate PDF
              </button>
              <button className="pdf-btn" onClick={() => setShowPdfModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPatientsModal && (
        <div className="modal-overlay" onClick={() => setShowPatientsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>👥 Active Patients</h2>
            <div className="settings-section">
              {patientsList.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Phone</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientsList.map(p => (
                      <tr key={p.id}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{p.name}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{p.phone || '-'}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>{p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No patients found.</p>
              )}
            </div>
            <div className="note-actions">
              <button className="pdf-btn" onClick={() => setShowPatientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showQuickActions && (
        <div className="dropdown-menu">
          <button onClick={() => { setTranscription(''); setAiNote(null); setShowQuickActions(false); }}>
            🆕 New Dictation
          </button>
          <button onClick={() => { copyNoteToClipboard(); setShowQuickActions(false); }}>📋 Copy selected</button>
          <button onClick={() => { downloadNoteTxt(); setShowQuickActions(false); }}>💾 Save selected (.txt)</button>
          <button onClick={() => { selectAllSections(); setShowQuickActions(false); }}>✅ Select all sections</button>
          <button onClick={() => { clearAllSections(); setShowQuickActions(false); }}>🧹 Clear selections</button>
          <button onClick={() => { window.print(); setShowQuickActions(false); }}>🖨️ Print Note</button>
          <button onClick={() => { alert('📊 Statistics\n\nToday\'s Encounters: ' + stats.todayEncounters + '\nActive Patients: ' + stats.activePatients + '\nAI Notes Generated: ' + stats.aiNotesGenerated + '\nTime Saved: ' + stats.timeSaved + 'h'); setShowQuickActions(false); }}>📊 View Statistics</button>
          <button onClick={() => setShowQuickActions(false)}>❌ Close</button>
        </div>
      )}

      {showSaveDropdown && (
        <div className="dropdown-menu" style={{ position: 'fixed', top: '380px', right: '48px', zIndex: 100 }}>
          <button onClick={() => selectSaveOption('ai')} disabled={!aiNote}>
            🤖 AI Note Only {aiNote ? '' : '(Generate first)'}
          </button>
          <button onClick={() => selectSaveOption('raw')} disabled={!transcription}>
            📝 Raw Transcript Only {transcription ? '' : '(No transcript)'}
          </button>
          <button onClick={() => selectSaveOption('both')} disabled={!aiNote || !transcription}>
            📋 Both AI & Raw {aiNote && transcription ? '' : '(Need both)'}
          </button>
          <button onClick={() => setShowSaveDropdown(false)}>❌ Close</button>
        </div>
      )}

      {showMobileCodeModal && mobileSessionCode && (
        <div className="modal-overlay" onClick={() => setShowMobileCodeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h2>📱 Connect Mobile Device</h2>
            <div className="settings-section">
              <p>Scan this QR code with your phone camera:</p>
              <div style={{ 
                padding: '20px',
                background: 'white',
                borderRadius: '12px',
                margin: '20px 0',
                display: 'inline-block'
              }}>
                <QRCodeSVG 
                  value={`${window.location.origin}/mobile?code=${mobileSessionCode}&user=${user.userId}`}
                  size={200}
                  level={"H"}
                />
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-3)', marginTop: '16px' }}>
                Or enter this code manually in the mobile app:
              </p>
              <div style={{ 
                fontSize: '36px', 
                fontWeight: 'bold', 
                letterSpacing: '8px', 
                padding: '16px',
                background: 'var(--surface2)',
                borderRadius: '8px',
                margin: '10px 0',
                fontFamily: 'monospace'
              }}>
                {mobileSessionCode}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '16px' }}>
                Session expires in 15 minutes
              </p>
            </div>
            <div className="note-actions">
              <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(mobileSessionCode); pushToast('Code copied!', 'success'); }}>
                📋 Copy Code
              </button>
              <button className="pdf-btn" onClick={() => setShowMobileCodeModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="content">
        {currentPage === 'about' && <About />}
        {currentPage === 'pricing' && <Pricing user={user} />}
        
        {currentPage === 'dashboard' && (
          <>
            {showOnboarding && stats.todayEncounters === 0 && stats.aiNotesGenerated === 0 && (
              <div className="onboarding">
                <div className="onboarding-icon">🚀</div>
                <div className="onboarding-text">
                  <strong>Get started with Clinvoice AI</strong>
                  <span>Add your first patient, start a dictation, or configure your note templates.</span>
                </div>
                <div className="onboarding-actions">
                  <button className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => setShowOnboarding(false)}>Dismiss</button>
                </div>
              </div>
            )}

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.12)' }}>📅</div>
                <div className="stat-body">
                  <div className="stat-label">Today's Encounters</div>
                  <div className="stat-value">{stats.todayEncounters}</div>
                  <div className="stat-sub">{stats.todayEncounters > 0 ? 'Active today' : 'No activity yet today'}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}>👥</div>
                <div className="stat-body">
                  <div className="stat-label">Active Patients</div>
                  <div className="stat-value">{stats.activePatients}</div>
                  <div className="stat-sub">{stats.activePatients > 0 ? 'Total registered' : 'Add your first patient'}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(244,114,182,0.12)' }}>✨</div>
                <div className="stat-body">
                  <div className="stat-label">AI Notes Generated</div>
                  <div className="stat-value">{stats.aiNotesGenerated}</div>
                  <div className="stat-sub">{stats.aiNotesGenerated > 0 ? 'Avg 90% accuracy' : 'Generate your first note'}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>⏱</div>
                <div className="stat-body">
                  <div className="stat-label">Time Saved</div>
                  <div className="stat-value">{stats.timeSaved}h</div>
                  <div className="stat-sub">{stats.timeSaved > 0 ? 'Documentation automated' : 'Start saving time'}</div>
                </div>
              </div>
            </div>

            <div className="recent-patients">
              <div className="section-header">
                <div className="section-title">Recent Patients</div>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '5px 10px' }} onClick={openPatientsList}>View all →</button>
              </div>
              <div className="patient-chips">
                {recentEncounters.slice(0, 3).map(enc => (
                  <div key={enc.id} className="patient-chip" onClick={() => setViewingEncounter(enc)}>
                    <div className="patient-chip-avatar">{(enc.patient_name || 'UN').slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="patient-chip-name">{enc.patient_name || 'Unknown'}</div>
                      <div className="patient-chip-time">{new Date(enc.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
                <div className="patient-chip" style={{ borderStyle: 'dashed' }} onClick={openSaveTranscript}>
                  <div className="patient-chip-avatar" style={{ background: 'var(--surface2)', color: 'var(--text-3)', fontSize: '18px' }}>＋</div>
                  <div>
                    <div className="patient-chip-name" style={{ color: 'var(--text-3)' }}>Add Patient</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="panels-grid">
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-icon" style={{ background: 'rgba(16,185,129,0.12)' }}>🎙</div>
                  <div>
                    <div className="panel-title">Live Dictation</div>
                    <div className="panel-sub">Powered by AI transcription</div>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="input-source-selector" style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '8px' }}>Select Input Source:</div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="inputSource" 
                          value="computer" 
                          checked={inputSource === 'computer'} 
                          onChange={(e) => { setInputSource(e.target.value); stopMobileSession(); }}
                        />
                        💻 Computer Microphone
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="inputSource" 
                          value="mobile" 
                          checked={inputSource === 'mobile'} 
                          onChange={(e) => setInputSource(e.target.value)}
                        />
                        📱 Mobile Microphone
                      </label>
                    </div>
                    
                    {inputSource === 'mobile' && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                        {!mobileSessionCode ? (
                          <button 
                            className="btn btn-primary" 
                            onClick={startMobileSession}
                            style={{ fontSize: '13px', padding: '8px 16px' }}
                          >
                            📱 Start Mobile Session
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px' }}>
                              {isMobileConnected ? (
                                <span style={{ color: '#10b981', fontWeight: 600 }}>🟢 Mobile Connected</span>
                              ) : (
                                <span style={{ color: '#f59e0b' }}>🟡 Waiting for mobile...</span>
                              )}
                            </span>
                            <button 
                              className="btn btn-ghost" 
                              onClick={() => setShowMobileCodeModal(true)}
                              style={{ fontSize: '12px', padding: '4px 8px' }}
                            >
                              Show Code
                            </button>
                            <button 
                              className="btn btn-ghost" 
                              onClick={stopMobileSession}
                              style={{ fontSize: '12px', padding: '4px 8px', color: '#ef4444' }}
                            >
                              Stop
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mic-row">
                    {inputSource === 'mobile' && isMobileConnected ? (
                      <>
                        <button className={`mic-btn ${isMobileRecording ? 'recording' : ''}`} disabled style={{ opacity: 0.5 }}>
                          📱
                        </button>
                        {isMobileRecording && (
                          <div className="audio-level">
                            <div className="audio-bar" style={{ '--h': '8px', animationDelay: '0s' }}></div>
                            <div className="audio-bar" style={{ '--h': '18px', animationDelay: '0.1s' }}></div>
                            <div className="audio-bar" style={{ '--h': '12px', animationDelay: '0.2s' }}></div>
                            <div className="audio-bar" style={{ '--h': '22px', animationDelay: '0.3s' }}></div>
                            <div className="audio-bar" style={{ '--h': '10px', animationDelay: '0.4s' }}></div>
                            <div className="audio-bar" style={{ '--h': '16px', animationDelay: '0.5s' }}></div>
                            <div className="audio-bar" style={{ '--h': '20px', animationDelay: '0.6s' }}></div>
                            <div className="audio-bar" style={{ '--h': '8px', animationDelay: '0.7s' }}></div>
                          </div>
                        )}
                        <div className="mic-info">
                          <div className="mic-label" style={{ color: '#10b981' }}>🟢 Mobile Connected {isMobileRecording ? '- Recording Active' : ''}</div>
                          <div className="mic-sub">Use your phone to dictate. Speak into your phone microphone.</div>
                        </div>
                        {isRecording && <div className="rec-timer">{formatTime(recordingTime)}</div>}
                      </>
                    ) : inputSource === 'mobile' && mobileSessionCode ? (
                      <>
                        <button className="mic-btn" disabled style={{ opacity: 0.5 }}>
                          📱
                        </button>
                        <div className="mic-info">
                          <div className="mic-label" style={{ color: '#f59e0b' }}>🟡 Waiting for mobile...</div>
                          <div className="mic-sub">Open the link on your phone and tap the microphone to start dictation</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <button className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
                          {isRecording ? '⏹' : '🎙'}
                        </button>
                        <div className="mic-info">
                          <div className="mic-label">{isRecording ? 'Recording in progress...' : 'Click mic to start recording'}</div>
                          <div className="mic-sub">{isRecording ? 'Speak clearly into your microphone' : 'Your words will appear in real-time'}</div>
                        </div>
                        {isRecording && <div className="rec-timer">{formatTime(recordingTime)}</div>}
                      </>
                    )}
                  </div>

                  {isRecording && (
                    <div className="audio-level">
                      <div className="audio-bar" style={{ '--h': '8px', animationDelay: '0s' }}></div>
                      <div className="audio-bar" style={{ '--h': '18px', animationDelay: '0.1s' }}></div>
                      <div className="audio-bar" style={{ '--h': '12px', animationDelay: '0.2s' }}></div>
                      <div className="audio-bar" style={{ '--h': '22px', animationDelay: '0.3s' }}></div>
                      <div className="audio-bar" style={{ '--h': '10px', animationDelay: '0.4s' }}></div>
                      <div className="audio-bar" style={{ '--h': '16px', animationDelay: '0.5s' }}></div>
                      <div className="audio-bar" style={{ '--h': '20px', animationDelay: '0.6s' }}></div>
                      <div className="audio-bar" style={{ '--h': '8px', animationDelay: '0.7s' }}></div>
                    </div>
                  )}

                  <textarea
                    className="dictation-textarea"
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    placeholder={inputSource === 'mobile' && mobileSessionCode ? "Transcription will appear here automatically as you speak on your phone..." : "Click the mic to start recording..."}
                    readOnly={inputSource === 'mobile' && isMobileConnected}
                  />

                  <div className="upload-zone">
                    <span>📁</span>
                    <span>Or upload an audio file (MP3, WAV, M4A)</span>
                    <input type="file" accept=".mp3,.wav,.m4a,audio/*" style={{ display: 'none' }} />
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div className="panel-icon" style={{ background: 'rgba(124,58,237,0.12)' }}>📄</div>
                  <div>
                    <div className="panel-title">AI-Generated Note</div>
                    <div className="panel-sub">Dental format</div>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="note-actions">
                    <button className="btn btn-generate" onClick={handleGenerate} disabled={!transcription || isGenerating}>
                      {isGenerating ? (
                        <><span className="loading-spinner"></span>Processing...</>
                      ) : (
                        <>✨ Generate <span className="shortcut-hint">⌘G</span></>
                      )}
                    </button>
                    <button className="btn btn-copy" onClick={copyNoteToClipboard} disabled={!aiNote}>
                      📋 Copy <span className="shortcut-hint">⌘C</span>
                    </button>
                    <button className="btn btn-pdf" onClick={() => setShowPdfModal(true)} disabled={!aiNote && !transcription}>
                      📄 PDF
                    </button>
                    <button className="btn btn-save" onClick={openSaveDropdown} disabled={!aiNote && !transcription}>
                      💾 Save ▾
                    </button>
                  </div>

                  {aiNote ? (
                    <div className="note-preview">
                      {/* Patient Information Header */}
                      {aiNote.patientInfo && (
                        <div className="note-header-bar">
                          <div className="note-header-item"><strong>Patient:</strong> {aiNote.patientInfo.name}</div>
                          <div className="note-header-item"><strong>Provider:</strong> {aiNote.patientInfo.provider}</div>
                          <div className="note-header-item"><strong>Visit Type:</strong> {aiNote.patientInfo.visitType}</div>
                          {aiNote.patientInfo.referralSource && (
                            <div className="note-header-item"><strong>Referral:</strong> {aiNote.patientInfo.referralSource}</div>
                          )}
                        </div>
                      )}
                      
                      {/* Chief Complaint */}
                      {aiNote.chiefComplaint && (
                        <div 
                          className={`soap-section section-chiefComplaint ${isSelected('chiefComplaint') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('chiefComplaint')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">🦷</span>
                            <strong>Chief Complaint (CC)</strong>
                            {isSelected('chiefComplaint') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('chiefComplaint'); }}>{isSelected('chiefComplaint') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.chiefComplaint}</p>
                        </div>
                      )}

                      {/* History of Present Illness */}
                      {aiNote.historyOfPresentIllness && (
                        <div 
                          className={`soap-section section-historyOfPresentIllness ${isSelected('historyOfPresentIllness') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('historyOfPresentIllness')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">📋</span>
                            <strong>History of Present Illness (HPI)</strong>
                            {isSelected('historyOfPresentIllness') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('historyOfPresentIllness'); }}>{isSelected('historyOfPresentIllness') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.historyOfPresentIllness}</p>
                        </div>
                      )}

                      {/* Medical History */}
                      {aiNote.medicalHistory && (
                        <div 
                          className={`soap-section section-medicalHistory ${isSelected('medicalHistory') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('medicalHistory')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">⚕️</span>
                            <strong>Medical History</strong>
                            {isSelected('medicalHistory') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('medicalHistory'); }}>{isSelected('medicalHistory') ? 'Selected' : 'Select'}</button>
                          {typeof aiNote.medicalHistory === 'object' ? (
                            <div>
                              {aiNote.medicalHistory.allergies && <p><strong>Allergies:</strong> {aiNote.medicalHistory.allergies}</p>}
                              {aiNote.medicalHistory.disorders && <p><strong>Disorders:</strong> {aiNote.medicalHistory.disorders}</p>}
                              {aiNote.medicalHistory.psychosocial && <p><strong>Psychosocial:</strong> {aiNote.medicalHistory.psychosocial}</p>}
                            </div>
                          ) : (
                            <p style={{ whiteSpace: 'pre-line' }}>{aiNote.medicalHistory}</p>
                          )}
                        </div>
                      )}

                      {/* Dental History */}
                      {aiNote.dentalHistory && (
                        <div 
                          className={`soap-section section-dentalHistory ${isSelected('dentalHistory') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('dentalHistory')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">🪥</span>
                            <strong>Dental History</strong>
                            {isSelected('dentalHistory') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('dentalHistory'); }}>{isSelected('dentalHistory') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.dentalHistory}</p>
                        </div>
                      )}

                      {/* Intraoral Examination */}
                      {aiNote.intraOralExamination && (
                        <div 
                          className={`soap-section section-intraOralExamination ${isSelected('intraOralExamination') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('intraOralExamination')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">👄</span>
                            <strong>Intraoral Examination</strong>
                            {isSelected('intraOralExamination') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('intraOralExamination'); }}>{isSelected('intraOralExamination') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.intraOralExamination}</p>
                        </div>
                      )}

                      {/* Extraoral & TMJ Examination */}
                      {aiNote.extraoralTMJExam && (
                        <div 
                          className={`soap-section section-tmjExam ${isSelected('extraoralTMJExam') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('extraoralTMJExam')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">👁️</span>
                            <strong>Extraoral & TMJ Examination</strong>
                            {isSelected('extraoralTMJExam') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('extraoralTMJExam'); }}>{isSelected('extraoralTMJExam') ? 'Selected' : 'Select'}</button>
                          {typeof aiNote.extraoralTMJExam === 'object' ? (
                            <div>
                              {aiNote.extraoralTMJExam.musclePalpation && (
                                <div style={{ marginBottom: '10px' }}>
                                  <strong>Muscle Palpation:</strong>
                                  {aiNote.extraoralTMJExam.musclePalpation.temporalisRight && <p style={{ marginLeft: '10px' }}>• Temporalis Right: {aiNote.extraoralTMJExam.musclePalpation.temporalisRight}</p>}
                                  {aiNote.extraoralTMJExam.musclePalpation.temporalisLeft && <p style={{ marginLeft: '10px' }}>• Temporalis Left: {aiNote.extraoralTMJExam.musclePalpation.temporalisLeft}</p>}
                                  {aiNote.extraoralTMJExam.musclePalpation.masseterRight && <p style={{ marginLeft: '10px' }}>• Masseter Right: {aiNote.extraoralTMJExam.musclePalpation.masseterRight}</p>}
                                  {aiNote.extraoralTMJExam.musclePalpation.masseterLeft && <p style={{ marginLeft: '10px' }}>• Masseter Left: {aiNote.extraoralTMJExam.musclePalpation.masseterLeft}</p>}
                                  {aiNote.extraoralTMJExam.musclePalpation.notes && <p style={{ marginLeft: '10px' }}><em>{aiNote.extraoralTMJExam.musclePalpation.notes}</em></p>}
                                </div>
                              )}
                              {aiNote.extraoralTMJExam.tmjEvaluation && <p><strong>TMJ Evaluation:</strong> {aiNote.extraoralTMJExam.tmjEvaluation}</p>}
                            </div>
                          ) : (
                            <p style={{ whiteSpace: 'pre-line' }}>{aiNote.extraoralTMJExam}</p>
                          )}
                        </div>
                      )}

                      {/* Diagnostic Procedures */}
                      {aiNote.diagnosticProcedures && (
                        <div 
                          className={`soap-section section-diagnosticProcedures ${isSelected('diagnosticProcedures') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('diagnosticProcedures')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">🔬</span>
                            <strong>Diagnostic Procedures</strong>
                            {isSelected('diagnosticProcedures') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('diagnosticProcedures'); }}>{isSelected('diagnosticProcedures') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.diagnosticProcedures}</p>
                        </div>
                      )}

                      {/* Assessment (Diagnosis) */}
                      {(aiNote.assessment || aiNote.diagnosis) && (
                        <div 
                          className={`soap-section section-assessment ${isSelected('assessment') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('assessment')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">📊</span>
                            <strong>Assessment</strong>
                            {isSelected('assessment') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('assessment'); }}>{isSelected('assessment') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.assessment || aiNote.diagnosis}</p>
                        </div>
                      )}

                      {/* Education & Recommendations */}
                      {aiNote.educationRecommendations && (
                        <div 
                          className={`soap-section section-educationRecommendations ${isSelected('educationRecommendations') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('educationRecommendations')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">📚</span>
                            <strong>Education & Recommendations</strong>
                            {isSelected('educationRecommendations') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('educationRecommendations'); }}>{isSelected('educationRecommendations') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.educationRecommendations}</p>
                        </div>
                      )}

                      {/* Patient Response */}
                      {aiNote.patientResponse && (
                        <div 
                          className={`soap-section section-patientResponse ${isSelected('patientResponse') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('patientResponse')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">💬</span>
                            <strong>Patient Response</strong>
                            {isSelected('patientResponse') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('patientResponse'); }}>{isSelected('patientResponse') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.patientResponse}</p>
                        </div>
                      )}

                      {/* Plan */}
                      {(aiNote.plan || aiNote.treatmentPlan) && (
                        <div 
                          className={`soap-section section-plan ${isSelected('plan') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('plan')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">📋</span>
                            <strong>Plan</strong>
                            {isSelected('plan') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('plan'); }}>{isSelected('plan') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.plan || aiNote.treatmentPlan}</p>
                        </div>
                      )}

                      {/* Treatment Provided */}
                      {aiNote.treatmentProvided && (
                        <div 
                          className={`soap-section section-treatmentProvided ${isSelected('treatmentProvided') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('treatmentProvided')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">💉</span>
                            <strong>Treatment Provided</strong>
                            {isSelected('treatmentProvided') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('treatmentProvided'); }}>{isSelected('treatmentProvided') ? 'Selected' : 'Select'}</button>
                          <p style={{ whiteSpace: 'pre-line' }}>{aiNote.treatmentProvided}</p>
                        </div>
                      )}

                      {/* Prognosis */}
                      {aiNote.prognosis && (
                        <div 
                          className={`soap-section section-prognosis ${isSelected('prognosis') ? 'selected' : ''}`}
                          onClick={(e) => {
                            if (e.target.closest('.copy-btn')) return
                            toggleSection('prognosis')
                          }}
                          style={{ cursor: 'pointer' }}
                          title="Click to select this section for Copy/PDF/Save"
                        >
                          <div className="section-title-inline">
                            <span className="section-emoji">🔮</span>
                            <strong>Prognosis</strong>
                            {isSelected('prognosis') && <span style={{ marginLeft: 'auto', color: 'var(--brand-green)' }}>✓</span>}
                          </div>
                          <button className="copy-btn" onClick={(e) => { e.stopPropagation(); toggleSection('prognosis'); }}>{isSelected('prognosis') ? 'Selected' : 'Select'}</button>
                          <p>{aiNote.prognosis}</p>
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="note-empty">
                      <div className="note-empty-icon">📝</div>
                      <p>No note generated yet</p>
                      <small>Dictate or type your notes, then click Generate</small>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="encounters-table">
              <div className="table-header">
                <span className="table-icon">📋</span>
                <div className="section-title">Recent Encounters</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>PATIENT</th>
                    <th>TOOTH/AREA</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEncounters.map(enc => (
                    <tr key={enc.id} style={{ cursor: 'pointer' }} onClick={() => setViewingEncounter(enc)}>
                      <td>{enc.patient_name || 'Unknown'}</td>
                      <td>{enc.tooth_number || '-'}</td>
                      <td>{new Date(enc.created_at).toLocaleDateString()}</td>
                      <td><span className={`status ${enc.status}`}>{enc.status}</span></td>
                      <td><button className="view-btn" onClick={(e) => { e.stopPropagation(); setViewingEncounter(enc); }}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ Settings</h2>
            <div className="settings-section">
              <p><strong>User:</strong> {user.userId}</p>
              <p><strong>Domain:</strong> {user.domain}</p>
              <p><strong>Theme:</strong> {theme}</p>
              <p><strong>AI Model:</strong> Google Gemini Pro</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={autoGenerate} onChange={(e) => { setAutoGenerate(e.target.checked); try { localStorage.setItem('cv_auto_generate', e.target.checked ? '1' : '0') } catch { } }} />
                Auto-generate note when recording stops
              </label>
            </div>
            <button onClick={() => setShowSettings(false)} className="modal-close-btn">Close</button>
          </div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '85vh' }}>
            <h2>📋 Copy Note</h2>
            <textarea className="copy-preview-text" value={copyPreview} onChange={(e) => setCopyPreview(e.target.value)} placeholder="Nothing selected yet" style={{ width: '100%', minHeight: '400px', padding: '14px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: '14px', resize: 'vertical' }} />
            <div className="note-actions" style={{ marginTop: '12px' }}>
              <button className="btn btn-copy" onClick={async () => { try { await navigator.clipboard.writeText(copyPreview); pushToast('Copied!', 'success'); } catch { } }}>Copy</button>
              <button className="btn btn-save" onClick={() => { navigator.clipboard.writeText(copyPreview).then(() => { setShowCopyModal(false); pushToast('Copied & Closed!', 'success'); }); }}>Copy & Close</button>
              <button className="btn btn-ghost" onClick={() => setShowCopyModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>💾 Save {saveType === 'ai' ? 'AI Note' : saveType === 'raw' ? 'Raw Transcript' : 'Both'}</h2>
            <div className="settings-section">
              <p><strong>Instructions:</strong> Enter patient name and tooth number to save securely.</p>
              <input type="text" value={savePatientName} onChange={e => setSavePatientName(e.target.value)} placeholder="Patient Name" style={{ width: '100%', padding: '12px', marginBottom: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)' }} />
              <input type="text" value={saveToothNumber} onChange={e => setSaveToothNumber(e.target.value)} placeholder="Tooth Number / Area" style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)' }} />
            </div>
            <div className="note-actions">
              <button className="btn btn-save" onClick={saveTranscript}>✅ Preview & Save</button>
              <button className="btn btn-ghost" onClick={() => setShowSaveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPatientsModal && (
        <div className="modal-overlay" onClick={() => setShowPatientsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>👥 Active Patients</h2>
            <div className="settings-section">
              {patientsList.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Phone</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientsList.map(p => (
                      <tr key={p.id}>
                        <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{p.name}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{p.phone || '-'}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No patients found.</p>
              )}
            </div>
            <div className="note-actions">
              <button className="btn btn-ghost" onClick={() => setShowPatientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {viewingEncounter && (
        <div className="modal-overlay" onClick={() => setViewingEncounter(null)}>
          <div className="modal-content copy-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
            <h2>📝 Encounter Details</h2>
            <div className="settings-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                <div><strong>Patient:</strong> {viewingEncounter.patient_name || 'Unknown'}</div>
                <div><strong>Tooth/Area:</strong> {viewingEncounter.tooth_number || '-'}</div>
                <div><strong>Date:</strong> {new Date(viewingEncounter.created_at).toLocaleString()}</div>
                <div><strong>Status:</strong> <span className={`status ${viewingEncounter.status}`}>{viewingEncounter.status}</span></div>
              </div>
              {viewingEncounter.ai_notes && (
                <div style={{ marginTop: '16px' }}>
                  <strong>AI Note:</strong>
                  <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '4px solid var(--brand-green)', maxHeight: '300px', overflow: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', margin: 0 }}>{typeof viewingEncounter.ai_notes === 'string' ? viewingEncounter.ai_notes : JSON.stringify(viewingEncounter.ai_notes, null, 2)}</pre>
                  </div>
                </div>
              )}
              {viewingEncounter.transcript && (
                <div style={{ marginTop: '16px' }}>
                  <strong>Raw Transcript:</strong>
                  <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '4px solid var(--brand-orange)', maxHeight: '200px', overflow: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', margin: 0 }}>{viewingEncounter.transcript}</pre>
                  </div>
                </div>
              )}
            </div>
            <div className="note-actions">
              <button className="btn btn-ghost" onClick={() => window.print()}>🖨️ Print</button>
              <button className="btn btn-save" onClick={() => {
                const text = `Patient: ${viewingEncounter.patient_name || 'Unknown'}\nDate: ${new Date(viewingEncounter.created_at).toLocaleString()}\n\n${viewingEncounter.ai_notes || ''}\n\n${viewingEncounter.transcript || ''}`
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `Encounter_${viewingEncounter.patient_name || 'Unknown'}_${new Date(viewingEncounter.created_at).toISOString().slice(0, 10)}.txt`
                a.click()
                URL.revokeObjectURL(url)
                pushToast('Downloaded!', 'success')
              }}>💾 Download</button>
              <button className="btn btn-ghost" onClick={() => setViewingEncounter(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MainDashboard
