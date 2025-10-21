// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v3 (Clasificación Estricta y Salida JSON para Recomendaciones)
 * Compatible con Node 18+ en Netlify
 * * CORRECCIONES VITALES APLICADAS:
 * 1. Implementación completa y robusta de la llamada 'fetch' a la API de Gemini.
 * 2. Forzado de salida JSON mediante 'responseSchema' para intenciones de RECOMENDACION.
 * 3. Se respeta la lógica de clasificación de 3 ramas (RECOMENDACION, TEXTO, DESCONOCIDA).
 */

const pricingData = require("./pricing.json");

// --- CONFIGURACIÓN DE GEMINI ---
// Asegúrate de definir GEMINI_API_KEY en las variables de entorno de Netlify.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY no está definida en variables de entorno.");
}

// --- FUNCIÓN DE AYUDA PARA LA API DE GEMINI ---
/**
 * Envía un mensaje a la API de Gemini con lógica de reintento.
 * @param {string} systemPrompt - Instrucciones para el modelo.
 * @param {Array<Object>} history - Historial de chat para contexto.
 * @param {string} userPrompt - Mensaje del usuario (se añade al historial antes de llamar si no está ya).
 * @param {string} geminiMode - "TEXT" o "JSON" para forzar formato estructurado.
 * @returns {Promise<string>} La respuesta de texto (o JSON stringificado) de Gemini.
 */
async function sendMessageToGemini(systemPrompt, history, userPrompt, geminiMode = "TEXT") {
  // Uso de fetch nativo de Node/Netlify
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  // El historial que llega del frontend (history) YA incluye el último mensaje del usuario.
  // Usamos 'history' directamente como 'contents' para la API.
  const contents = history; 

  const payload = {
    contents: contents,
    config: {
      systemInstruction: { parts: [{ text: systemPrompt }] }
    }
  };

  if (geminiMode === "JSON") {
    // Configuración para forzar la salida JSON con el esquema de recomendación
    payload.config.responseMimeType = "application/json";
    payload.config.responseSchema = {
        type: "OBJECT",
        properties: {
            introduction: { type: "STRING", description: "Breve introducción profesional para el cliente." },
            services: { 
                type: "ARRAY", 
                items: { type: "STRING" }, 
                description: "Array de IDs (ej: 's1', 'p3', 'm1') de los servicios recomendados." 
            },
            closing: { type: "STRING", description: "Conclusión amigable para el cliente, invitando a añadirlos." }
        },
        required: ["introduction", "services", "closing"]
    };
  }

  // Lógica de reintento simple
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
      }

      const result = await response.json();
      
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        // Esto puede ocurrir si Gemini no genera contenido (ej. bloqueo de safety, o problema interno)
        throw new Error("Respuesta de Gemini vacía o mal formada. Revisar filtros o modelo.");
      }
      return text;

    } catch (error) {
      console.error(`Error en intento ${attempt + 1}:`, error.message);
      if (attempt === 2) {
        // Fallback final si todos los reintentos fallan
        return JSON.stringify({ error: true, message: `Error al contactar con el asistente IA: ${error.message}` });
      }
      // Espera exponencial
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); 
    }
  }
}

// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY ---
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  // userMessage es el texto del último mensaje
  // historyForApi contiene todo el historial, INCLUYENDO el último mensaje del usuario
  const { userMessage, history: historyForApi } = body;
  const invocationId = Date.now();

  if (!userMessage || !historyForApi) {
    return { statusCode: 400, body: "Faltan parámetros: userMessage o history." };
  }

  const lastUserMessage = userMessage;

  try {
    // 1. Clasificación de Intención (usando todo el historial para contexto)
    let intent = "TEXTO"; 
    let geminiMode = "TEXT";
    let systemPrompt;
    let userPrompt = lastUserMessage; 

    // El sistema de clasificación usa la función principal con el historial completo
    let classificationSystemPrompt = `
        Eres un clasificador de peticiones.
        Analiza el siguiente mensaje del revendedor.
        Tu única respuesta debe ser una de estas tres palabras:
        - 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicio o un plan para un proyecto.
        - 'TEXTO' para cualquier otra cosa (saludos, preguntas técnicas, dudas de precios, etc.).
        - 'DESCONOCIDA' si no puedes clasificar la intención con certeza.
        Responde solo con la palabra en mayúsculas, sin explicaciones.
    `;
    
    // El historial completo se usa para la clasificación
    const intentResponse = await sendMessageToGemini(classificationSystemPrompt, historyForApi, lastUserMessage, "TEXT");
    
    // Normalizamos la respuesta
    intent = intentResponse.toUpperCase().trim().replace(/['"]+/g, '');

    // 2. Ejecución basada en la Intención
    let responseText;

    if (intent === 'RECOMENDACION') {
        console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicios.`);
        geminiMode = "JSON";
        
        // Listado de servicios disponibles para el modelo
        const serviceList = pricingData.allServices
            .map(s => `ID: ${s.id} | Nombre: ${s.name} | Descripción: ${s.description}`).join('\n');
        const planList = pricingData.monthlyPlans
            .map(p => `ID: ${p.id} | Nombre: ${p.name} | Descripción: ${p.description}`).join('\n');
        
        const allServicesString = `--- CATÁLOGO COMPLETO DE SERVICIOS ---\nSERVICIOS ESTÁNDAR:\n${serviceList}\nPLANES MENSUALES:\n${planList}`;

        systemPrompt = `
            Eres Zen Assistant, un experto en presupuestos de desarrollo web.
            Tu tarea es recomendar al revendedor la lista de IDs de servicios más adecuada 
            para su proyecto, BASÁNDOTE SÓLO en el catálogo proporcionado.
            
            ${allServicesString}

            INSTRUCCIONES CLAVE:
            1. Genera una respuesta ESTRICTAMENTE en el formato JSON.
            2. SÓLO incluye IDs de servicios que existan en el CATÁLOGO (ej: s1, p3, m1).
            3. La 'introduction' debe ser profesional y persuasiva.
        `;
        // userPrompt es el lastUserMessage
        
    } else if (intent === 'TEXTO') {
        console.log(`[${invocationId}] INTENCIÓN: Texto general/Ventas.`);
        geminiMode = "TEXT";
        
        systemPrompt = `
            Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo de software.
            INSTRUCCIONES CLAVE:
            - Responde de forma cortés, profesional y concisa.
            - Responde directamente a la consulta del revendedor.
        `;
        // userPrompt es el lastUserMessage

    } else {
        // Lógica de fallback para intención 'DESCONOCIDA'
        console.log(`[${invocationId}] INTENCIÓN: Desconocida (${intent}). Fallback a Asistente de Ventas.`);
        geminiMode = "TEXT";

        systemPrompt = `
            Eres Zen Assistant. No se pudo clasificar la solicitud como una recomendación de servicios.
            Actúa como un asistente de ventas general.
            
            INSTRUCCIONES CLAVE:
            - Responde de forma cortés, indicando que necesitas más detalles sobre el proyecto o que ayudarás con su consulta de ventas.
        `;

        userPrompt = `El revendedor preguntó: "${userMessage}". Parece que quiere ayuda de ventas, pero no estoy seguro. Ofrécete a ayudarle con un consejo de ventas o pídele más detalles sobre el proyecto.`;
    }

    responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt, geminiMode);

    // 3. Verificación de errores de API (si la respuesta es JSON de error)
    try {
        const errorCheck = JSON.parse(responseText);
        if (errorCheck.error) {
             return { statusCode: 500, body: responseText };
        }
    } catch (e) {
        // No es JSON de error, continuamos.
    }

    // 4. Actualizamos el historial con la respuesta del modelo
    const updatedHistory = [
      ...historyForApi,
      { role: 'model', parts: [{ text: responseText }] }
    ];

    console.log(`[${invocationId}] OK. Intención: ${intent}`);
    // data.response es la respuesta cruda de Gemini (JSON o Texto)
    return { statusCode: 200, body: JSON.stringify({ response: responseText, history: updatedHistory }) };
    
  } catch (err) {
    console.error(`[${invocationId}] FATAL:`, err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: true, message: `Error interno del servidor en la función Netlify: ${err.message}` }),
    };
  }
};