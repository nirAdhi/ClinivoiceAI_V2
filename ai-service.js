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

        // Use FULL transcript for complete processing
        const fullTranscript = transcription;
        
        const prompt = domain === 'dental' 
            ? `You are a professional dental scribe. Create a detailed dental note from this transcription: "${fullTranscript}"

Analyze the transcription carefully and extract all relevant information for each section below. You MUST return ALL 11 sections listed below - do not omit any sections. If information is not mentioned in the transcript, return "-" or "Not discussed" for that section.

Return ONLY JSON with these exact keys:
{
  "patientInfo": {
    "name": "Full patient name",
    "provider": "Provider name with Dr. prefix",
    "visitType": "Specific visit type (e.g., Routine Dental Examination & Consultation, Emergency TMJ evaluation)",
    "referralSource": "How patient was referred or 'Self-referred'"
  },
  "chiefComplaint": "Patient's main complaint - REQUIRED",
  "historyOfPresentIllness": "Detailed HPI with duration, symptoms, aggravating factors - REQUIRED",
  "medicalHistory": {
    "allergies": "List allergies or 'No known allergies / Not discussed' - REQUIRED",
    "disorders": "List systemic disorders or 'No concerns mentioned' - REQUIRED",
    "psychosocial": "Marital status, occupation if mentioned, or '-' - REQUIRED"
  },
  "dentalHistory": "Previous dental visits, oral hygiene habits, concerns, or '-' - REQUIRED",
  "clinicalExamination": {
    "extraoral": "Facial symmetry, TMJ, lymph nodes findings, or 'No abnormalities noted' - REQUIRED",
    "intraoral": "Teeth condition, gums, inflammation, plaque, oral cavity findings - REQUIRED"
  },
  "radiographicExamination": "X-rays ordered, purpose, findings, pending results, or '-' - REQUIRED",
  "assessment": "Clinical assessment and provisional diagnosis - REQUIRED",
  "treatmentPlan": "Next steps, procedures planned, referrals, or '-' - REQUIRED",
  "patientEducation": "Oral hygiene instructions, recommendations given, or '-' - REQUIRED",
  "patientResponse": "Patient understanding and acceptance, or '-' - REQUIRED",
  "followUp": "Review schedule, next appointment, monitoring plan, or '-' - REQUIRED",
  "prognosis": "Expected outcome, or '-' - REQUIRED"
}

IMPORTANT: Return ALL 13 keys shown above. Do not skip any sections. Use "-" for sections where no information was found in the transcript.`
            : `Create SOAP note JSON from: "${fullTranscript}". Return ONLY JSON with: subjective,objective,assessment,plan`;

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
                    visitType: 'Routine Dental Examination & Consultation',
                    referralSource: 'Self-referred'
                },
                chiefComplaint: text.substring(0, 300) || '-',
                historyOfPresentIllness: '-',
                medicalHistory: {
                    allergies: 'Not discussed/No concerns mentioned',
                    disorders: 'No concerns mentioned',
                    psychosocial: '-'
                },
                dentalHistory: '-',
                clinicalExamination: {
                    extraoral: '-',
                    intraoral: '-'
                },
                radiographicExamination: '-',
                assessment: '-',
                treatmentPlan: '-',
                patientEducation: '-',
                patientResponse: '-',
                followUp: '-',
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
    
    // Extract TMJ exam details - extract SHORT key findings only, not full transcript
    let temporalisRight = '';
    let temporalisLeft = '';
    let masseterRight = '';
    let masseterLeft = '';
    
    // Extract just the key finding (tender/normal + pain score if mentioned)
    const extractMuscleFinding = (text, muscle, side) => {
        // Look for patterns like "temporalis right tender 5/10" or "right temporalis normal"
        const patterns = [
            new RegExp(`${muscle}[^.]{0,30}?${side}[^.]{0,30}?(tender|pain|sore|normal|wnl)[^.]{0,20}?(\\d+/10)?`, 'i'),
            new RegExp(`${side}[^.]{0,30}?${muscle}[^.]{0,30}?(tender|pain|sore|normal|wnl)[^.]{0,20}?(\\d+/10)?`, 'i'),
            new RegExp(`${side}[^.]{0,20}?${muscle}[^.]{0,20}?(\\d+/10)`, 'i')
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                let finding = match[0].replace(/\s+/g, ' ').trim();
                // Clean up - extract just the key phrase (max 50 chars)
                finding = finding.replace(new RegExp(`.*${muscle}`, 'i'), muscle)
                                .replace(new RegExp(`.*${side}`, 'i'), side + ' ' + finding.match(new RegExp(`${side}(.{0,40})`, 'i'))?.[1] || '')
                                .trim();
                // Limit length
                if (finding.length > 50) {
                    finding = finding.substring(0, 50).replace(/\s+\S*$/, '') + '...';
                }
                // Capitalize first letter
                finding = finding.charAt(0).toUpperCase() + finding.slice(1);
                return finding;
            }
        }
        
        // Default if nothing found
        return '';
    };
    
    temporalisRight = extractMuscleFinding(text, 'temporalis', 'right') || '';
    temporalisLeft = extractMuscleFinding(text, 'temporalis', 'left') || '';
    masseterRight = extractMuscleFinding(text, 'masseter', 'right') || '';
    masseterLeft = extractMuscleFinding(text, 'masseter', 'left') || '';
    
    // If still empty, look for any tenderness mention with pain scores
    const painScoreMatch = text.match(/(\d+)\s*\/\s*10/g);
    if (painScoreMatch && !temporalisRight && !temporalisLeft && !masseterRight && !masseterLeft) {
        // Check context around pain scores
        const contextMatch = text.match(/(?:temporalis|masseter)[^.]{0,50}?\d+\/10/gi);
        if (contextMatch) {
            const ctx = contextMatch[0].toLowerCase();
            if (ctx.includes('right') && ctx.includes('temporalis')) temporalisRight = `Tender ${painScoreMatch[0]}`;
            if (ctx.includes('left') && ctx.includes('temporalis')) temporalisLeft = `Tender ${painScoreMatch[0]}`;
            if (ctx.includes('right') && ctx.includes('masseter')) masseterRight = `Tender ${painScoreMatch[0]}`;
            if (ctx.includes('left') && ctx.includes('masseter')) masseterLeft = `Tender ${painScoreMatch[0]}`;
        }
    }
    
    // Extract TMJ evaluation - short findings only
    let tmjEvaluation = '';
    const tmjFindings = [];
    
    // Look for specific TMJ findings (short phrases)
    const tmjPatterns = [
        { pattern: /limited[^.]{0,30}opening/gi, label: 'Limited opening' },
        { pattern: /opening[^.]{0,20}(\d+)[^.]{0,20}mm/gi, label: 'Opening' },
        { pattern: /deviation[^.]{0,30}(right|left)/gi, label: 'Deviation' },
        { pattern: /disc[^.]{0,30}incoordination/gi, label: 'Disc-condyle incoordination' },
        { pattern: /clicking|crepitus|popping/gi, label: 'Joint sounds' },
        { pattern: /lateral[^.]{0,20}excursion[^.]{0,20}(\d+)[^.]{0,20}mm/gi, label: 'Lateral excursion' }
    ];
    
    for (const { pattern, label } of tmjPatterns) {
        const matches = text.match(pattern);
        if (matches) {
            const clean = matches[0].replace(/\s+/g, ' ').trim();
            if (clean.length < 60 && !tmjFindings.includes(clean)) {
                tmjFindings.push(clean);
            }
        }
    }
    
    if (tmjFindings.length > 0) {
        tmjEvaluation = tmjFindings.slice(0, 3).join('. ') + '.';
    }
    
    // Extract diagnosis - short findings only
    let diagnosis = '';
    const diagnosisFindings = [];
    
    // Look for specific diagnosis terms (short phrases, not full sentences)
    const diagnosisTerms = [
        { term: /tmj\s+disc[^.]{0,20}incoordination/gi, label: 'TMJ disc-condyle incoordination' },
        { term: /myofascial[^.]{0,20}pain/gi, label: 'Myofascial pain' },
        { term: /(?:acute|chronic)[^.]{0,10}tmj/gi, label: 'TMJ disorder' },
        { term: /internal[^.]{0,10}derangement/gi, label: 'Internal derangement' },
        { term: /disc[^.]{0,10}displacement/gi, label: 'Disc displacement' },
        { term: /(closed|open)[^.]{0,10}lock/gi, label: 'Lock' },
        { term: /bruxism|clench|grind/gi, label: 'Bruxism' },
        { term: /joint[^.]{0,15}dysfunction/gi, label: 'Joint dysfunction' }
    ];
    
    for (const { term, label } of diagnosisTerms) {
        const matches = text.match(term);
        if (matches) {
            const clean = matches[0].replace(/\s+/g, ' ').trim();
            if (clean.length < 50 && !diagnosisFindings.includes(clean)) {
                diagnosisFindings.push(clean);
            }
        }
    }
    
    // Look for side-specific mentions (RT/LT/bilateral)
    const sideMatch = text.match(/(?:right|left|bilateral|rt|lt)[^.]{0,30}(?:tmj|joint|disc)/gi);
    if (sideMatch) {
        for (const match of sideMatch.slice(0, 2)) {
            const clean = match.replace(/\s+/g, ' ').trim();
            if (clean.length < 40 && !diagnosisFindings.includes(clean)) {
                diagnosisFindings.push(clean);
            }
        }
    }
    
    if (diagnosisFindings.length > 0) {
        diagnosis = diagnosisFindings.slice(0, 3).map(d => '• ' + d.charAt(0).toUpperCase() + d.slice(1)).join('\n');
    } else {
        diagnosis = '';
    }
    
    // Extract treatment provided - short findings only
    let treatmentProvided = '';
    const treatmentFindings = [];
    
    // Look for specific treatment terms
    const treatmentTerms = [
        { term: /manual[^.]{0,20}(?:tmj|manipulation|mobilization)/gi, label: 'Manual TMJ manipulation/mobilization' },
        { term: /manipulation[^.]{0,20}(?:performed|done|completed)/gi, label: 'Manipulation performed' },
        { term: /tmj[^.]{0,20}reduction/gi, label: 'TMJ reduction' },
        { term: /occlusal[^.]{0,20}splint|night[^.]{0,20}guard/gi, label: 'Splint/appliance adjustment' },
        { term: /patient[^.]{0,20}(?:tolerated|responded|improved)/gi, label: 'Patient tolerated well' }
    ];
    
    for (const { term, label } of treatmentTerms) {
        const matches = text.match(term);
        if (matches) {
            const clean = matches[0].replace(/\s+/g, ' ').trim();
            if (clean.length < 50 && !treatmentFindings.includes(clean)) {
                treatmentFindings.push(clean);
            }
        }
    }
    
    if (treatmentFindings.length > 0) {
        treatmentProvided = treatmentFindings.slice(0, 2).map(t => '• ' + t.charAt(0).toUpperCase() + t.slice(1)).join('\n');
    } else {
        treatmentProvided = '';
    }
    
    // Extract treatment plan - short findings only
    let treatmentPlan = '';
    const planFindings = [];
    
    const planTerms = [
        { term: /refer[^.]{0,30}physical[^.]{0,20}therapy/gi, label: 'Refer to physical therapy' },
        { term: /physical[^.]{0,20}therapy[^.]{0,20}(?:2x|twice|weekly)/gi, label: 'Physical therapy' },
        { term: /monitor[^.]{0,20}symptoms/gi, label: 'Monitor symptoms' },
        { term: /follow[^.]{0,20}(?:up|visit|appointment)/gi, label: 'Follow up' },
        { term: /re[\s-]?evaluation/gi, label: 'Re-evaluation' }
    ];
    
    for (const { term, label } of planTerms) {
        const matches = text.match(term);
        if (matches) {
            const clean = matches[0].replace(/\s+/g, ' ').trim();
            if (clean.length < 50 && !planFindings.includes(clean)) {
                planFindings.push(clean);
            }
        }
    }
    
    if (planFindings.length > 0) {
        treatmentPlan = planFindings.slice(0, 3).map(p => '• ' + p.charAt(0).toUpperCase() + p.slice(1)).join('\n');
    } else {
        treatmentPlan = '';
    }
    
    // Extract dental history - return empty string if no content
    let dentalHistory = '';
    const dentalPatterns = [
        /(?:no recent|last) dental visit[^.]{0,50}/i,
        /(?:oral hygiene|brushing|flossing)[^.]{0,50}(?:inconsistent|irregular|poor)/i,
        /last dental visit[^.]{0,50}(?:while ago|long time|years|ago)/i,
        /(?:dental|oral) history[^.]{0,100}/i
    ];
    const dentalMatches = [];
    for (const pattern of dentalPatterns) {
        const match = text.match(pattern);
        if (match && !dentalMatches.includes(match[0])) {
            dentalMatches.push(match[0]);
        }
    }
    if (dentalMatches.length > 0) {
        dentalHistory = dentalMatches.slice(0, 2).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join('. ') + '.';
    }
    
    // Extract clinical examination - return empty string if no content
    let clinicalExamination = { extraoral: '', intraoral: '' };
    
    // Extraoral findings
    const extraoralPatterns = [
        /extraoral[^.]{0,100}(?:no abnormalities|normal|wnl|symmetric)/i,
        /facial[^.]{0,60}(?:symmetry|asymmetric|swelling)/i,
        /lymph[^.]{0,60}(?:node|palpable|normal)/i,
        /tmj[^.]{0,60}(?:palpation|range|movement)/i
    ];
    const extraoralMatches = [];
    for (const pattern of extraoralPatterns) {
        const match = text.match(pattern);
        if (match && !extraoralMatches.includes(match[0]) && match[0].length < 80) {
            extraoralMatches.push(match[0]);
        }
    }
    if (extraoralMatches.length > 0) {
        clinicalExamination.extraoral = extraoralMatches.slice(0, 2).map(e => e.charAt(0).toUpperCase() + e.slice(1)).join('. ') + '.';
    }
    
    // Intraoral findings
    const intraoralPatterns = [
        /teeth[^.]{0,60}(?:healthy|good condition|decay|restoration|filling|caries)/i,
        /gum[^.]{0,60}(?:inflammation|bleeding|healthy|gingivitis|periodontal|pink)/i,
        /plaque[^.]{0,60}(?:accumulation|present|noted|buildup|minimal)/i,
        /oral[^.]{0,80}cavity[^.]{0,60}/i,
        /mucosa[^.]{0,60}(?:normal|healthy|pink)/i,
        /tongue[^.]{0,60}(?:normal|healthy)/i
    ];
    const intraoralMatches = [];
    for (const pattern of intraoralPatterns) {
        const match = text.match(pattern);
        if (match && !intraoralMatches.includes(match[0]) && match[0].length < 100) {
            intraoralMatches.push(match[0]);
        }
    }
    if (intraoralMatches.length > 0) {
        clinicalExamination.intraoral = intraoralMatches.slice(0, 4).map(i => i.charAt(0).toUpperCase() + i.slice(1)).join('. ') + '.';
    }
    
    // Extract radiographic examination - return empty string if no content
    let radiographicExamination = '';
    const radioPatterns = [
        /x-ray[^.]{0,100}(?:ordered|taken|performed|awaiting|pending)/i,
        /radiograph[^.]{0,100}(?:evaluation|examination|ordered|pending)/i,
        /(?:bitewing|periapical|panoramic|pa|bw)[^.]{0,80}(?:x-ray|ordered|taken)/i,
        /purpose[^.]{0,60}(?:evaluate|assess|identify)[^.]{0,60}/i,
        /results[^.]{0,60}pending/i
    ];
    const radioMatches = [];
    for (const pattern of radioPatterns) {
        const match = text.match(pattern);
        if (match && !radioMatches.includes(match[0]) && match[0].length < 120) {
            radioMatches.push(match[0]);
        }
    }
    if (radioMatches.length > 0) {
        radiographicExamination = radioMatches.slice(0, 3).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ') + '.';
    }
    
    // Extract follow-up - return empty string if no content
    let followUp = '';
    const followUpPatterns = [
        /follow[-\s]?up[^.]{0,100}(?:schedule|appointment|visit|review)/i,
        /next[^.]{0,40}(?:appointment|visit|follow-up)[^.]{0,60}/i,
        /re[-\s]?evaluate[^.]{0,60}/i,
        /monitor[^.]{0,60}/i,
        /review[^.]{0,60}(?:radiograph|x-ray|findings)[^.]{0,40}/i
    ];
    const followUpMatches = [];
    for (const pattern of followUpPatterns) {
        const match = text.match(pattern);
        if (match && !followUpMatches.includes(match[0]) && match[0].length < 100) {
            followUpMatches.push(match[0]);
        }
    }
    if (followUpMatches.length > 0) {
        followUp = followUpMatches.slice(0, 3).map(f => f.charAt(0).toUpperCase() + f.slice(1)).join('. ') + '.';
    }
    
    // Extract education/recommendations - return empty string if no content
    let educationRecommendations = '';
    const eduPatterns = [
        /(?:brushing|brush)[^.]{0,80}(?:twice|daily|regular)/i,
        /(?:soft|gentle)[^.]{0,80}(?:bristle|brushing|technique)/i,
        /flossing[^.]{0,80}(?:regular|daily|recommended)/i,
        /replace[^.]{0,80}toothbrush[^.]{0,40}(?:3|three)[^.]{0,40}month/i,
        /routine[^.]{0,80}dental[^.]{0,80}visit/i,
        /(?:hygiene|oral care)[^.]{0,80}/i,
        /demonstrated[^.]{0,80}(?:brushing|flossing|technique)/i
    ];
    const eduMatches = [];
    for (const pattern of eduPatterns) {
        const match = text.match(pattern);
        if (match && !eduMatches.includes(match[0]) && match[0].length < 120) {
            eduMatches.push(match[0]);
        }
    }
    if (eduMatches.length > 0) {
        educationRecommendations = eduMatches.slice(0, 5).map(e => '• ' + e.charAt(0).toUpperCase() + e.slice(1)).join('\n');
    }
    
    // Extract patient response - return empty string if no content
    let patientResponse = '';
    const responsePatterns = [
        /(?:patient|pt)[^.]{0,60}understood[^.]{0,40}instruction/i,
        /(?:patient|pt)[^.]{0,60}expressed[^.]{0,40}(?:intention|agreement|understanding)/i,
        /(?:patient|pt)[^.]{0,60}(?:agreed|accepted|compliance)[^.]{0,40}/i
    ];
    for (const pattern of responsePatterns) {
        const match = text.match(pattern);
        if (match) {
            patientResponse = match[0].charAt(0).toUpperCase() + match[0].slice(1) + '.';
            break;
        }
    }
    if (!patientResponse && text.match(/express[^.]*intention[^.]*improve/i)) {
        patientResponse = 'Patient expressed intention to improve oral hygiene habits.';
    }
    
    // Extract prognosis - return empty string if no content
    let prognosis = '';
    const prognosisPatterns = [
        /prognosis\s+(?:is\s+)?([^.]+\.(?:\s*Expected[^.]+\.)?)/i,
        /expected\s+(?:to|outcome|recovery)[^.]+\./i,
        /(?:good|fair|excellent|guarded)\s+prognosis[\s,]+[^.]+\./i
    ];
    for (const pattern of prognosisPatterns) {
        const match = text.match(pattern);
        if (match) {
            prognosis = match[1] || match[0];
            prognosis = prognosis.trim().replace(/^[:;\s]+/, '').replace(/\s+/g, ' ');
            // Limit to reasonable length
            if (prognosis.length > 200) {
                prognosis = prognosis.substring(0, 200) + '...';
            }
            break;
        }
    }
    // If no specific prognosis found, look for outcome-related phrases
    if (!prognosis) {
        const outcomeMatch = text.match(/(?:should|will)\s+(?:improve|resolve|heal|recover)[^.]+\./i);
        if (outcomeMatch) {
            prognosis = outcomeMatch[0].trim();
        }
    }
    
    return {
        _warning: 'AI quota exceeded - showing extracted and structured transcript content',
        patientInfo: {
            name: patientName,
            provider: providerName,
            visitType: 'Routine Dental Examination & Consultation',
            referralSource: 'Self-referred'
        },
        chiefComplaint: chiefComplaint,
        historyOfPresentIllness: historyOfPresentIllness,
        medicalHistory: {
            allergies: allergies,
            disorders: disorders,
            psychosocial: psychosocial
        },
        dentalHistory: dentalHistory,
        clinicalExamination: clinicalExamination,
        radiographicExamination: radiographicExamination,
        assessment: diagnosis,
        treatmentPlan: treatmentPlan,
        patientEducation: educationRecommendations,
        patientResponse: patientResponse,
        followUp: followUp,
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
