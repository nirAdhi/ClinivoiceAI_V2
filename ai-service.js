const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

if (genAI) {
    const keyPreview = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'none';
    console.log('✅ Gemini AI initialized with API key:', keyPreview);
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

Generate a comprehensive dental examination report with these exact fields and structure:
1. patient: Extract the patient's first name from the transcription. The patient is the person RECEIVING dental care (the one who says "I'm nervous" or "my tooth hurts"). Look for patterns like "gums John your teeth", "how are you John", or "Good morning John". The patient is John, NOT Dr Elena.
2. date: "[Insert Date]"
3. dentist: Extract the dentist's name from the transcription. The dentist is the PROVIDER of care - the one being addressed as "Dr" (e.g., "Dr Elena", "Dr Smith") or who says "let me examine you". The dentist is NEVER the one saying "I'm nervous" or "my tooth hurts".
4. visitType: Type of visit (e.g., "Routine Dental Examination & Consultation")
5. chiefComplaint: Concise summary of main reason for visit (bullet points if multiple issues)
6. historyOfPresentIllness: Detailed history with bullet points for each symptom/duration
7. medicalHistory: Relevant medical history (or "Not discussed/No concerns mentioned. (Update if applicable)")
8. dentalHistory: Previous dental visits and habits (bullet points)
9. intraOralExamination: Findings from mouth examination with bullet points
10. diagnosticProcedures: Tests ordered with status notes like "(Update results once available)"
11. assessment: Clinical assessment with bullet points for each finding
12. educationRecommendations: Patient education with bullet points for each recommendation
13. patientResponse: How patient responded to instructions
14. plan: Treatment plan with bullet points and follow-up steps

Use bullet points (starting with - or •) to separate multiple items within each section. Return ONLY valid JSON with these exact keys. Do not include any markdown formatting or code blocks.`;
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
            'gemini-2.5-flash',
            'gemini-2.5-flash-001'
        );
        let chosenModel = null;
        let text = '';

        const domainContext = domain === 'dental'
            ? 'dental examination and treatment'
            : 'medical examination and diagnosis';

        let prompt;
        if (domain === 'dental') {
            const shortTranscript = transcription.substring(0, 800);
            prompt = `Dental JSON: ${shortTranscript}. Return ONLY JSON like:
{"patient":"Name","date":"Date","dentist":"Dr.Name","visitType":"Exam","chiefComplaint":"issue","historyOfPresentIllness":"duration","medicalHistory":"none","dentalHistory":"none","intraOralExamination":"normal","diagnosticProcedures":"none","assessment":"diagnosis","educationRecommendations":"none","patientResponse":"ok","plan":"follow up"}`;

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
                    plan: { type: 'string' }
                },
                required: ['patient','date','dentist','visitType','chiefComplaint','historyOfPresentIllness','assessment','plan']
            };
        } else {
            prompt = `Generate a brief SOAP note JSON from this. Return ONLY valid JSON.

Transcription: "${transcription.substring(0, 2000)}"

Return JSON with: subjective, objective, assessment, plan. Complete all fields. End with closing brace.`;

            responseSchema = {
                type: 'object',
                properties: {
                    subjective: { type: 'string' },
                    objective: { type: 'string' },
                    assessment: { type: 'string' },
                    plan: { type: 'string' }
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
                    // Try with JSON response format (newer models)
                    result = await model.generateContent(prompt);
                } catch (firstErr) {
                    console.warn('⚠️ Generation failed, retrying...', firstErr?.message || firstErr);
                    result = await model.generateContent(prompt);
                }
                const response = await result.response;
                text = response.text();
                console.log('📥 Gemini raw response length:', text.length, 'chars');
                console.log('📥 Gemini raw response preview:', text.substring(0, 300));
                
                // Check if response appears truncated (ends abruptly)
                if (text.length > 0 && !text.trim().endsWith('}') && !text.trim().endsWith('"]')) {
                    console.log('⚠️ Response may be truncated, attempting to complete...');
                    // Try to get more content
                    try {
                        const continueResult = await model.generateContent("Continue and complete the JSON response above. Return ONLY valid JSON, nothing else.");
                        const continuedText = continueResult.response.text();
                        if (continuedText) {
                            text = text + continuedText;
                            console.log('📥 Combined response length:', text.length);
                        }
                    } catch (contErr) {
                        console.log('⚠️ Could not continue response');
                    }
                }
                
                chosenModel = modelName;
                break;
            } catch (err) {
                lastErr = err;
                console.error('❌ Model attempt failed:', modelName, '-', err?.message || err);
            }
        }
        if (!chosenModel) {
            console.log('🔍 Listing available models...');
            try {
                const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`;
                const r = await fetch(listUrl);
                const data = await r.json();
                console.log('📋 Available models:', JSON.stringify(data).substring(0, 500));
            } catch (e) {
                console.log('📋 Could not list models:', e.message);
            }
            
            console.log('🌐 Trying HTTP REST fallback to v1beta endpoint...');
            for (const modelName of modelCandidates) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta2/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    const body = {
                        contents: [{ role: 'user', parts: [{ text: prompt }]}]
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
                    console.log('📥 Gemini raw (HTTP) length:', text.length, 'chars');
                    console.log('📥 Gemini raw (HTTP) preview:', text.substring(0, 300));
                    chosenModel = modelName;
                    break;
                } catch (err) {
                    lastErr = err;
                    console.error('❌ HTTP model attempt failed:', modelName, '-', err?.message || err);
                }
            }
        }
        if (!chosenModel) throw lastErr || new Error('All Gemini model attempts failed');

        // Simple cleanup - just remove markdown and trim
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // Debug
        console.log('🧹 Cleaned text:', cleanText.substring(0, 200));

        let soapNote = null;
        
        // Method 1: Find FIRST complete JSON object only
        // Look for the first { and find its matching }
        const firstBrace = cleanText.indexOf('{');
        if (firstBrace !== -1) {
            let braceCount = 0;
            let endPos = -1;
            for (let i = firstBrace; i < cleanText.length; i++) {
                if (cleanText[i] === '{') braceCount++;
                else if (cleanText[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endPos = i + 1;
                        break;
                    }
                }
            }
            
            if (endPos > 0) {
                let jsonStr = cleanText.substring(firstBrace, endPos);
                // Fix trailing commas
                jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                
                try {
                    soapNote = JSON.parse(jsonStr);
                    console.log('✅ Method 1: First JSON extracted, keys:', Object.keys(soapNote).slice(0, 5));
                } catch (e) {
                    console.log('⚠️ Method 1 failed:', e.message);
                }
            }
        }
        
        // Method 2: Try direct parse if method 1 failed
        if (!soapNote) {
            try {
                soapNote = JSON.parse(cleanText);
                console.log('✅ Method 2: Direct parse worked');
            } catch (e) {
                console.log('⚠️ Method 2 failed:', e.message);
            }
        }

        // Method 3: Extract key-value pairs if still failed
        if (!soapNote && cleanText.includes('patient')) {
            console.log('🔄 Trying Method 3: Field extraction...');
            try {
                const extractField = (field) => {
                    const patterns = [
                        new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'),
                        new RegExp(`${field}\\s*:\\s*"([^"]*)"`, 'i'),
                    ];
                    for (const p of patterns) {
                        const m = cleanText.match(p);
                        if (m) return m[1].trim();
                    }
                    return '';
                };
                
                soapNote = {
                    patient: extractField('patient') || '[Patient Name]',
                    date: extractField('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
                    dentist: extractField('dentist') || '[Dentist Name]',
                    visitType: extractField('visitType') || 'Dental Examination',
                    chiefComplaint: extractField('chiefComplaint') || '- See transcript',
                    historyOfPresentIllness: extractField('historyOfPresentIllness') || '- See transcript',
                    medicalHistory: extractField('medicalHistory') || 'Not discussed',
                    dentalHistory: extractField('dentalHistory') || '- See transcript',
                    intraOralExamination: extractField('intraOralExamination') || '- Examination pending',
                    diagnosticProcedures: extractField('diagnosticProcedures') || '- To be determined',
                    assessment: extractField('assessment') || '- Assessment pending',
                    educationRecommendations: extractField('educationRecommendations') || '- Maintain oral hygiene',
                    patientResponse: extractField('patientResponse') || '- Acknowledged',
                    plan: extractField('plan') || '- Follow up as needed'
                };
                console.log('✅ Method 3: Field extraction worked');
            } catch (e3) {
                console.log('⚠️ Method 3 failed:', e3.message);
            }
        }

        // If still no valid note, use fast fallback
        if (!soapNote) {
            console.log('⚠️ All parsing failed, using fast fallback');
            const today = new Date();
            const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const text = String(transcription || '').trim();
            
            // Quick extraction from transcription
            let patientName = '[Patient Name]';
            const pMatch = text.match(/(?:patient|name|this is)\s+([A-Z][a-z]+)/i);
            if (pMatch) patientName = pMatch[1];
            
            let dentistName = '[Dentist Name]';
            const dMatch = text.match(/(?:Dr\.?)\s+([A-Z][a-z]+)/i);
            if (dMatch) dentistName = 'Dr. ' + dMatch[1];

            soapNote = {
                patient: patientName,
                date: dateStr,
                dentist: dentistName,
                visitType: 'Dental Examination & Consultation',
                chiefComplaint: text.substring(0, 300) || '- See transcript',
                historyOfPresentIllness: '- See chief complaint',
                medicalHistory: 'Not discussed',
                dentalHistory: '- See transcript',
                intraOralExamination: '- Examination pending',
                diagnosticProcedures: '- To be determined',
                assessment: '- Assessment pending',
                educationRecommendations: '- Maintain oral hygiene',
                patientResponse: '- Acknowledged',
                plan: '- Follow up as needed'
            };
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

        // Ensure arrays exist (no longer used but kept for backward compatibility)
        soapNote.icdCodes = [];
        soapNote.cptCodes = [];

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

        // Fast fallback - extract from transcription directly
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        const text = String(transcription || '').trim();
        
        let patientName = '[Patient Name]';
        const pMatch = text.match(/(?:patient|name|this is)\s+([A-Z][a-z]+)/i);
        if (pMatch) patientName = pMatch[1];
        
        let dentistName = '[Dentist Name]';
        const dMatch = text.match(/(?:Dr\.?)\s+([A-Z][a-z]+)/i);
        if (dMatch) dentistName = 'Dr. ' + dMatch[1];

        return {
            _error: errMsg,
            patient: patientName,
            date: dateStr,
            dentist: dentistName,
            visitType: 'Dental Examination & Consultation',
            chiefComplaint: text.substring(0, 300) || '- See transcript',
            historyOfPresentIllness: '- See chief complaint',
            medicalHistory: 'Not discussed',
            dentalHistory: '- See transcript',
            intraOralExamination: '- Examination pending',
            diagnosticProcedures: '- To be determined',
            assessment: '- Assessment pending',
            educationRecommendations: '- Maintain oral hygiene',
            patientResponse: '- Acknowledged',
            plan: '- Follow up as needed'
        };
    }
}

// Dual-mode dispatcher: legacy AI (AI_MODE=legacy) or current AI flow
const legacyModule = (() => {
  try { return require('./ai-service-legacy'); } catch { return null; }
})();

module.exports = {
  transcribeAudio: (audioBuffer) => {
    if (process.env.AI_MODE === 'legacy' && legacyModule && typeof legacyModule.transcribeAudio === 'function') {
      return legacyModule.transcribeAudio(audioBuffer);
    }
    return transcribeAudio(audioBuffer);
  },
  generateMedicalNote: async (transcription, domain) => {
    if (process.env.AI_MODE === 'legacy' && legacyModule && typeof legacyModule.generateMedicalNote === 'function') {
      return legacyModule.generateMedicalNote(transcription, domain);
    }
    return await generateMedicalNote(transcription, domain);
  }
};
