// /netlify/functions/chat.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json');

const tools = {
    find_relevant_services: function(args) {
        const { project_description } = args;
        if (!project_description) return { error: "Se necesita una descripción del proyecto." };
        console.log(`Ejecutando herramienta con descripción: "${project_description}"`);
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
        console.log("IDs relevantes encontrados:", relevant_ids);
        if (relevant_ids.length === 0) return { relevant_ids: [], status: "NO_MATCHING_SERVICES" };
        return { relevant_ids, status: "SUCCESS" };
    }
};

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history } = JSON.parse(event.body);
        if (!history || !Array.isArray(history)) {
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido." }) };
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-pro",
            tools: [{ functionDeclarations: [tools.find_relevant_services] }]
        });
        
        const instructions = {
            role: "user",
            parts: [{ text: `
                Eres 'Zen Assistant', un estratega de ventas web de élite.
                - Tu PRIMER paso es SIEMPRE usar la herramienta 'find_relevant_services' para analizar la necesidad.
                - CASO 1: Si la herramienta devuelve IDs, analiza esos IDs y formula una recomendación profesional usando el formato estricto.
                - CASO 2: Si la herramienta NO devuelve IDs, significa que no entendiste la petición. IGNORA el formato estricto y responde de forma conversacional pidiendo más detalles (Ej: "No entendí bien. ¿Podrías darme más detalles sobre el proyecto?").
                - Formato Estricto (SÓLO para CASO 1):

                Servicios: [IDs encontrados]
                Respuesta: [Texto de venta conciso y justificado para el revendedor.]
            `}]
        };

        const geminiHistory = history.map(turn => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content }]
        }));
        
        const fullHistory = [instructions, ...geminiHistory];
        const chat = model.startChat({ history: fullHistory });

        // --- CORRECCIÓN CLAVE: Extraer la descripción original del usuario ---
        // En lugar de usar history[history.length - 1].content,
        // buscamos el primer mensaje del usuario en el historial, que es la descripción original.
        let userMessage = "";
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') {
                userMessage = history[i].content;
                break;
            }
        }

        if (userMessage === "") {
             return { statusCode: 400, body: JSON.stringify({ error: "No se recibió un mensaje de usuario para procesar." }) };
        }

        let result = await chat.sendMessage(userMessage);
        let response = result.response;

        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            const toolResult = tools[call.name](call.args);
            result = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
            response = result.response;
        }
        
        if (!response || !response.text) {
             throw new Error("La respuesta de la IA fue inválida o nula.");
        }
        const responseText = response.text();

        return { statusCode: 200, body: JSON.stringify({ response: responseText }) };

    } catch (error) {
        console.error("Error en la función de Netlify:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Error en la IA: ${error.message}` }) };
    }
};