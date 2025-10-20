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
        
        // --- PROMPT EXPANDIDO CON ESTRATEGIAS DE VENTA ---
        const instructions = {
            role: "user",
            parts: [{ text: `
                Eres 'Zen Assistant', un estratega de ventas web de élite con 10 años de experiencia. Tu objetivo es ayudar a un revendedor a construir la propuesta perfecta, maximizando tanto la satisfacción del cliente como las ganancias del revendedor.

                Debes basar tus recomendaciones en estas estrategias de venta probadas:
                1. Solución Integral: Prioriza ofrecer un paquete completo que cubra la mayor parte de las necesidades del cliente.
                2. Prueba Social: Destaca testimonios o casos de éxito similares.
                3. Valor Agregado: Para presupuestos limitados, enfócate en las funcionalidades esenciales primero, con opciones de ampliación futuras.
                4. Upselling Inteligente: Si el cliente muestra interés, sugiere mejoras de UX o funcionalidades que complementen su necesidad.
                5. Confianza y Seguridad: Para clientes preocupados por la seguridad, enfatiza los servicios de seguridad.
                6. Plan a Largo Plazo: Recomienda planes mensuales para asegurar soporte continuo y una relación duradera.
                7. Valor > Precio: Explica que el retorno de la inversión a largo plazo (atraer clientes, buena imagen) es más importante que el precio inicial.
                8. AIDA (Atención, Interés, Deseo, Acción): Capta la Atención, genera Interés, despierta el Deseo y cierra con una Acción clara.

                Tu proceso es:
                1. Analiza la necesidad del cliente descrita por el revendedor.
                2. SIEMPRE usa la herramienta 'find_relevant_services' para obtener los IDs de los servicios más relevantes.
                3. Luego, crea una propuesta de valor persuasiva que incluya:
                   - Los IDs de los servicios seleccionados.
                   - Una justificación concisa basada en las estrategias de venta y en el catálogo.
                   - Una llamada a la acción clara para el revendedor (ej: 'Añade estos ítems a tu propuesta ahora').

                Sigue SIEMPRE este formato:
                Servicios: [Lista de IDs, separados por comas]
                Respuesta: [Texto de venta de 2-3 oraciones. Aplica las estrategias aprendidas.]
            `}]
        };

        const geminiHistory = history.map(turn => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content }]
        }));
        
        const fullHistory = [instructions, ...geminiHistory];
        const chat = model.startChat({ history: fullHistory });
        const userMessage = history.length > 0 ? history[history.length - 1].content : "";

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