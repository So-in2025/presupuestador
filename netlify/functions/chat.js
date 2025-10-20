// /netlify/functions/chat.js
/**
 * @file Netlify serverless function for the Zen Assistant chatbot.
 * @description This function acts as a secure backend that orchestrates communication
 * with the Google Generative AI API. It uses an "Agent with Tools" architecture.
 * 1. Receives chat history from the frontend.
 * 2. Instructs the AI model on its role, capabilities, and response format.
 * 3. The AI decides if it needs to use a tool to find relevant services.
 * 4. If so, this backend executes the tool (a local search function) and sends the results back to the AI.
 * 5. The AI formulates a final, data-driven response.
 * 6. The final response is sent back to the frontend.
 * @author Gemini Assistant (Refactored for Production)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json');

// --- HERRAMIENTA DE BÚSQUEDA INTERNA ---
// Esta es la única "habilidad" que le damos al agente. Es una función pura y predecible.
const tools = {
    find_relevant_services: function(args) {
        const { project_description } = args;
        // Validación de entrada para la herramienta
        if (!project_description) return { error: "Se necesita una descripción del proyecto." };

        console.log(`[TOOL_EXEC] Ejecutando 'find_relevant_services' con: "${project_description}"`);
        const keywords = project_description.toLowerCase().match(/\b(\w{3,})\b/g) || [];
        if (keywords.length === 0) return { relevant_ids: [], status: "NO_KEYWORDS_FOUND" };
        
        let scores = {};
        Object.values(pricingData.allServices).forEach(category => {
            category.items.forEach(item => {
                const content = `${item.name.toLowerCase()} ${item.description.toLowerCase()}`;
                let score = 0;
                keywords.forEach(keyword => { if (content.includes(keyword)) score++; });
                if (score > 0) scores[item.id] = { score };
            });
        });

        const relevant_ids = Object.entries(scores).sort((a, b) => b[1].score - a[1].score).slice(0, 4).map(entry => entry[0]);
        console.log(`[TOOL_RESULT] IDs relevantes encontrados: [${relevant_ids.join(', ')}]`);
        
        if (relevant_ids.length === 0) return { relevant_ids: [], status: "NO_MATCHING_SERVICES" };
        return { relevant_ids, status: "SUCCESS" };
    }
};

// --- HANDLER PRINCIPAL DE LA FUNCIÓN ---
exports.handler = async function(event) {
    // Genera un ID único para esta invocación específica para facilitar el seguimiento en los logs.
    const invocationId = new Date().toISOString() + "_" + Math.random().toString(36).substr(2, 9);

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    console.log(`[${invocationId}] FN_START: Invocación de función iniciada.`);

    try {
        const { history } = JSON.parse(event.body);
        if (!history || !Array.isArray(history)) {
            console.error(`[${invocationId}] FN_ERROR: El historial es inválido.`);
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido." }) };
        }
        console.log(`[${invocationId}] FN_INFO: Historial recibido con ${history.length} turnos.`);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest", // Usamos el modelo más reciente y capaz para herramientas.
            tools: [{ functionDeclarations: [tools.find_relevant_services] }]
        });
        
        // Las instrucciones se inyectan como el primer mensaje del historial para máxima compatibilidad.
        const instructions = {
            role: "user",
            parts: [{ text: `
                Eres 'Zen Assistant', un estratega de ventas web de élite. Tu misión es ayudar a un revendedor.
                - Tu PRIMER paso es SIEMPRE usar la herramienta 'find_relevant_services' para analizar la necesidad del cliente.
                - CASO 1: Si la herramienta devuelve IDs, analiza esos IDs y formula una recomendación profesional usando el formato estricto.
                - CASO 2: Si la herramienta NO devuelve IDs, significa que no entendiste la petición. IGNORA el formato estricto y responde de forma conversacional pidiendo más detalles (Ej: "No entendí bien. ¿Podrías darme más detalles sobre el proyecto?").
                - Formato Estricto (SÓLO para CASO 1):

                Servicios: [IDs encontrados]
                Respuesta: [Texto de venta conciso y justificado para el revendedor.]
            `}]
        };

        // El historial llega con el formato correcto desde el frontend, no necesita "traducción".
        const fullHistory = [instructions, ...history];
        const chat = model.startChat({ history: fullHistory });
        
        const userMessage = history.length > 0 ? history[history.length - 1].parts[0].text : "";
        if (userMessage === "") {
             return { statusCode: 400, body: JSON.stringify({ error: "No se recibió un mensaje de usuario para procesar." }) };
        }
        
        console.log(`[${invocationId}] API_CALL_1: Enviando primer mensaje a Gemini.`);
        let result = await chat.sendMessage(userMessage);
        let response = result.response;
        console.log(`[${invocationId}] API_RESPONSE_1: Respuesta inicial recibida.`);

        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            console.log(`[${invocationId}] FN_INFO: IA solicita llamar a la herramienta '${call.name}'.`);
            const toolResult = tools[call.name](call.args);
            
            console.log(`[${invocationId}] API_CALL_2: Enviando resultado de la herramienta a Gemini.`);
            result = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
            response = result.response;
            console.log(`[${invocationId}] API_RESPONSE_2: Respuesta final recibida post-herramienta.`);
        }
        
        if (!response || typeof response.text !== 'function') {
             console.error(`[${invocationId}] FN_FATAL: La respuesta de la IA fue inválida o no contenía el método text().`, response);
             throw new Error("La respuesta de la IA fue inválida o nula.");
        }
        
        const responseText = response.text();
        console.log(`[${invocationId}] FN_SUCCESS: Enviando respuesta final al frontend.`);

        return { statusCode: 200, body: JSON.stringify({ response: responseText }) };

    } catch (error) {
        console.error(`[${invocationId}] FN_FATAL_ERROR: Error no controlado en el handler.`, error);
        return { statusCode: 500, body: JSON.stringify({ error: `Error interno del asistente: ${error.message}` }) };
    }
};