// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/generative-ai (versión original funcional)
 * Lógica de Intención: v7 (Compatible con SDK original, manejo de errores robusto)
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURACIÓN DE GEMINI ---
if (!process.env.API_KEY) {
  console.error("❌ API_KEY no está definida en variables de entorno.");
}
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
// Usamos un modelo estable y compatible con este SDK.
const GEMINI_MODEL = "gemini-pro";

// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY (HANDLER) ---
exports.handler = async (event) => {
    // 1. Verificaciones básicas y carga de datos
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let pricingData;
    try {
        const pricingPath = path.resolve(__dirname, '../../pricing.json');
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

    const { userMessage, history: historyFromClient, mode } = body;
    if (!userMessage || !historyFromClient) {
        return { statusCode: 400, body: "Faltan 'userMessage' o 'history'." };
    }

    try {
        const lastUserMessage = userMessage;
        // El SDK antiguo maneja el historial completo en startChat.
        // Se excluye el último mensaje de 'model' si es un mensaje de error previo o de bienvenida.
        const chatHistoryForSDK = historyFromClient.slice(0, -1);

        // 2. Determinar intención y prompt del sistema
        let intent = "TEXTO";
        let systemPrompt;
        
        if (mode === 'objection') {
            intent = "OBJECION";
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
        } else { // modo 'builder'
            const classificationModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
            const classificationPrompt = `Eres un clasificador de peticiones. Analiza el mensaje del revendedor. Tu única respuesta debe ser 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicios para un proyecto, o 'TEXTO' para cualquier otra cosa. Responde solo con la palabra en mayúsculas.`;
            const result = await classificationModel.generateContent(classificationPrompt + "\n\nMensaje: " + lastUserMessage);
            const intentResponseText = result.response.text();
            intent = intentResponseText.toUpperCase().trim().replace(/['"]+/g, '');
        }

        // 3. Preparar la llamada principal según la intención
        let finalPrompt = lastUserMessage;

        if (intent === 'RECOMENDACION') {
            const serviceList = Object.values(pricingData.allServices)
                .flatMap(category => category.items)
                .map(s => `ID: ${s.id} | Nombre: ${s.name} | Descripción: ${s.description}`).join('\n');
            const planList = pricingData.monthlyPlans
                .map(p => `ID: ${p.id} | Nombre: ${p.name} | Descripción: ${p.description}`).join('\n');
            const allServicesString = `--- CATÁLOGO COMPLETO ---\nSERVICIOS ESTÁNDAR:\n${serviceList}\nPLANES MENSUALES:\n${planList}`;

            systemPrompt = `
                Eres Zen Assistant, un estratega de productos y coach de ventas de élite. Tu tarea es analizar las necesidades del cliente y construir la solución perfecta.
                ${allServicesString}
                INSTRUCCIONES CLAVE:
                1. Analiza la petición. Para cada servicio que recomiendes, crea un objeto en el array 'services'.
                2. Para servicios existentes: Usa su 'id' y 'name' reales, y pon 'is_new: false'.
                3. Si un servicio necesario no existe: ¡Créalo! Pon 'is_new: true', inventa un 'id' único (ej: 'custom-crm-integration'), un 'name' claro, una 'description' vendedora y un 'price' de producción justo.
                4. En 'client_questions', crea preguntas para descubrir más oportunidades.
                5. En 'sales_pitch', escribe un párrafo de venta enfocado en los beneficios.
                IMPORTANTE: Tu respuesta DEBE ser un objeto JSON válido con esta estructura, y NADA MÁS. No incluyas \`\`\`json.
                {
                  "introduction": "string",
                  "services": [{ "id": "string", "is_new": boolean, "name": "string", "description": "string", "price": number }],
                  "closing": "string",
                  "client_questions": ["string"],
                  "sales_pitch": "string"
                }
            `;
        } else if (intent !== 'OBJECION') { // Captura TEXTO, DESCONOCIDA, etc.
            systemPrompt = `Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo web. Responde de forma cortés, profesional y concisa a la consulta del revendedor.`;
        }
        
        // 4. Realizar la llamada principal a Gemini
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: systemPrompt });
        const chat = model.startChat({ history: chatHistoryForSDK });
        const result = await chat.sendMessage(finalPrompt);
        const responseText = result.response.text();

        // 5. Construir una respuesta e historial válidos
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