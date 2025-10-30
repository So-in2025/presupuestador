// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/genai (Modernizado a v14)
 * Lógica de Intención: v13
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/generative-ai');

// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY (HANDLER) ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let pricingData;
    try {
        const pricingPath = path.resolve(__dirname, 'pricing.json');
        pricingData = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
    } catch (err) {
        console.error("ERROR CRÍTICO al cargar pricing.json:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: 'Error interno: no se pudo cargar la configuración de precios.' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: "Cuerpo JSON inválido" };
    }

    const { userMessage, history: historyFromClient, mode, selectedServicesContext, apiKey } = body;
    if (!userMessage || !historyFromClient) {
        return { statusCode: 400, body: "Faltan 'userMessage' o 'history'." };
    }
    if (!apiKey) {
        return { statusCode: 401, body: JSON.stringify({ error: true, message: 'No se proporcionó una API Key.' }) };
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const GEMINI_MODEL = "gemini-2.5-flash";

        const lastUserMessage = userMessage;
        
        let sanitizedHistory = historyFromClient.slice(0, -1);
        const firstUserIndex = sanitizedHistory.findIndex(msg => msg.role === 'user');

        if (firstUserIndex > -1) {
            sanitizedHistory = sanitizedHistory.slice(firstUserIndex);
        } else {
            sanitizedHistory = [];
        }
        const chatHistoryForSDK = sanitizedHistory;

        let contextText = "";
        if (selectedServicesContext && selectedServicesContext.length > 0) {
            const serviceNames = selectedServicesContext.map(s => `"${s.name}"`).join(', ');
            contextText = `CONTEXTO IMPORTANTE: El revendedor ya ha seleccionado los siguientes servicios para la propuesta actual: ${serviceNames}. Tus recomendaciones deben complementar, mejorar o expandir esta selección, evitando sugerir los mismos ítems de nuevo. Basa todas tus respuestas en este contexto.`;
        }

        let intent = mode;
        let systemPrompt;

        if (intent === 'analyze') {
             systemPrompt = `
                Eres un analista de negocios experto. Tu única tarea es leer la conversación que te proporciona el revendedor y extraer una lista concisa y clara de 3 a 5 requisitos o necesidades clave del cliente final.
                INSTRUCCIONES CLAVE:
                1. Formatea tu respuesta como una lista de viñetas, usando '-' para cada punto.
                2. No saludes, no te despides, no sugieras servicios.
                3. Solo devuelve la lista de requisitos extraídos.
            `;
        } else if (intent === 'objection') {
            systemPrompt = `
                Eres Zen Coach, un experto coach de ventas para revendedores de desarrollo web. Tu única misión es ayudar al revendedor a superar las objeciones de sus clientes.
                INSTRUCCIONES CLAVE:
                1. Analiza la objeción del cliente que el revendedor te ha pasado.
                2. Proporciona una respuesta estructurada, profesional y empática.
                3. Divide tu respuesta en 2 o 3 puntos clave (párrafos cortos).
                4. Enfócate en el VALOR y los BENEFICIOS, no en las características técnicas.
                5. Traduce la objeción de "costo" a una conversación sobre "inversión" y "retorno".
                6. Tu tono debe ser de apoyo y confianza, dándole al revendedor las herramientas para sonar como un experto.
                7. NO generes JSON. Responde en texto plano y amigable.
            `;
        } else { // modo 'builder' por defecto
            
            const classificationPrompt = `
                Eres un clasificador de peticiones. Analiza el mensaje del revendedor. Tu única respuesta debe ser 'RECOMENDACION' si la pregunta pide una sugerencia de servicios para un proyecto, o 'TEXTO' para cualquier otra cosa. Responde solo con la palabra en mayúsculas.

                Aquí tienes ejemplos:
                Mensaje: "necesito una web para un restaurante"
                Respuesta: RECOMENDACION

                Mensaje: "qué me sugieres para un fotógrafo que empieza?"
                Respuesta: RECOMENDACION
                
                Mensaje: "hola, cómo estás?"
                Respuesta: TEXTO

                Mensaje: "cuál es el precio del e-commerce avanzado?"
                Respuesta: TEXTO

                Mensaje: "para un gimnasio que quiere vender membresías online"
                Respuesta: RECOMENDACION

                Mensaje: "${lastUserMessage}"
                Respuesta:`;

            const classificationResult = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: classificationPrompt,
            });
            const intentResponseText = classificationResult.text;
            let subIntent = intentResponseText.toUpperCase().trim().replace(/['".,]+/g, '');
            
            if (subIntent === 'RECOMENDACION') {
                const serviceList = Object.values(pricingData.allServices)
                    .flatMap(category => category.items)
                    .map(s => `ID: ${s.id} | Nombre: ${s.name} | Descripción: ${s.description}`).join('\n');
                const planList = pricingData.monthlyPlans
                    .map(p => `ID: ${p.id} | Nombre: ${p.name} | Descripción: ${p.description}`).join('\n');
                const allServicesString = `--- CATÁLOGO COMPLETO ---\nSERVICIOS ESTÁNDAR:\n${serviceList}\nPLANES MENSUALES:\n${planList}`;

                systemPrompt = `
                    Actúa como una API. Tu única respuesta DEBE ser un objeto JSON válido y nada más. No incluyas \`\`\`json ni ninguna otra palabra fuera del JSON.
                    Tu tarea es analizar la petición del usuario y construir la solución perfecta basándote en el catálogo y el contexto.
                    ${allServicesString}
                    ${contextText}
                    INSTRUCCIONES CLAVE:
                    1. Analiza la petición. Para cada servicio que recomiendes, crea un objeto en el array 'services'.
                    2. Para servicios existentes: Usa su 'id' y 'name' reales, y pon 'is_new: false'.
                    3. Si un servicio necesario no existe: ¡Créalo! Pon 'is_new: true', inventa un 'id' único (ej: 'custom-crm-integration'), un 'name' claro, una 'description' vendedora y un 'price' de producción justo.
                    4. En 'client_questions', DEBES crear preguntas estratégicas para descubrir más oportunidades.
                    5. En 'sales_pitch', DEBES escribir un párrafo de venta persuasivo enfocado en los beneficios.
                    6. ESTRATEGIA DE VENTA PROACTIVA: Además de cumplir con la solicitud, DEBES identificar y sugerir proactivamente al menos una oportunidad de 'upsell' o 'cross-sell'. Justifica esta sugerencia en la descripción del servicio.
                    IMPORTANTE: Tu respuesta DEBE ser un objeto JSON válido que siga esta estructura exacta:
                    {
                      "introduction": "string",
                      "services": [{ "id": "string", "is_new": boolean, "name": "string", "description": "string", "price": number }],
                      "closing": "string",
                      "client_questions": ["string"],
                      "sales_pitch": "string"
                    }
                `;
            } else { // TEXTO
                systemPrompt = `Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo web. Responde de forma cortés, profesional y concisa a la consulta del revendedor. ${contextText}`;
            }
        }
        
        const chat = ai.chats.create({
            model: GEMINI_MODEL,
            history: chatHistoryForSDK,
            config: {
                systemInstruction: systemPrompt
            }
        });
        const result = await chat.sendMessage({ message: lastUserMessage });
        const responseText = result.text;

        const updatedHistory = [
            ...historyFromClient,
            { role: 'model', parts: [{ text: responseText }] }
        ];

        return {
            statusCode: 200,
            body: JSON.stringify({
                response: responseText,
                history: updatedHistory
            })
        };

    } catch (err) {
        console.error("FATAL en handler de Netlify:", err.message, err.stack);
        if (err.message && (err.message.includes('API key not valid') || err.message.includes('API_KEY_INVALID'))) {
             const errorMessage = `La API Key proporcionada no es válida. Por favor, revísala e inténtalo de nuevo.`;
             const errorHistory = [...historyFromClient, { role: 'model', parts: [{ text: errorMessage }] }];
             return { statusCode: 200, body: JSON.stringify({ response: errorMessage, history: errorHistory }) };
        }

        const errorMessage = `Lo siento, ocurrió un error inesperado al procesar tu solicitud: ${err.message}`;
        const errorHistory = [
            ...historyFromClient,
            { role: 'model', parts: [{ text: errorMessage }] }
        ];
        return {
            statusCode: 200,
            body: JSON.stringify({
                response: errorMessage,
                history: errorHistory
            }),
        };
    }
};
