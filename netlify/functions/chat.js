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
        console.log("1. Inicio de la función chat.js"); // [A]
        const { history } = JSON.parse(event.body);
        console.log("2. Body parseado:", history); // [B]

        if (!history || !Array.isArray(history)) {
            console.log("3. Error: Historial inválido."); // [C]
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido." }) };
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // --- MODELO CORRECTO (asegúrate de que este exista en tu cuenta) ---
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-pro", // <-- ¡Este debe ser correcto!
            tools: [{ functionDeclarations: [tools.find_relevant_services] }]
        });
        console.log("4. Modelo de IA inicializado."); // [D]
        
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
        console.log("5. Historial formateado:", fullHistory); // [E]
        const chat = model.startChat({ history: fullHistory });
        const userMessage = history.length > 0 ? history[history.length - 1].content : "";

        if (userMessage === "") {
             console.log("6. Error: No se recibió un mensaje de usuario."); // [F]
             return { statusCode: 400, body: JSON.stringify({ error: "No se recibió un mensaje de usuario para procesar." }) };
        }
        console.log("7. Mensaje del usuario:", userMessage); // [G]

        let result = await chat.sendMessage(userMessage);
        console.log("8. Respuesta de la IA (inicial):", result); // [H]
        let response = result.response;

        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            console.log("9. La IA solicita llamar a la herramienta:", functionCalls[0].name); // [I]
            const call = functionCalls[0];
            const toolResult = tools[call.name](call.args);
            console.log("10. Resultado de la herramienta:", toolResult); // [J]
            result = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
            response = result.response;
            console.log("11. Respuesta de la IA (después de la herramienta):", response); // [K]
        }
        
        if (!response || !response.text) {
             console.log("12. Error: La respuesta de la IA fue inválida o nula."); // [L]
             throw new Error("La respuesta de la IA fue inválida o nula.");
        }
        const responseText = response.text();
        console.log("13. Respuesta final:", responseText); // [M]

        return { statusCode: 200, body: JSON.stringify({ response: responseText }) }; // [N]

    } catch (error) {
        console.error("Error en la función de Netlify:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Error en la IA: ${error.message}` }) };
    }
};