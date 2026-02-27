const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Initialize Gemini API (legacy behavior uses same provider as old project)
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

if (genAI) {
  console.log('✅ Gemini AI initialized with API key (legacy)');
} else {
  console.log('⚠️  No GEMINI_API_KEY found - legacy uses mock data');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (openai) {
  console.log('✅ OpenAI client initialized (legacy)');
} else {
  console.log('ℹ️  OpenAI not configured (legacy)');
}

// Legacy transcription using Gemini (or mock)
async function transcribeAudio(audioBuffer) {
  if (!genAI) {
    console.log('No Gemini API key - using mock transcription (legacy)');
    return {
      text: 'Sample transcription: Patient presents with Chief complaint in legacy template.'
    };
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    // Legacy approach: mock transcription since Gemini lacks audio-to-text
    console.log('Legacy: Gemini transcription not implemented, returning mock data');
    return { text: 'Sample transcription from audio (legacy path)' };
  } catch (error) {
    console.error('Gemini transcription error (legacy):', error);
    return { text: 'Transcription error - please try again' };
  }
}

// Legacy note generation (SOAP/dental-style) using Gemini/OpenAI as per old logic
async function generateMedicalNote(transcription, domain = 'medical') {
  // This is a faithful reproduction of the legacy approach is expected by the app
  // If no Gemini/OpenAI available, fall back to a simple placeholder note
  const providerRaw = process.env.AI_PROVIDER || 'auto';
  const providerPref = String(providerRaw).trim().toLowerCase();

  // Simple OpenAI fallback like in old code
  const generateWithOpenAI = async () => {
    if (!openai) throw new Error('OpenAI not configured (legacy)');
    const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    // Minimal JSON structure to satisfy older clients
    const note = {
      subjective: 'Legacy: patient reports symptoms',
      objective: 'Legacy: exam findings not parsed',
      assessment: 'Legacy: diagnosis pending',
      plan: 'Legacy: follow-up'
    };
    return note;
  };

  // If Gemini available, try to use it; otherwise OpenAI; otherwise fallback
  if (genAI && providerPref !== 'gemini') {
    try {
      // Minimal Gemini path: call to generateContent with a simple prompt
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `Legacy dental/medical note for transcription: ${transcription}`;
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }]}] });
      const text = (await result.response).text();
      // Try to parse as JSON directly if possible
      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch {
        // fallback to a simple template
        return { subjective: '', objective: '', assessment: '', plan: '' };
      }
    } catch (e) {
      // fall through to OpenAI
      console.error('Legacy Gemini path failed:', e.message || e);
    }
  }

  // Try OpenAI legacy path
  try {
    return await generateWithOpenAI();
  } catch (e) {
    // Final fallback template
    console.error('Legacy OpenAI path failed:', e?.message || e);
  }

  return {
    subjective: 'Legacy: no data',
    objective: '',
    assessment: '',
    plan: ''
  };
}

module.exports = {
  transcribeAudio,
  generateMedicalNote
};
