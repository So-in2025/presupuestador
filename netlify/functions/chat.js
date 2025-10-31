// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/generative-ai (Correct SDK for this environment)
 * Lógica de Intención: v26 - Content Studio Refactor
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pricingData = require('./pricing.json');

// --- CONSTANTS & CONFIGURATION ---
const MODEL_NAME = 'gemini-2.5-flash';
const IMAGE_MODEL_NAME = 'gemini-2.5-flash-image';

// --- PROMPT TEMPLATES ---
const ANALYZE_INSTRUCTION = `You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using '-' for each point. Do not greet, do not say goodbye, just return the list.`;

const OBJECTION_INSTRUCTION = `You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."`;

const BUILDER_INSTRUCTION_TEMPLATE = (serviceList, planList, contextText) => 
`Act as a JSON API. Analyze the user's request for a web project and build the perfect solution using ONLY the provided catalog. You MUST proactively identify opportunities for 'upsell' or 'cross-sell'. ${contextText}

--- AVAILABLE CATALOG ---
${serviceList}
${planList}

Your response MUST be a single, valid JSON object with the following structure: 
{ 
  "introduction": "...", 
  "services": [{ "id": "...", "name": "...", "priority": "..." }], 
  "closing": "...", 
  "client_questions": ["..."], 
  "sales_pitch": "..." 
}

**CRITICAL INSTRUCTIONS FOR 'services' ARRAY:**
1.  For each service object, you MUST include a "priority" key.
2.  The value for "priority" MUST be one of these three strings: "essential", "recommended", or "optional".
3.  **Classification Strategy:**
    -   **"essential":** Use for services that DIRECTLY fulfill the client's core request. This is the absolute minimum viable solution.
    -   **"recommended":** Use for high-value services that create the IDEAL solution. These are the key upsells that solve the client's problem better.
    -   **"optional":** Use for 'nice-to-have' extras, future improvements, or complementary services that are not critical right now.
4.  Do NOT add any text, markdown, or comments before or after the JSON object. Your entire response must be the raw JSON.`;


// REFINADO: PROMPTS PARA ESTUDIO DE CONTENIDO ---
const CONTENT_CREATOR_INSTRUCTION = `You are a professional social media manager specializing in the tech industry. Generate a social media post based on the user's instructions. The post should be engaging, professional, and include relevant hashtags. Adapt the length and tone for the specified platform.`;

const IMAGE_CREATOR_PROMPT_TEMPLATE = (style, concept, colors) => `Generate a high-quality, professional, and aesthetically pleasing image suitable for a social media campaign for a web development agency. The image must be visually striking and directly related to the provided concept.
- Style: ${style}
- Core Concept: ${concept}
- Color Palette: ${colors}
Do not include any text, logos, or watermarks in the image. The image should be clean and symbolic.`;


// --- PROMPT ENGINEERING HELPERS ---
function getSystemInstructionForMode(mode, context = {}) {
    switch (mode) {
        case 'analyze': return ANALYZE_INSTRUCTION;
        case 'objection': return OBJECTION_INSTRUCTION;
        case 'content-creator': return CONTENT_CREATOR_INSTRUCTION;
        case 'builder':
        default:
            const serviceList = Object.values(pricingData.allServices).flatMap(cat => cat.items).map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
            const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
            const contextText = (context.selectedServicesContext && context.selectedServicesContext.length > 0)
                ? `CONTEXT: The reseller has already selected: ${context.selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Avoid suggesting these items again and base your recommendations on complementing this selection.`
                : '';
            return BUILDER_INSTRUCTION_TEMPLATE(serviceList, planList, contextText);
    }
}

// --- INTELLIGENCE HELPERS ---
function createErrorJsonResponse(introduction, closing) {
    return JSON.stringify({
        introduction, services: [], closing,
        client_questions: ["¿Podrías reformular tu solicitud para ser más específico?"],
        sales_pitch: "El asistente no pudo generar una recomendación con la información actual."
    });
}

// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    if (!pricingData) return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Internal Server Error: Pricing configuration is not available.' }) };

    let body;
    try { body = JSON.parse(event.body); } 
    catch (e) { return { statusCode: 400, body: "Invalid JSON-formatted request body." }; }

    const { userMessage, history: historyFromClient, mode, context, apiKey } = body;
    if (!userMessage || !mode || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI({ apiKey });
        
        // --- IMAGE GENERATION LOGIC ---
        if (mode === 'image-creator') {
            const { style, concept, colors } = context;
            let finalConcept = concept;
            if (concept === 'general') {
                finalConcept = "A symbolic representation of digital innovation, business growth through technology, and professional web solutions.";
            } else {
                finalConcept = `A symbolic, visually appealing representation of the web service: "${concept}".`;
            }

            const prompt = IMAGE_CREATOR_PROMPT_TEMPLATE(style, finalConcept, colors);
            
            // Usando generateContent en lugar del obsoleto getGenerativeModel
            const result = await genAI.models.generateContent({
                model: IMAGE_MODEL_NAME,
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseModalities: ["IMAGE"]
                }
            });

            // Acceso correcto a la respuesta
            const imagePart = result.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (!imagePart || !imagePart.inlineData.data) {
                throw new Error("La IA no devolvió una imagen. Intenta con una combinación de opciones diferente.");
            }
            
            return {
                statusCode: 200,
                body: JSON.stringify({ base64Image: imagePart.inlineData.data })
            };
        }
        
        // --- TEXT GENERATION LOGIC (ALL OTHER MODES) ---
        let finalUserMessage = userMessage; // Default message
        
        if (mode === 'content-creator') {
            const { service, cta, platform, tone } = context;
            const cta_instruction = cta ? `If provided, naturally include this call to action: "${cta}".` : "Do not include a call to action unless it feels natural.";

            if (service === 'general') {
                finalUserMessage = `Write a social media post for ${platform} with a ${tone} tone. It should be a general promotion for a web development agency that offers a wide range of services (like websites, e-commerce, SEO, security). The goal is to build brand authority and attract potential clients. ${cta_instruction}`;
            } else {
                finalUserMessage = `Write a social media post for ${platform} with a ${tone} tone. The post must specifically promote the service: "${service}". Explain its benefits clearly and persuasively for a potential client. ${cta_instruction}`;
            }
        }

        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            systemInstruction: getSystemInstructionForMode(mode, context),
            generationConfig: mode === 'builder' ? { responseMimeType: "application/json" } : undefined
        });
        
        const chat = model.startChat({ history: (historyFromClient || []).slice(0, -1) });
        const result = await chat.sendMessage(finalUserMessage); // Usar el mensaje final
        const response = result.response;
        const responseText = response.text();

        const finalHistory = [...(historyFromClient || []), { role: 'model', parts: [{ text: responseText }] }];
        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: finalHistory })
        };

    } catch (err) {
        console.error("Error in Netlify function handler:", err);
        let userFriendlyMessage = "un error inesperado ocurrió al comunicarme con el asistente.";
        const errorMessage = err.message || err.toString();

        if (errorMessage.includes('API key not valid')) userFriendlyMessage = "Error de Autenticación: La API Key proporcionada no es válida.";
        else if (errorMessage.includes('billing account')) userFriendlyMessage = "Error de Facturación: La API Key es válida, pero no está asociada a un proyecto con facturación activa.";
        else if (err.status === 429 || errorMessage.includes('quota')) userFriendlyMessage = "Límite de Cuota Excedido: Has alcanzado el límite de solicitudes. Por favor, espera un momento.";
        else if (err.status >= 500) userFriendlyMessage = "el servicio de IA está experimentando problemas temporales. Inténtalo de nuevo más tarde.";
        else if (mode === 'image-creator' && errorMessage) userFriendlyMessage = errorMessage;

        const finalMessage = `Hubo un problema con la IA. ${userFriendlyMessage}`;
        const errorBody = (mode === 'builder')
            ? createErrorJsonResponse("Hubo un error de conexión con la IA.", `Detalles: ${userFriendlyMessage}`)
            : finalMessage;

        return {
            statusCode: 500, // Send a server error status for frontend to catch properly
            body: JSON.stringify({ error: true, message: userFriendlyMessage, response: errorBody, history: historyFromClient })
        };
    }
};