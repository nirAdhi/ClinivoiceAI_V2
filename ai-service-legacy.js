const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

if (genAI) {
    console.log('✅ Gemini AI initialized with API key');
} else {
    console.log('⚠️  No GEMINI_API_KEY found - will use mock data');
}

// Initialize OpenAI (optional)
const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
if (openai) {
    console.log('✅ OpenAI client initialized');
} else {
    console.log('ℹ️  OpenAI not configured');
}

/**
 * Transcribe audio using Gemini (or mock data if no API key)
 */
async function transcribeAudio(audioBuffer) {
    if (!genAI) {
        console.log('No Gemini API key - using mock transcription');
        return {
            text: "Sample transcription: Patient presents with chief complaint of headache for the past 3 days. Pain is described as throbbing, located in the temporal region, rated 7 out of 10 in severity. Patient reports associated photophobia and nausea. No fever, no recent trauma."
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        // Legacy path uses mock transcription since Gemini has no audio transcription
        console.log('Legacy: Gemini transcription not implemented - using mock data');
        return {
            text: "Sample transcription from audio file"
        };
    } catch (error) {
        console.error('Gemini transcription error (legacy):', error);
        return { text: "Transcription error - please try again" };
    }
}

/**
 * Generate medical SOAP note using Google Gemini (legacy)
 */
async function generateMedicalNote(transcription, domain = 'medical') {
    // Minimal legacy implementation mirrors original old behavior
    // The legacy mapping to the 14-field template will be handled in the dispatcher
    // For now, fallback to a simple structured response if Gemini is unavailable
    const hasLegacy = !!genAI;
    if (!hasLegacy) {
        return {
            patient: '[Patient Name]',
            date: new Date().toLocaleDateString(),
            dentist: '[Dentist Name]',
            visitType: 'Dental Examination',
            chiefComplaint: transcription || '',
            historyOfPresentIllness: '',
            medicalHistory: 'Not provided',
            dentalHistory: '',
            intraOralExamination: '',
            diagnosticProcedures: '',
            assessment: '',
            educationRecommendations: '',
            patientResponse: '',
            plan: ''
        };
    }
    // Real legacy path would be implemented here if we had exact old logic
    // For production parity, return a basic template-like note
    return {
        subjective: 'Legacy: note',
        objective: '',
        assessment: '',
        plan: ''
    };
}

module.exports = {
  transcribeAudio,
  generateMedicalNote
};
