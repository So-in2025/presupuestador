// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/generative-ai (Correct SDK for this environment)
 * Lógica de Intención: v21 - Infallible JSON Mode
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pricingData = require('./pricing.json');

// --- CONSTANTS & CONFIGURATION ---
const MODEL_NAME = 'gemini-2.5-flash'; // Optimized for speed, cost, and free tier

// --- PROMPT TEMPLATES ---

const ANALYZE_INSTRUCTION = `You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using '-' for each point. Do not greet, do not say goodbye, just return the list.`;

const OBJECTION_INSTRUCTION = `You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."`;

const BUILDER_INSTRUCTION_TEMPLATE = (serviceList, planList, contextText) => 
`Act as a JSON API. Your response MUST be a single, valid JSON object and nothing else. Analyze the user's request for a web project and build the perfect solution using ONLY items from the provided catalog. You MUST proactively identify opportunities for 'upsell' or 'cross-sell' based on the user's needs. ${contextText}

--- AVAILABLE CATALOG ---
${serviceList}
${planList}

--- REQUIRED JSON STRUCTURE ---
Your response MUST conform to this exact structure: { "introduction": "A brief, friendly opening for the proposal.", "services": [{ "id": "The exact ID from the catalog.", "is_new": false, "name": "The service name.", "description": "A brief justification for why this service was chosen.", "price": 123.45 }], "closing": "A confident closing statement.", "client_questions": ["Three strategic questions to ask the client to further the sale."], "sales_pitch": "A concise sales argument for the end client." }.`;

// --- PROMPT ENGINEERING HELPERS ---

function getSystemInstructionForMode(mode, selectedServicesContext = []) {
    const contextText = (selectedServicesContext && selectedServicesContext.length > 0)
        ? `CONTEXT: The reseller has already selected: ${selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Avoid suggesting these items again and base your recommendations on complementing this selection.`
        : '';

    switch (mode) {
        case 'analyze': return ANALYZE_INSTRUCTION;
        case 'objection': return OBJECTION_INSTRUCTION;
        case 'builder':
        default:
            const serviceList = Object.values(pricingData.allServices).flatMap(cat => cat.items).map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
            const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
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
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (!pricingData) {
        return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Internal Server Error: Pricing configuration is not available.' }) };
    }

    let body;
    try { body = JSON.parse(event.body); } 
    catch (e) { return { statusCode: 400, body: "Invalid JSON-formatted request body." }; }

    const { userMessage, history: historyFromClient, mode, selectedServicesContext, apiKey } = body;
    if (!userMessage || !historyFromClient || !mode || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request. Missing required parameters." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // --- Infallible JSON Mode Configuration ---
        const generationConfig = mode === 'builder'
            ? { responseMimeType: "application/json" }
            : undefined;

        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            systemInstruction: getSystemInstructionForMode(mode, selectedServicesContext),
            generationConfig: generationConfig
        });
        
        const chat = model.startChat({
            history: historyFromClient.slice(0, -1),
        });
        
        const result = await chat.sendMessage(userMessage);
        const response = result.response;
        const responseText = response.text();

        // The response is now guaranteed to be valid JSON in builder mode, or text otherwise.
        const updatedHistory = [...historyFromClient, { role: 'model', parts: [{ text: responseText }] }];
        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: updatedHistory })
        };

    } catch (err) {
        console.error("Error in Netlify function handler:", err);
        
        // --- Enhanced Error Handling ---
        let userFriendlyMessage = "un error inesperado ocurrió al comunicarme con el asistente.";
        const errorMessage = err.message || err.toString();

        if (errorMessage.includes('API key not valid')) {
            userFriendlyMessage = "Error de Autenticación: La API Key proporcionada no es válida. Por favor, verifica que la has copiado correctamente.";
        } else if (errorMessage.includes('billing account')) {
            userFriendlyMessage = "Error de Facturación: La API Key es válida, pero no está asociada a un proyecto con una cuenta de facturación activa. Revisa tu configuración en Google Cloud.";
        } else if (err.status === 429 || errorMessage.includes('quota')) {
            userFriendlyMessage = "Límite de Cuota Excedido: Has alcanzado el límite de solicitudes para tu API Key. Por favor, espera un momento o revisa los límites de tu cuenta.";
        } else if (err.status >= 500) {
            userFriendlyMessage = "el servicio de IA está experimentando problemas temporales. Por favor, inténtalo de nuevo más tarde.";
        }
        
        const finalMessage = `Hubo un problema con la IA. ${userFriendlyMessage}`;

        const errorJson = (mode === 'builder')
            ? createErrorJsonResponse("Hubo un error de conexión con la IA.", `Detalles: ${userFriendlyMessage}`)
            : finalMessage;

        const errorHistory = [...historyFromClient, { role: 'model', parts: [{ text: errorJson }] }];
        return {
            statusCode: 200, // Return 200 for graceful frontend handling
            body: JSON.stringify({ response: errorJson, history: errorHistory })
        };
    }
};
