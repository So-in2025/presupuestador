// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/genai (Modern SDK)
 * Lógica de Intención: v20 - Modern SDK with Enhanced Error Handling
 */
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// --- CONSTANTS & CONFIGURATION ---
const MAX_RETRIES = 3;
const MODEL_NAME = 'gemini-2.5-pro'; // Centralized model name

let pricingData;
try {
    const pricingPath = path.resolve(process.env.LAMBDA_TASK_ROOT || __dirname, 'pricing.json');
    pricingData = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
} catch (err) {
    console.error("CRITICAL ERROR: Could not load pricing.json.", err);
    // This function will fail gracefully if pricingData is not available.
}

// --- PROMPT TEMPLATES ---

const ANALYZE_INSTRUCTION = `You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using '-' for each point. Do not greet, do not say goodbye, just return the list.`;

const OBJECTION_INSTRUCTION = `You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."`;

const BUILDER_INSTRUCTION_TEMPLATE = (serviceList, planList, contextText) => 
`Act as a JSON API. Analyze the user's request for a web project and build the perfect solution using the catalog. You MUST proactively identify opportunities for 'upsell' or 'cross-sell'. ${contextText}

--- AVAILABLE CATALOG ---
${serviceList}
${planList}

Your response MUST be a single valid JSON object with the following structure: { "introduction": "...", "services": [{ "id": "...", "is_new": false, "name": "...", "description": "...", "price": ... }], "closing": "...", "client_questions": ["..."], "sales_pitch": "..." }. Do not add any text before or after the JSON object.`;

const CORRECTION_PROMPT_TEMPLATE = (badResponse) => 
`Your previous response was invalid. It did not conform to the required JSON structure. 
Previous invalid response: \n\`\`\`\n${badResponse}\n\`\`\`\n
Correct your mistake. You MUST return ONLY the valid JSON object with the correct structure and content based on the original user request. Do not include apologies, explanations, or any other text outside the JSON object.`;


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

function extractAndValidateJson(text) {
    const match = text.match(/```(json)?\s*([\s\S]*?)\s*```/);
    let jsonString = text.trim();
    if (match && match[2]) {
        jsonString = match[2].trim();
    }
    
    try {
        const parsed = JSON.parse(jsonString);
        if (
            typeof parsed.introduction === 'string' &&
            Array.isArray(parsed.services) &&
            typeof parsed.closing === 'string' &&
            Array.isArray(parsed.client_questions) &&
            typeof parsed.sales_pitch === 'string'
        ) {
            return { isValid: true, json: parsed, jsonString };
        }
    } catch (e) { /* JSON parse failed */ }
    
    return { isValid: false, json: null, jsonString: text };
}

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
        const ai = new GoogleGenAI({ apiKey });

        // --- Standard Chat Logic for non-builder modes ---
        if (mode !== 'builder') {
            const chat = ai.chats.create({
                model: MODEL_NAME,
                history: historyFromClient.slice(0, -1), // Pass history up to the last user message
                config: { systemInstruction: getSystemInstructionForMode(mode) }
            });
            const response = await chat.sendMessage({ message: userMessage });
            const responseText = response.text;
            const updatedHistory = [...historyFromClient, { role: 'model', parts: [{ text: responseText }] }];
            return {
                statusCode: 200,
                body: JSON.stringify({ response: responseText, history: updatedHistory })
            };
        }

        // --- Fault-Tolerant, Self-Correcting Logic for 'builder' mode ---
        let lastResponseText = "";
        let finalResponseJsonString = "";
        let success = false;

        for (let i = 0; i < MAX_RETRIES; i++) {
            const prompt = (i === 0) ? userMessage : CORRECTION_PROMPT_TEMPLATE(lastResponseText);
            const contents = [...historyFromClient.slice(0, -1), { role: 'user', parts: [{ text: prompt }] }];
            
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: contents,
                config: { systemInstruction: getSystemInstructionForMode(mode, selectedServicesContext) }
            });

            lastResponseText = response.text;
            const validationResult = extractAndValidateJson(lastResponseText);
            
            if (validationResult.isValid) {
                finalResponseJsonString = validationResult.jsonString;
                success = true;
                break; // Exit loop on success
            }
            // If not valid, loop will continue with the correction prompt
        }
        
        if (!success) {
            console.error(`Failed to get valid JSON after ${MAX_RETRIES} attempts. Last response:`, lastResponseText);
            finalResponseJsonString = createErrorJsonResponse(
                `Lo siento, no pude generar una propuesta válida después de ${MAX_RETRIES} intentos. La IA no está respondiendo con el formato correcto.`,
                "Intenta simplificar o reformular tu solicitud. Por ejemplo: 'Crea una web simple para un restaurante'."
            );
        }

        const updatedHistory = [...historyFromClient, { role: 'model', parts: [{ text: finalResponseJsonString }] }];
        return {
            statusCode: 200,
            body: JSON.stringify({ response: finalResponseJsonString, history: updatedHistory })
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
        } else if (errorMessage.includes('quota')) {
            userFriendlyMessage = "Límite de Cuota Excedido: Has alcanzado el límite de solicitudes para tu API Key. Por favor, espera un momento o revisa los límites de tu cuenta.";
        } else if (err.status >= 500) {
            userFriendlyMessage = "el servicio de IA está experimentando problemas temporales. Por favor, inténtalo de nuevo más tarde.";
        }
        
        const finalMessage = `Hubo un problema con la IA. ${userFriendlyMessage}`;

        // Return error in the expected format for both builder and other modes
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