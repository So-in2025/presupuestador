// /netlify/functions/chat.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json'); // Carga el catálogo una sola vez al iniciar la función.

// --- ESTRATEGIA 2: AGENTE CON HERRAMIENTAS ---

// Esta es la "herramienta" real que nuestro código ejecuta.
// Es una función de búsqueda simple que la IA puede invocar.
const tools = {
    find_relevant_services(args) {
        const { project_description } = args;
        if (!project_description) return { error: "Se necesita una descripción del proyecto." };

        console.log(`Ejecutando herramienta 'find_relevant_services' con la descripción: "${project_description}"`);
        const keywords = project_description.toLowerCase().match(/\b(\w+)\b/g) || [];
        let scores = {};

        // Itera sobre todos los servicios y les da una puntuación de relevancia
        Object.values(pricingData.allServices).forEach(category => {
            category.items.forEach(item => {
                const content = `${item.name.toLowerCase()} ${item.description.toLowerCase()}`;
                let score = 0;
                keywords.forEach(keyword => {
                    if (content.includes(keyword)) {
                        score++;
                    }
                });
                if (score > 0) {
                    scores[item.id] = { score, name: item.name };
                }
            });
        });
        
        // Ordena por puntuación y devuelve los IDs más relevantes
        const relevant_ids = Object.entries(scores)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 4) // Devuelve hasta 4 IDs para no abrumar
            .map(entry => entry[0]);
            
        console.log("IDs más relevantes encontrados:", relevant_ids);
        return { relevant_ids };
    }
};

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { history } = JSON.parse(event.body);
        if (!history || !Array.isArray(history) || history.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido." }) };
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Se le enseña a la IA el formato de las herramientas que puede usar.
        const model = genAI.getGenerativeModel({
            model: "gemini-pro",
            tools: [{
                functionDeclarations: [{
                    name: "find_relevant_services",
                    description: "Busca en el catálogo de servicios para encontrar los paquetes o ítems más relevantes según la descripción de un proyecto web.",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            project_description: {
                                type: "STRING",
                                description: "Una descripción detallada de las necesidades del cliente, sus objetivos, y cualquier restricción como el presupuesto."
                            }
                        },
                        required: ["project_description"]
                    }
                }]
            }]
        });

        // El prompt ahora es sobre su ROL, no sobre su conocimiento. Le dice CÓMO comportarse.
        const systemPrompt = `
            Eres 'Zen Assistant', un estratega de ventas web de élite. Tu misión es ayudar a un revendedor a construir la propuesta perfecta.
            - Primero, usa la herramienta 'find_relevant_services' para identificar los IDs de los servicios más adecuados del catálogo.
            - Luego, basándote en los resultados de la herramienta, formula una recomendación profesional.
            - Responde SIEMPRE con el siguiente formato estricto:

            Servicios: [IDs de los servicios que encontraste con la herramienta]
            Respuesta: [Texto de venta conciso para el revendedor, justificando tu elección. Guíale sobre cómo usar la herramienta.]
        `;

        const geminiHistory = history.map(turn => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] }));
        const userMessage = geminiHistory.pop().parts[0].text;
        
        const chat = model.startChat({ history: geminiHistory, systemInstruction: systemPrompt });
        let result = await chat.sendMessage(userMessage);
        let response = result.response;

        // --- LÓGICA DE ORQUESTACIÓN (El corazón del Agente) ---
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            console.log("La IA ha decidido llamar a una herramienta:", functionCalls[0].name);
            const call = functionCalls[0];
            // Ejecuta la herramienta que la IA solicitó
            const toolResult = tools[call.name](call.args);

            // Envía el resultado de la herramienta de vuelta a la IA para que formule la respuesta final
            result = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
            response = result.response;
        }

        const responseText = response.text();
        return { statusCode: 200, body: JSON.stringify({ response: responseText }) };

    } catch (error) {
        console.error("Error en la función de Netlify:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Error en la IA: ${error.message}` }) };
    }
};