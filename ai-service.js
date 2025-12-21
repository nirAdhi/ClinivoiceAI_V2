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

        // Note: Gemini doesn't have direct audio transcription like Whisper
        // For now, return mock data - you'd need to use Google Speech-to-Text API for real transcription
        console.log('Audio transcription with Gemini not yet implemented - using mock data');
        return {
            text: "Sample transcription from audio file"
        };
    } catch (error) {
        console.error('Gemini transcription error:', error);
        return { text: "Transcription error - please try again" };
    }
}

/**
 * Generate medical SOAP note using Google Gemini
 */
async function generateMedicalNote(transcription, domain = 'medical') {
    const providerRaw = process.env.AI_PROVIDER || 'auto';
    const providerPref = String(providerRaw).trim().toLowerCase();
    console.log('🧩 AI provider preference:', JSON.stringify(providerPref));

    // Local helper to generate using OpenAI Chat Completions with JSON enforced
    const generateWithOpenAI = async () => {
        if (!openai) throw new Error('OpenAI not configured');
        const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

        const domainContext = domain === 'dental'
            ? 'dental examination and treatment'
            : 'medical examination and diagnosis';

        let prompt;
        if (domain === 'dental') {
            prompt = `You are a professional dental scribe AI assistant. Based on the following clinical transcription, generate a detailed dental examination report in JSON format.

Transcription: "${transcription}"

Generate a comprehensive dental examination report with these exact fields:
- patient: Patient name (or "[Patient Name]" if not mentioned)
- date: "[Insert Date]"
- dentist: Dentist name (or "Dr. [Name]" if mentioned, else "[Dentist Name]")
- visitType: Type of visit (e.g., "Routine Dental Examination & Consultation")
- chiefComplaint: Main reason for visit (2-3 sentences)
- historyOfPresentIllness: Detailed history of current issues (3-4 sentences)
- medicalHistory: Relevant medical history (2-3 sentences or "Not discussed")
- dentalHistory: Previous dental visits and habits (2-3 sentences)
- intraOralExamination: Findings from mouth examination (3-4 sentences)
- diagnosticProcedures: Tests ordered or performed (2-3 sentences)
- assessment: Clinical assessment and diagnosis (2-3 sentences)
- educationRecommendations: Patient education and recommendations (3-4 sentences)
- patientResponse: How patient responded to instructions (1-2 sentences)
- plan: Treatment plan and follow-up (2-3 sentences)
- icdCodes: Array of relevant ICD-10 codes (2-3 codes)
- cptCodes: Array of relevant CPT codes (2-3 codes)

Return ONLY valid JSON with these exact keys. Do not include any markdown formatting or code blocks.`;
        } else {
            prompt = `You are a professional medical scribe AI assistant. Based on the following clinical transcription, generate a structured SOAP note in JSON format.

Transcription: "${transcription}"

Generate a comprehensive SOAP note for ${domainContext} with these exact fields:
- subjective: The patient's reported symptoms and history (2-3 sentences)
- objective: Observable clinical findings and vital signs (2-3 sentences) 
- assessment: Clinical diagnosis or assessment (1-2 sentences)
- plan: Treatment plan and recommendations (2-3 sentences)
- icdCodes: Array of relevant ICD-10 codes (2-3 codes)
- cptCodes: Array of relevant CPT codes (2-3 codes)

Return ONLY valid JSON with these exact keys. Do not include any markdown formatting or code blocks.`;
        }

        console.log('🤖 Using OpenAI model:', model);
        const completion = await openai.chat.completions.create({
            model,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You are a clinical documentation scribe. Return ONLY valid JSON.' },
                { role: 'user', content: prompt }
            ]
        });
        const text = completion.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('OpenAI returned empty content');

        const parsed = JSON.parse(text);

        // Domain-specific validation
        if (domain === 'dental') {
            const requiredDental = ['patient','date','dentist','visitType','chiefComplaint','historyOfPresentIllness','assessment','plan'];
            const missing = requiredDental.filter(k => !parsed[k] || (typeof parsed[k] === 'string' && parsed[k].trim() === ''));
            if (missing.length) throw new Error('OpenAI missing dental fields: ' + missing.join(', '));
        } else {
            if (!parsed.subjective || !parsed.objective || !parsed.assessment || !parsed.plan) {
                throw new Error('OpenAI missing required SOAP fields');
            }
        }

        parsed.icdCodes = parsed.icdCodes || [];
        parsed.cptCodes = parsed.cptCodes || [];
        return parsed;
    };

    // Prefer OpenAI first whenever OPENAI_API_KEY is present unless provider forced to 'gemini'
    if (openai && providerPref !== 'gemini') {
        console.log('🔀 Preferring OpenAI path (providerPref=', providerPref, ')');
        try {
            return await generateWithOpenAI();
        } catch (e) {
            console.error('OpenAI generation failed (primary):', e.message || e);
            // if provider is strictly openai, do not fallback to Gemini
            if (providerPref.startsWith('openai')) throw e;
        }
    }

    if (!genAI) {
        // No Gemini available and OpenAI failed or not configured
        if (openai) {
            try { return await generateWithOpenAI(); } catch (e) { console.error('OpenAI generation failed:', e.message || e); }
        }
        console.log('No Gemini API key - using mock note generation');
        return {
            subjective: "Patient complains of persistent headache for 3 days with associated photophobia and nausea.",
            objective: "Patient appears uncomfortable. Vital signs stable. Neurological exam unremarkable.",
            assessment: "Migraine headache without aura.",
            plan: "Prescribe sumatriptan 50mg as needed. Recommend rest in dark room. Follow up in 1 week if symptoms persist.",
            icdCodes: ["G43.909"],
            cptCodes: ["99213"]
        };
    }

    try {
        console.log('🔄 Generating note for domain:', domain);
        const modelCandidates = [];
        if (process.env.GEMINI_MODEL) modelCandidates.push(process.env.GEMINI_MODEL);
        modelCandidates.push(
            'gemini-1.5-pro-latest',
            'gemini-1.5-flash-latest',
            'gemini-1.0-pro-latest',
            'gemini-pro'
        );
        let chosenModel = null;
        let text = '';

        const domainContext = domain === 'dental'
            ? 'dental examination and treatment'
            : 'medical examination and diagnosis';

        let prompt;
        let responseSchema;
        if (domain === 'dental') {
            prompt = `You are a professional dental scribe AI assistant. Based on the following clinical transcription, generate a detailed dental examination report in JSON format.

Transcription: "${transcription}"

Generate a comprehensive dental examination report with these exact fields:
- patient: Patient name (or "[Patient Name]" if not mentioned)
- date: "[Insert Date]"
- dentist: Dentist name (or "Dr. [Name]" if mentioned, else "[Dentist Name]")
- visitType: Type of visit (e.g., "Routine Dental Examination & Consultation")
- chiefComplaint: Main reason for visit (2-3 sentences)
- historyOfPresentIllness: Detailed history of current issues (3-4 sentences)
- medicalHistory: Relevant medical history (2-3 sentences or "Not discussed")
- dentalHistory: Previous dental visits and habits (2-3 sentences)
- intraOralExamination: Findings from mouth examination (3-4 sentences)
- diagnosticProcedures: Tests ordered or performed (2-3 sentences)
- assessment: Clinical assessment and diagnosis (2-3 sentences)
- educationRecommendations: Patient education and recommendations (3-4 sentences)
- patientResponse: How patient responded to instructions (1-2 sentences)
- plan: Treatment plan and follow-up (2-3 sentences)
- icdCodes: Array of relevant ICD-10 codes (2-3 codes)
- cptCodes: Array of relevant CPT codes (2-3 codes)

Return ONLY valid JSON with these exact keys. Do not include any markdown formatting or code blocks.`;

            responseSchema = {
                type: 'object',
                properties: {
                    patient: { type: 'string' },
                    date: { type: 'string' },
                    dentist: { type: 'string' },
                    visitType: { type: 'string' },
                    chiefComplaint: { type: 'string' },
                    historyOfPresentIllness: { type: 'string' },
                    medicalHistory: { type: 'string' },
                    dentalHistory: { type: 'string' },
                    intraOralExamination: { type: 'string' },
                    diagnosticProcedures: { type: 'string' },
                    assessment: { type: 'string' },
                    educationRecommendations: { type: 'string' },
                    patientResponse: { type: 'string' },
                    plan: { type: 'string' },
                    icdCodes: { type: 'array', items: { type: 'string' } },
                    cptCodes: { type: 'array', items: { type: 'string' } }
                },
                required: ['patient','date','dentist','visitType','chiefComplaint','historyOfPresentIllness','assessment','plan']
            };
        } else {
            prompt = `You are a professional medical scribe AI assistant. Based on the following clinical transcription, generate a structured SOAP note in JSON format.

Transcription: "${transcription}"

Generate a comprehensive SOAP note for ${domainContext} with these exact fields:
- subjective: The patient's reported symptoms and history (2-3 sentences)
- objective: Observable clinical findings and vital signs (2-3 sentences) 
- assessment: Clinical diagnosis or assessment (1-2 sentences)
- plan: Treatment plan and recommendations (2-3 sentences)
- icdCodes: Array of relevant ICD-10 codes (2-3 codes)
- cptCodes: Array of relevant CPT codes (2-3 codes)

Return ONLY valid JSON with these exact keys. Do not include any markdown formatting or code blocks.`;

            responseSchema = {
                type: 'object',
                properties: {
                    subjective: { type: 'string' },
                    objective: { type: 'string' },
                    assessment: { type: 'string' },
                    plan: { type: 'string' },
                    icdCodes: { type: 'array', items: { type: 'string' } },
                    cptCodes: { type: 'array', items: { type: 'string' } }
                },
                required: ['subjective','objective','assessment','plan']
            };
        }

        let lastErr = null;
        for (const modelName of modelCandidates) {
            try {
                console.log('📤 Sending prompt to Gemini (model:', modelName, ')...');
                const model = genAI.getGenerativeModel({ model: modelName });
                let result;
                try {
                    result = await model.generateContent({
                        contents: [{ role: 'user', parts: [{ text: prompt }]}],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseSchema
                        }
                    });
                } catch (firstErr) {
                    console.warn('⚠️ generationConfig path failed, retrying with plain prompt...', firstErr?.message || firstErr);
                    result = await model.generateContent(prompt);
                }
                const response = await result.response;
                text = response.text();
                console.log('📥 Gemini raw response:', text.substring(0, 200));
                chosenModel = modelName;
                break;
            } catch (err) {
                lastErr = err;
                console.error('❌ Model attempt failed:', modelName, '-', err?.message || err);
            }
        }
        if (!chosenModel) {
            console.log('🌐 Trying HTTP REST fallback to v1 endpoint...');
            for (const modelName of modelCandidates) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(modelName)}:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    const body = {
                        contents: [{ role: 'user', parts: [{ text: prompt }]}],
                        generationConfig: { responseMimeType: 'application/json' }
                    };
                    const r = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (!r.ok) {
                        const errTxt = await r.text();
                        throw new Error(`HTTP ${r.status}: ${errTxt}`);
                    }
                    const data = await r.json();
                    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
                    text = parts.map(p => p.text || '').join('');
                    if (!text) throw new Error('Empty response text');
                    console.log('📥 Gemini raw (HTTP):', text.substring(0, 200));
                    chosenModel = modelName;
                    break;
                } catch (err) {
                    lastErr = err;
                    console.error('❌ HTTP model attempt failed:', modelName, '-', err?.message || err);
                }
            }
        }
        if (!chosenModel) throw lastErr || new Error('All Gemini model attempts failed');

        // Clean up the response - remove markdown code blocks if present
        const cleanText = text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        let soapNote;
        try {
            console.log('🔍 Attempting to parse JSON...');
            soapNote = JSON.parse(cleanText);
            console.log('✅ JSON parsed successfully');
        } catch (err) {
            console.log('⚠️  Direct JSON parse failed, attempting extraction...');
            // fallback: attempt to extract JSON substring
            const start = cleanText.indexOf('{');
            const end = cleanText.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
                const jsonSubstring = cleanText.slice(start, end + 1);
                try {
                    soapNote = JSON.parse(jsonSubstring);
                    console.log('✅ Extracted JSON parsed successfully');
                } catch (_) {
                    console.error('❌ Extracted JSON also failed:', _.message);
                    throw err; // rethrow original error
                }
            } else {
                console.error('❌ No JSON block found in response');
                throw err;
            }
        }

        // Validate the required fields depending on domain
        if (domain === 'dental') {
            const requiredDental = ['patient','date','dentist','visitType','chiefComplaint','historyOfPresentIllness','assessment','plan'];
            const missing = requiredDental.filter(k => !soapNote[k] || (typeof soapNote[k] === 'string' && soapNote[k].trim() === ''));
            if (missing.length) {
                throw new Error('Missing required dental fields: ' + missing.join(', '));
            }
        } else {
            if (!soapNote.subjective || !soapNote.objective || !soapNote.assessment || !soapNote.plan) {
                throw new Error('Missing required SOAP fields');
            }
        }

        // Ensure arrays exist
        soapNote.icdCodes = soapNote.icdCodes || [];
        soapNote.cptCodes = soapNote.cptCodes || [];

        return soapNote;

    } catch (error) {
        // If Gemini failed and provider is not forced to gemini, try OpenAI as a fallback
        if (openai && providerPref !== 'gemini') {
            try {
                console.warn('⚠️ Gemini failed; attempting OpenAI fallback...');
                const result = await generateWithOpenAI();
                return result;
            } catch (e2) {
                console.error('OpenAI fallback also failed:', e2.message || e2);
            }
        }
        const errMsg = (error && error.message) ? error.message : String(error);
        console.error('❌ Gemini/OpenAI note generation error:', errMsg);

        // Domain-specific offline fallback to keep UX consistent
        if (domain === 'dental') {
            const today = new Date();
            const dateStr = today.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
            const text = String(transcription || '').trim();
            const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || 'Patient reports sensitivity and gum bleeding during brushing.';
            const rest = text.slice(firstSentence.length).trim();

            return {
                _error: errMsg,
                _provider: process.env.AI_PROVIDER || 'auto',
                patient: '[Patient Name]',
                date: dateStr,
                dentist: '[Dentist Name]',
                visitType: 'Routine Dental Examination & Consultation',
                chiefComplaint: firstSentence,
                historyOfPresentIllness: rest || 'Symptoms have been present for an unspecified duration. Patient expresses concern and seeks evaluation.',
                medicalHistory: 'Not discussed/No concerns mentioned. (Update if applicable)',
                dentalHistory: 'Inconsistent oral hygiene and irregular flossing habits reported.',
                intraOralExamination: 'Teeth and gums generally healthy with signs of gingival inflammation. Plaque accumulation likely contributing to bleeding.',
                diagnosticProcedures: 'Dental X-rays ordered to assess teeth, roots, and possible underlying pathology. Awaiting radiographic evaluation.',
                assessment: 'Gingival inflammation likely due to inadequate plaque control. Possible localized sensitivity at lower right molar (diagnosis pending X-ray).',
                educationRecommendations: 'Reinforced twice-daily brushing with a soft-bristle toothbrush; demonstrated gentle circular technique; emphasized daily flossing; recommended toothbrush replacement every 3 months; encouraged routine dental visits.',
                patientResponse: 'Patient understood instructions and plans to improve oral hygiene habits.',
                plan: 'Review X-ray results at next visit; consider scaling/periodontal cleaning if indicated; follow-up based on radiographic findings and response to hygiene improvements.',
                icdCodes: ['K05.10'],
                cptCodes: ['D0120']
            };
        }

        // Generic SOAP fallback
        return {
            _error: errMsg,
            _domain: domain,
            _model: process.env.GEMINI_MODEL || 'auto',
            subjective: 'AI generation error - using fallback note. Patient reports symptoms as described in transcription.',
            objective: 'Clinical findings as documented.',
            assessment: 'Requires further evaluation.',
            plan: 'Continue monitoring and follow-up as needed.',
            icdCodes: ['R51'],
            cptCodes: ['99213']
        };
    }
}

module.exports = {
    transcribeAudio,
    generateMedicalNote
};
