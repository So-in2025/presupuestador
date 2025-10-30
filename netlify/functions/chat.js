// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/generative-ai (Legacy SDK v0.24.1)
 * Lógica de Intención: v18 - Refactored for Clarity
 */
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONSTANTS & CONFIGURATION ---

let pricingData;
try {
    const pricingPath = path.resolve(__dirname, 'pricing.json');
    pricingData = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
} catch (err) {
    console.error("CRITICAL ERROR: Could not load pricing.json. Function will not work.", err);
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

// --- PROMPT ENGINEERING HELPERS ---

function getSystemInstructionForMode(mode, selectedServicesContext = []) {
    const contextText = (selectedServicesContext && selectedServicesContext.length > 0)
        ? `CONTEXT: The reseller has already selected: ${selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Avoid suggesting these items again and base your recommendations on complementing this selection.`
        : '';

    switch (mode) {
        case 'analyze':
            return ANALYZE_INSTRUCTION;
        case 'objection':
            return OBJECTION_INSTRUCTION;
        case 'builder':
        default:
            const serviceList = Object.values(pricingData.allServices).flatMap(cat => cat.items).map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
            const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
            return BUILDER_INSTRUCTION_TEMPLATE(serviceList, planList, contextText);
    }
}

// --- INTELLIGENCE HELPERS ---

function extractJson(text) {
    const match = text.match(/```(json)?\s*([\s\S]*?)\s*```/);
    if (match && match[2]) {
        return match[2].trim();
    }
    const trimmedText = text.trim();
    if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
        return trimmedText;
    }
    return null;
}

function createErrorJsonResponse(introduction, closing) {
    return JSON.stringify({
        introduction,
        services: [],
        closing,
        client_questions: [],
        sales_pitch: ""
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
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: "Invalid JSON-formatted request body." };
    }

    const { userMessage, history: historyFromClient, mode, selectedServicesContext, apiKey } = body;
    if (!userMessage || !historyFromClient || !mode || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request. Missing required parameters (userMessage, history, mode, apiKey)." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-pro", 
            systemInstruction: getSystemInstructionForMode(mode, selectedServicesContext),
        });
        
        const chat = model.startChat({
             history: historyFromClient.slice(0, -1),
        });

        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        let responseText = response.text();
        
        if (mode === 'builder') {
            const extractedJson = extractJson(responseText);
            if (extractedJson) {
                try {
                    JSON.parse(extractedJson);
                    responseText = extractedJson; 
                } catch (e) {
                    responseText = createErrorJsonResponse(
                        "Lo siento, tuve un problema al generar la recomendación. El formato era incorrecto.",
                        "Por favor, intenta reformular tu solicitud de una manera más clara."
                    );
                }
            } else {
                responseText = createErrorJsonResponse(
                    "El asistente no pudo identificar los servicios para tu solicitud.",
                    `Aquí está la respuesta que recibí: "${responseText}". Intenta ser más específico sobre las necesidades de tu cliente.`
                );
            }
        }

        const updatedHistory = [...historyFromClient, { role: 'model', parts: [{ text: responseText }] }];

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: updatedHistory })
        };

    } catch (err) {
        console.error("Error in Netlify function handler:", err);
        const errorMessage = `Lo siento, un error ocurrió al comunicarme con el asistente: ${err.message}. Si el error persiste, verifica que tu API Key sea correcta y tenga fondos.`;
        
        if (mode === 'builder') {
            const errorJson = createErrorJsonResponse(
                "Hubo un error de conexión con la IA.",
                `Detalles del error: ${err.message}. Asegúrate de que tu API Key sea válida.`
            );
            const errorHistory = [...historyFromClient, { role: 'model', parts: [{ text: errorJson }] }];
            return {
                statusCode: 200,
                body: JSON.stringify({ response: errorJson, history: errorHistory })
            };
        }
        
        const errorHistory = [...historyFromClient, { role: 'model', parts: [{ text: errorMessage }] }];
        return {
            statusCode: 200, 
            body: JSON.stringify({ response: errorMessage, history: errorHistory })
        };
    }
};
