// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * SDK: @google/genai (Modern SDK)
 * Lógica de Intención: v14 - JSON Mode
 */
const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Type } = require('@google/genai');

// --- Carga de datos de precios (una sola vez) ---
let pricingData;
try {
    const pricingPath = path.resolve(__dirname, 'pricing.json');
    pricingData = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
} catch (err) {
    console.error("ERROR CRÍTICO al cargar pricing.json:", err);
}

// --- Esquema JSON para el modo constructor ---
const builderResponseSchema = {
  type: Type.OBJECT,
  properties: {
    introduction: { type: Type.STRING, description: 'Un saludo inicial y una breve introducción a la solución propuesta.' },
    services: {
      type: Type.ARRAY,
      description: 'Una lista de servicios recomendados para el cliente.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'El ID único del servicio del catálogo. Si es un servicio nuevo, inventa un ID único (ej: custom-api-xyz).' },
          is_new: { type: Type.BOOLEAN, description: 'Verdadero si el servicio no está en el catálogo, falso en caso contrario.' },
          name: { type: Type.STRING, description: 'El nombre del servicio.' },
          description: { type: Type.STRING, description: 'Una descripción vendedora del servicio, incluyendo la justificación del upsell si aplica.' },
          price: { type: Type.NUMBER, description: 'El costo de producción del servicio. Si es nuevo, estima un precio justo.' }
        },
        required: ['id', 'is_new', 'name', 'description', 'price']
      }
    },
    closing: { type: Type.STRING, description: 'Un párrafo de cierre que explique los siguientes pasos.' },
    client_questions: {
      type: Type.ARRAY,
      description: 'Preguntas estratégicas para que el revendedor le haga a su cliente para descubrir más oportunidades.',
      items: { type: Type.STRING }
    },
    sales_pitch: { type: Type.STRING, description: 'Un argumento de venta de 1-2 párrafos enfocado en los beneficios y el valor para el cliente final.' }
  },
  required: ['introduction', 'services', 'closing', 'client_questions', 'sales_pitch']
};


exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (!pricingData) {
         return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Error interno: la configuración de precios no está disponible.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: "Cuerpo JSON inválido" };
    }

    const { userMessage, history: historyFromClient, mode, selectedServicesContext, apiKey } = body;

    if (!userMessage || !historyFromClient || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Faltan parámetros requeridos (userMessage, history, apiKey)." }) };
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        // Sanitizar historial para la API
        const contents = historyFromClient.slice(0, -1); // Eliminar el último mensaje de usuario, que pasamos por separado
        if (contents.length > 0 && contents[0].role !== 'user') {
            const firstUserIndex = contents.findIndex(msg => msg.role === 'user');
            if (firstUserIndex > -1) contents.splice(0, firstUserIndex);
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        let systemInstruction;
        let config = {};

        const contextText = (selectedServicesContext && selectedServicesContext.length > 0) 
            ? `CONTEXTO: El revendedor ya ha seleccionado: ${selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Evita sugerir estos ítems de nuevo y basa tus recomendaciones en complementar esta selección.` 
            : '';

        switch(mode) {
            case 'analyze':
                systemInstruction = `Eres un analista de negocios experto. Tu única tarea es leer la conversación que te proporciona el revendedor y extraer una lista concisa y clara de 3 a 5 requisitos o necesidades clave del cliente final. Formatea tu respuesta como una lista de viñetas, usando '-' para cada punto. No saludes, no te despidas, solo devuelve la lista.`;
                break;
            case 'objection':
                systemInstruction = `Eres Zen Coach, un experto coach de ventas. Tu misión es ayudar al revendedor a superar las objeciones de sus clientes. Proporciona una respuesta estructurada, profesional y empática, enfocada en el VALOR y los BENEFICIOS, no en características técnicas. Traduce objeciones de "costo" a conversaciones sobre "inversión" y "retorno".`;
                break;
            default: // 'builder'
                const serviceList = Object.values(pricingData.allServices).flatMap(cat => cat.items).map(s => `ID: ${s.id} | Nombre: ${s.name}`).join('\n');
                const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Nombre: ${p.name}`).join('\n');
                
                systemInstruction = `Actúas como una API. Analiza la petición del usuario para un proyecto web y construye la solución perfecta usando el catálogo. Debes identificar proactivamente oportunidades de 'upsell' o 'cross-sell'. ${contextText}\n\n--- CATÁLOGO DISPONIBLE ---\n${serviceList}\n${planList}`;
                config = {
                    responseMimeType: "application/json",
                    responseSchema: builderResponseSchema
                };
                break;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                systemInstruction,
                ...config
            }
        });

        const responseText = response.text;
        const updatedHistory = [...historyFromClient, { role: 'model', parts: [{ text: responseText }] }];

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: updatedHistory })
        };

    } catch (err) {
        console.error("Error en handler de Netlify:", err);
        const errorMessage = `Lo siento, ocurrió un error: ${err.message}. Si el error persiste, verifica que tu API Key sea correcta y tenga fondos.`;
        const errorHistory = [...historyFromClient, { role: 'model', parts: [{ text: errorMessage }] }];
        return {
            statusCode: 200, // Devolvemos 200 para que el frontend pueda manejar el error de forma amigable
            body: JSON.stringify({ response: errorMessage, history: errorHistory })
        };
    }
};
