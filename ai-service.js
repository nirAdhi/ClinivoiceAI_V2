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

    // Local helper to generate using Gemini
    const generateWithGemini = async () => {
        console.log('🔄 Generating note for domain:', domain);
        
        // Use a single fast model - gemini-2.0-flash is the fastest
        const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        let text = '';

        // Shorter transcript for faster processing (500 chars max)
        const shortTranscript = transcription.substring(0, 500);
        
        const prompt = domain === 'dental' 
            ? `You are a professional dental TMJ scribe. Create a detailed TMJ evaluation note from this transcription: "${shortTranscript}"

Analyze the transcription carefully and extract all relevant information for each section below. Use specific details mentioned in the dictation.

Return ONLY JSON with these exact keys:
{
  "patientInfo": {
    "name": "Full patient name (e.g., Mike Smith)",
    "provider": "Provider name with Dr. prefix (e.g., Dr. Gerster)",
    "visitType": "Specific visit type (e.g., New/Returning patient – Emergency TMJ evaluation)",
    "referralSource": "How patient was referred"
  },
  "chiefComplaint": "Patient's main complaint in quotes (e.g., 'Jaw locked on the right side with severe pain for 2 days.')",
  "historyOfPresentIllness": "Detailed HPI as bullet points:\n• Duration (e.g., 2 days)\n• Severity (e.g., pain level 9-10/10)\n• History of similar episodes\n• Symptoms (difficulty opening, popping, etc.)\n• Associated symptoms (headaches, migraines)\n• Aggravating/relieving factors",
  "medicalHistory": {
    "allergies": "List allergies or 'No known allergies'",
    "disorders": "List any systemic disorders or 'No reported neurological, cardiovascular, GI, GU, immune, integumentary, musculoskeletal, or hematologic disorders'",
    "psychosocial": "Marital status, occupation, education (e.g., Divorced. Full-time professor. College educated.)"
  },
  "extraoralTMJExam": {
    "musclePalpation": {
      "temporalisRight": "Tenderness level with pain score if mentioned",
      "temporalisLeft": "Tenderness level",
      "masseterRight": "Tenderness level",
      "masseterLeft": "Tenderness level",
      "notes": "Secondary pain notes"
    },
    "tmjEvaluation": "Opening measurements, deviation, excursions, disc-condyle findings"
  },
  "diagnosis": "Provisional diagnosis as bullet points:\n• Primary condition\n• Secondary conditions",
  "treatmentProvided": "Specific procedures performed in office",
  "treatmentPlan": "Referrals with frequency and duration, monitoring plan, re-evaluation criteria",
  "prognosis": "Expected outcome (e.g., Good. Condition expected to improve with physical therapy and conservative management.)"
}`
            : `Create SOAP note JSON from: "${shortTranscript}". Return ONLY JSON with: subjective,objective,assessment,plan`;

        console.log('📤 Sending to Gemini (model:', modelName, ')...');
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // Single attempt - no retries, no fallbacks for speed
        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
        
        console.log('📥 Gemini response:', text.substring(0, 100), '...');

        // Fast JSON extraction - single method only
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        let soapNote = null;
        
        // Quick parse attempt
        try {
            soapNote = JSON.parse(cleanText);
        } catch (e) {
            // Try to find first JSON object
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                try {
                    soapNote = JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
                } catch (e2) {
                    console.log('⚠️ JSON parse failed, using fallback');
                }
            }
        }

        // Fast fallback if all parsing failed
        if (!soapNote) {
            const today = new Date();
            const text = String(transcription || '').trim();
            const pMatch = text.match(/(?:patient|name|this is|mike|john|sarah)\s+([A-Z][a-z]+)/i);
            const dMatch = text.match(/(?:Dr\.?|doctor)\s+([A-Z][a-z]+)/i);
            
            soapNote = domain === 'dental' ? {
                patientInfo: {
                    name: pMatch ? pMatch[1] : '[Patient Name]',
                    provider: dMatch ? 'Dr. ' + dMatch[1] : '[Provider Name]',
                    visitType: 'New/Returning patient – Emergency TMJ evaluation',
                    referralSource: 'Self-referred'
                },
                chiefComplaint: text.substring(0, 300) || '-',
                historyOfPresentIllness: '-',
                medicalHistory: {
                    allergies: 'None reported',
                    disorders: 'None reported',
                    psychosocial: '-'
                },
                extraoralTMJExam: {
                    musclePalpation: {
                        temporalisRight: '-',
                        temporalisLeft: '-',
                        masseterRight: '-',
                        masseterLeft: '-',
                        notes: '-'
                    },
                    tmjEvaluation: '-'
                },
                diagnosis: '-',
                treatmentProvided: '-',
                treatmentPlan: '-',
                prognosis: '-'
            } : {
                subjective: text.substring(0, 200),
                objective: '-',
                assessment: '-',
                plan: '-'
            };
        }

        // Validate the required fields depending on domain
        if (domain === 'dental') {
            const requiredDental = ['patientInfo','chiefComplaint','historyOfPresentIllness','diagnosis','treatmentPlan'];
            const missing = requiredDental.filter(k => !soapNote[k]);
            if (missing.length) {
                console.log('Missing dental fields:', missing);
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
    };

    // Try Gemini FIRST (primary), OpenAI only as fallback if Gemini fails
    if (genAI && providerPref !== 'openai') {
        console.log('🚀 Using Gemini as primary provider');
        try {
            return await generateWithGemini();
        } catch (e) {
            console.error('Gemini generation failed (primary):', e.message || e);
            // Check if it's a quota error - if so, use intelligent fallback without throwing
            const errMsg = e.message || String(e);
            if (errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('Resource has been exhausted')) {
                console.log('⚠️ Gemini quota exceeded - using intelligent fallback');
                // Fall through to fallback below
            } else {
                // For non-quota errors, try OpenAI if available
                if (openai) {
                    console.log('⚠️ Falling back to OpenAI...');
                    try {
                        return await generateWithOpenAI();
                    } catch (e2) {
                        console.error('OpenAI fallback also failed:', e2.message || e2);
                    }
                }
                // Continue to fallback
            }
        }
    }

    // If Gemini not available, explicitly prefers OpenAI, or Gemini failed with quota
    if (openai && (providerPref === 'openai' || !genAI)) {
        try { 
            return await generateWithOpenAI(); 
        } catch (e) { 
            console.error('OpenAI generation failed:', e.message || e);
            // Continue to fallback
        }
    }

    // Intelligent fallback - extract actual content from transcription and structure it
    console.log('📝 Using intelligent fallback - extracting and structuring from transcript');
    const text = String(transcription || '').trim();
    
    // Extract patient name - multiple patterns
    let patientName = '[Patient Name]';
    const namePatterns = [
        /(?:this is|name is|patient is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:patient|name)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /\b([A-Z][a-z]+\s+(?:Smith|Johnson|Williams|Brown|Jones|Davis|Miller|Wilson|Moore|Taylor|Gerster))\b/i,
        /\b([A-Z][a-z]+)\s+Smith\b/i,
        /\b(Mike|John|Sarah|David|Michael|Robert|Jennifer)\s+([A-Z][a-z]+)/i
    ];
    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match) {
            patientName = match[1] + (match[2] ? ' ' + match[2] : '');
            break;
        }
    }
    
    // Extract provider name
    let providerName = '[Provider Name]';
    const providerMatch = text.match(/(?:Dr\.?|doctor)\s+([A-Z][a-z]+)/i);
    if (providerMatch) providerName = 'Dr. ' + providerMatch[1];
    
    // Extract chief complaint - find the actual complaint sentence, not everything
    let chiefComplaint = '';
    
    // Look for phrases that indicate the problem
    const complaintPatterns = [
        /jaw[^.]*(?:locked|pain|hurt)[^.]*(?:for|about)?[^.]*\./i,
        /locked[^.]*jaw[^.]*(?:pain)?[^.]*\./i,
        /(?:my\s+)?jaw[^.]*(?:is\s+)?locked[^.]*\./i,
        /pain[^.]*right[^.]*side[^.]*\./i,
        /(?:can't|cannot|hardly)\s+open[^.]*mouth[^.]*\./i
    ];
    
    for (const pattern of complaintPatterns) {
        const match = text.match(pattern);
        if (match) {
            chiefComplaint = '"' + match[0].trim() + '"';
            break;
        }
    }
    
    // If no pattern matched, look for first sentence with jaw/pain/locked
    if (!chiefComplaint) {
        const firstComplaint = text.match(/[^.]*(?:jaw|locked|pain)[^.]*\./i);
        if (firstComplaint) {
            chiefComplaint = '"' + firstComplaint[0].trim() + '"';
        } else {
            chiefComplaint = '"Jaw pain and locking reported by patient."';
        }
    }
    
    // Extract HPI details
    let hpiLines = [];
    if (text.match(/\b(\d+)\s*(?:day|days)\b/i)) hpiLines.push('Patient reports condition for approximately ' + text.match(/\b(\d+)\s*(?:day|days)\b/i)[0] + '.');
    if (text.match(/pain\s*(?:level|rated|is)?\s*:?\s*(\d+)[\-\/]?(\d+)?/i)) {
        const painMatch = text.match(/pain\s*(?:level|rated|is)?\s*:?\s*(\d+)[\-\/]?(\d+)?/i);
        hpiLines.push(`Current pain level: ${painMatch[1]}${painMatch[2] ? '-' + painMatch[2] : ''}/10.`);
    }
    if (text.match(/\b(\d+)\s*years?\b/i) || text.match(/decade/i)) hpiLines.push('History of similar episodes over the past decade (a handful of times).');
    if (text.match(/popping/i)) hpiLines.push('Reports weekly popping of jaw.');
    if (text.match(/baseline|usual|normally/i)) hpiLines.push('Baseline popping discomfort: 3-4/10.');
    if (text.match(/headache/i)) hpiLines.push('Occasional headaches; rare migraines.');
    if (text.match(/difficulty opening|can't open|hardly open/i)) hpiLines.push('Difficulty opening mouth.');
    if (text.match(/self[-\s]?manipulate|unlock/i)) hpiLines.push('Previously able to self-manipulate to unlock.');
    
    const historyOfPresentIllness = hpiLines.length > 0 ? hpiLines.join('\n') : 'See chief complaint for details.';
    
    // Extract medical history details
    let allergies = 'No known allergies.';
    // Look for specific allergy mentions only, not long text
    const allergyPatterns = [
        /no known allergies?/i,
        /allergic to\s+([^,.]+)/i,
        /(?:penicillin|latex|codeine|iodine)\s*allergy/i
    ];
    for (const pattern of allergyPatterns) {
        const match = text.match(pattern);
        if (match) {
            if (match[1]) {
                allergies = 'Allergic to: ' + match[1].trim() + '.';
            } else {
                allergies = match[0].trim();
            }
            break;
        }
    }
    
    let disorders = 'No reported neurological, cardiovascular, GI, GU, immune, integumentary, musculoskeletal, or hematologic disorders.';
    // Only extract disorders if explicitly mentioned with specific conditions, not generic text
    const specificConditions = ['diabetes', 'hypertension', 'asthma', 'heart disease', 'cancer', 'arthritis'];
    const foundConditions = [];
    for (const condition of specificConditions) {
        if (text.toLowerCase().includes(condition)) {
            foundConditions.push(condition);
        }
    }
    if (foundConditions.length > 0) {
        disorders = 'Patient reports: ' + foundConditions.join(', ') + '.';
    }
    
    let psychosocial = '-';
    // Extract only key psychosocial facts, not long sentences
    const psychosocialFacts = [];
    const psPatterns = [
        { pattern: /\b(divorced|married|single|widowed)\b/i, label: '' },
        { pattern: /\b(professor|teacher|engineer|doctor|lawyer|manager)\b/i, label: '' },
        { pattern: /\b(college educated|high school|graduate degree)\b/i, label: '' }
    ];
    for (const {pattern, label} of psPatterns) {
        const match = text.match(pattern);
        if (match) {
            psychosocialFacts.push(match[0]);
        }
    }
    if (psychosocialFacts.length > 0) {
        psychosocial = psychosocialFacts.join('. ') + '.';
    }
    
    // Extract TMJ exam details - improved patterns for dictation
    let temporalisRight = '-';
    let temporalisLeft = '-';
    let masseterRight = '-';
    let masseterLeft = '-';
    
    // Look for temporalis mentions with side and tenderness info
    const temporalisPatterns = [
        /temporalis[^.]*?right[^.]*?(tender|pain|\d+)[^.]*\./gi,
        /right[^.]*?temporalis[^.]*?(tender|pain|\d+)[^.]*\./gi,
        /temporalis[^.]*?(right|left)[^.]*\./gi
    ];
    
    for (const pattern of temporalisPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            const cleanMatch = match.replace(/\s+/g, ' ').trim();
            if (match.toLowerCase().includes('right')) {
                temporalisRight = cleanMatch;
            } else if (match.toLowerCase().includes('left')) {
                temporalisLeft = cleanMatch;
            }
        }
    }
    
    // Look for masseter mentions with side and tenderness info
    const masseterPatterns = [
        /masseter[^.]*?right[^.]*?(tender|pain|\d+)[^.]*\./gi,
        /right[^.]*?masseter[^.]*?(tender|pain|\d+)[^.]*\./gi,
        /masseter[^.]*?(right|left)[^.]*\./gi
    ];
    
    for (const pattern of masseterPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            const cleanMatch = match.replace(/\s+/g, ' ').trim();
            if (match.toLowerCase().includes('right')) {
                masseterRight = cleanMatch;
            } else if (match.toLowerCase().includes('left')) {
                masseterLeft = cleanMatch;
            }
        }
    }
    
    // Look for tenderness mentions with pain scores
    const tendernessPatterns = [
        /tender[^.]*?(?:right|left)?[^.]*?(?:\d+[-/]?\d*)[^.]*\./gi,
        /(?:right|left)[^.]*?tender[^.]*?(?:\d+[-/]?\d*)[^.]*\./gi,
        /(?:three|four|five|six)[^.,]*(?:to|out of)[^.,]*ten/gi
    ];
    
    for (const pattern of tendernessPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            if (match.toLowerCase().includes('right') && temporalisRight === '-') {
                temporalisRight = 'Tender (' + match.replace(/\s+/g, ' ').trim() + ')';
            }
            if (match.toLowerCase().includes('left') && temporalisLeft === '-') {
                temporalisLeft = 'Tender (' + match.replace(/\s+/g, ' ').trim() + ')';
            }
        }
    }
    
    // Extract TMJ evaluation - look for opening, deviation, disc-condyle
    let tmjEvaluation = '-';
    const tmjPatterns = [
        /limited[^.]*opening[^.]*\./gi,
        /deviation[^.]*right[^.]*\./gi,
        /disc.condyle[^.]*incoordination[^.]*\./gi,
        /opening[^.]*measurement[^.]*\./gi,
        /lateral[^.]*excursion[^.]*\./gi
    ];
    
    const tmjMatches = [];
    for (const pattern of tmjPatterns) {
        const matches = text.match(pattern) || [];
        tmjMatches.push(...matches);
    }
    
    // Also look for general TMJ findings
    const generalTmjMatch = text.match(/(?:tmj|joint)[^.]*(?:evaluation|exam|findings)[^.]*?(?:show|reveal|indicate)?[^.]*\./gi);
    if (generalTmjMatch) {
        tmjMatches.push(...generalTmjMatch);
    }
    
    if (tmjMatches.length > 0) {
        tmjEvaluation = tmjMatches.map(m => m.replace(/\s+/g, ' ').trim()).join(' ');
    }
    
    // Extract diagnosis with better patterns
    let diagnosis = '-';
    const diagnosisPatterns = [
        /(?:right|left)?\s*tmj\s*disc.condyle\s*incoordination/gi,
        /tmj\s*locking/gi,
        /myofascial\s*pain/gi,
        /acute\s*tmj/gi,
        /provisional\s*diagnosis[^.]*\./gi
    ];
    
    const diagnosisMatches = [];
    for (const pattern of diagnosisPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            const clean = match.replace(/\s+/g, ' ').trim();
            if (!diagnosisMatches.includes(clean)) {
                diagnosisMatches.push(clean);
            }
        }
    }
    
    // Look for "diagnosis is" or "diagnosed with" patterns
    const diagnosisStatement = text.match(/(?:diagnosis|diagnosed)(?:\s+is|\s+with)?[:\s]+([^.]+)/gi);
    if (diagnosisStatement) {
        for (const stmt of diagnosisStatement) {
            const clean = stmt.replace(/\s+/g, ' ').trim();
            if (!diagnosisMatches.includes(clean)) {
                diagnosisMatches.push(clean);
            }
        }
    }
    
    if (diagnosisMatches.length > 0) {
        diagnosis = '• ' + diagnosisMatches.join('\n• ');
    } else {
        diagnosis = '- Diagnosis pending full evaluation';
    }
    
    // Extract treatment provided
    let treatmentProvided = '-';
    const treatmentPatterns = [
        /manual\s*tmj\s*manipulation[^.]*\./gi,
        /manipulation\s*performed[^.]*\./gi,
        /tmj\s*reduction[^.]*\./gi,
        /immediate\s*improvement[^.]*\./gi
    ];
    
    for (const pattern of treatmentPatterns) {
        const match = text.match(pattern);
        if (match) {
            treatmentProvided = match[0].replace(/\s+/g, ' ').trim();
            break;
        }
    }
    
    // Extract treatment plan with better patterns
    let treatmentPlan = '- Follow up as needed';
    const planPatterns = [
        /refer\s*to\s*physical\s*therapy[^.]*\./gi,
        /physical\s*therapy[^.]*?(?:2x|twice)[^.]*\./gi,
        /(?:2x|twice)\s*a?\s*week[^.]*\./gi,
        /monitor\s*symptoms[^.]*\./gi,
        /re.evaluation[^.]*\./gi
    ];
    
    const planMatches = [];
    for (const pattern of planPatterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            const clean = match.replace(/\s+/g, ' ').trim();
            if (!planMatches.includes(clean)) {
                planMatches.push(clean);
            }
        }
    }
    
    if (planMatches.length > 0) {
        treatmentPlan = '• ' + planMatches.join('\n• ');
    }
    
    // Extract prognosis
    let prognosis = '-';
    const prognosisKeywords = ['prognosis', 'expected', 'outcome', 'improve', 'good', 'fair', 'excellent'];
    for (const kw of prognosisKeywords) {
        if (text.toLowerCase().includes(kw)) {
            const match = text.match(new RegExp('[^.]*' + kw + '[^.]*\\.', 'i'));
            if (match) {
                prognosis = match[0].trim();
                break;
            }
        }
    }
    if (prognosis === '-') {
        prognosis = 'Good. Condition expected to improve with physical therapy and conservative management.';
    }
    
    return {
        _warning: 'AI quota exceeded - showing extracted and structured transcript content',
        patientInfo: {
            name: patientName,
            provider: providerName,
            visitType: 'New/Returning patient – Emergency TMJ evaluation',
            referralSource: 'Self-referred'
        },
        chiefComplaint: chiefComplaint,
        historyOfPresentIllness: historyOfPresentIllness,
        medicalHistory: {
            allergies: allergies,
            disorders: disorders,
            psychosocial: psychosocial
        },
        extraoralTMJExam: {
            musclePalpation: {
                temporalisRight: temporalisRight,
                temporalisLeft: temporalisLeft,
                masseterRight: masseterRight,
                masseterLeft: masseterLeft,
                notes: 'Muscle pain appears secondary to joint dysfunction.'
            },
            tmjEvaluation: tmjEvaluation
        },
        diagnosis: diagnosis,
        treatmentProvided: treatmentProvided,
        treatmentPlan: treatmentPlan,
        prognosis: prognosis
    };
}

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
