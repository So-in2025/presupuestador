// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v6 (SDK @google/genai moderno y manejo de errores robusto)
 * SDK: @google/genai
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Type } = require('@google/genai');

// --- CONFIGURACIÓN DE GEMINI ---
if (!process.env.API_KEY) {
  console.error("❌ API_KEY no está definida en variables de entorno.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";

// --- FUNCIÓN DE AYUDA PARA LA API DE GEMINI (ROBUSTA) ---
async function callGemini(systemInstruction, history, geminiMode = "TEXT") {
  const modelConfig = {
    systemInstruction: systemInstruction,
  };

  if (geminiMode === "JSON") {
    modelConfig.responseMimeType = "application/json";
    modelConfig.responseSchema = {
      type: Type.OBJECT,
      properties: {
        introduction: { type: Type.STRING },
        services: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              is_new: { type: Type.BOOLEAN },
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              price: { type: Type.NUMBER },
            },
            required: ["id", "is_new", "name"],
          },
        },
        closing: { type: Type.STRING },
        client_questions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        sales_pitch: { type: Type.STRING },
      },
      required: ["introduction", "services", "closing", "client_questions", "sales_pitch"],
    };
  }
  
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: history,
    config: modelConfig,
  });

  const text = response.text;
  if (!text) {
    throw new Error("La respuesta de la IA llegó vacía.");
  }
  return text;
}


// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY (HANDLER) ---
exports.handler = async (event) => {
    // 1. Verificaciones básicas y carga de datos
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

    const { userMessage, history: historyFromClient, mode } = body;
    if (!userMessage || !historyFromClient) {
        return { statusCode: 400, body: "Faltan 'userMessage' o 'history'." };
    }

    try {
        // 2. Determinar intención y prompt del sistema
        let intent = "TEXTO";
        let geminiMode = "TEXT";
        let systemPrompt;
        const lastUserMessage = userMessage;

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
            const classificationSystemPrompt = `
                Eres un clasificador de peticiones. Analiza el mensaje del revendedor.
                Tu única respuesta debe ser 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicios para un proyecto, o 'TEXTO' para cualquier otra cosa.
                Responde solo con la palabra en mayúsculas.
            `;
            const classificationHistory = [{ role: 'user', parts: [{ text: lastUserMessage }] }];
            const intentResponseText = await callGemini(classificationSystemPrompt, classificationHistory, "TEXT");
            intent = intentResponseText.toUpperCase().trim().replace(/['"]+/g, '');
        }

        // 3. Preparar la llamada principal según la intención
        if (intent === 'RECOMENDACION') {
            geminiMode = "JSON";
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
                2. **Para servicios existentes:** Usa su 'id' y 'name' reales, y pon 'is_new: false'.
                3. **Si un servicio necesario no existe:** ¡Créalo! Pon 'is_new: true', inventa un 'id' único (ej: 'custom-crm-integration'), un 'name' claro, una 'description' vendedora y un 'price' de producción justo.
                4. En 'client_questions', crea preguntas para descubrir más oportunidades.
                5. En 'sales_pitch', escribe un párrafo de venta enfocado en los beneficios.
            `;
        } else if (intent !== 'OBJECION') { // Captura TEXTO, DESCONOCIDA, etc.
            geminiMode = "TEXT";
            systemPrompt = `
                Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo web.
                Responde de forma cortés, profesional y concisa a la consulta del revendedor.
            `;
        }
        
        // 4. Realizar la llamada principal a Gemini
        const responseText = await callGemini(systemPrompt, historyFromClient, geminiMode);

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
        
        // Devolver un historial válido con el mensaje de error para no corromper el estado del cliente.
        const errorHistory = [
            ...historyFromClient,
            { role: 'model', parts: [{ text: errorMessage }] }
        ];
        
        return {
            statusCode: 200, // Devolver 200 para que el frontend procese el error de forma controlada.
            body: JSON.stringify({
                response: errorMessage,
                history: errorHistory
            }),
        };
    }
};
