// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v3 (Clasificación Estricta y Salida JSON para Recomendaciones)
 * Compatible con Node 18+ en Netlify
 * * Este archivo ha sido revisado para asegurar:
 * 1. Correcta comunicación con la API de Gemini 2.5.
 * 2. Lógica de reintento implementada en sendMessageToGemini.
 * 3. Forzado de salida JSON para la intención de 'RECOMENDACION' con el esquema definido.
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
 * Envía un mensaje a la API de Gemini con lógica de reintento y configuración de formato.
 * Esta función maneja la comunicación directa con el modelo de IA.
 * * @param {string} systemPrompt - Instrucciones de comportamiento para el modelo.
 * @param {Array<Object>} history - Historial de chat completo para mantener el contexto.
 * @param {string} userPrompt - Mensaje del usuario (usado solo para referencia en systemPrompt/debugging).
 * @param {string} geminiMode - Define el formato de respuesta: "TEXT" o "JSON".
 * @returns {Promise<string>} La respuesta de texto (o JSON stringificado) de Gemini.
 */
async function sendMessageToGemini(systemPrompt, history, userPrompt, geminiMode = "TEXT") {
  
  // Uso de fetch nativo de Node/Netlify para la conexión.
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  // El historial (contents) que llega del frontend YA incluye el último mensaje del usuario.
  const contents = history; 

  
  const payload = {
    contents: contents,
    config: {
      systemInstruction: { 
        parts: [{ text: systemPrompt }] 
      }
    }
  };


  if (geminiMode === "JSON") {
    
    // Configuración MANDATORIA para forzar la salida JSON con el esquema de recomendación
    payload.config.responseMimeType = "application/json";
    
    // Esquema JSON estricto para asegurar la estructura de la recomendación de servicios.
    payload.config.responseSchema = {
        type: "OBJECT",
        properties: {
            introduction: { 
              type: "STRING", 
              description: "Breve introducción profesional para el cliente, antes de listar los IDs." 
            },
            services: { 
                type: "ARRAY", 
                items: { type: "STRING" }, 
                description: "Array de IDs (ej: 's1', 'p3', 'm1') de los servicios recomendados." 
            },
            closing: { 
              type: "STRING", 
              description: "Conclusión amigable para el cliente, invitando a añadirlos." 
            }
        },
        required: ["introduction", "services", "closing"]
    };
  }


  // Lógica de reintento simple (hasta 3 intentos) y llamada fetch completa.
  for (let attempt = 0; attempt < 3; attempt++) {
    
    try {
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json', // Importante para recibir la respuesta correctamente
        },
        body: JSON.stringify(payload)
      });


      if (!response.ok) {
        // Si la respuesta HTTP no es 2xx, lanzamos un error con el cuerpo de la respuesta.
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
      }


      const result = await response.json();
      
      // Intentamos extraer el texto de la respuesta del candidato.
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        // Fallback robusto en caso de respuesta vacía o estructura inesperada.
        throw new Error("Respuesta de Gemini vacía o mal formada.");
      }
      
      return text; // Respuesta exitosa.

    } catch (error) {
      
      console.error(`Error en intento ${attempt + 1}:`, error.message);
      
      if (attempt === 2) {
        // Fallback final si todos los reintentos fallan.
        return JSON.stringify({ error: true, message: `Error al contactar con el asistente IA: ${error.message}` });
      }
      
      // Espera exponencial antes del próximo reintento.
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); 
    }
  }
}


// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY (HANDLER) ---

/**
 * Controlador principal de la función serverless de Netlify.
 * Procesa la solicitud POST del frontend.
 */
exports.handler = async (event) => {
  
  // 1. Verificación del método HTTP.
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  
  let body;
  try {
    // 2. Parseo del cuerpo de la solicitud (JSON).
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  
  // Desestructuración de los datos de entrada:
  // - userMessage: El texto del último mensaje.
  // - historyForApi: Todo el historial, incluyendo el último mensaje del usuario.
  const { userMessage, history: historyForApi } = body;
  const invocationId = Date.now(); // ID único para el log de esta invocación.


  if (!userMessage || !historyForApi) {
    return { statusCode: 400, body: "Faltan parámetros: userMessage o history." };
  }


  const lastUserMessage = userMessage;


  try {
    
    // --- PASO 1: Clasificación de Intención ---
    
    let intent = "TEXTO"; 
    let geminiMode = "TEXT";
    let systemPrompt;
    let userPrompt = lastUserMessage; 


    // Prompt de clasificación simple y estricto.
    let classificationSystemPrompt = `
        Eres un clasificador de peticiones.
        Analiza el siguiente mensaje del revendedor.
        Tu única respuesta debe ser una de estas tres palabras:
        - 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicio o un plan para un proyecto.
        - 'TEXTO' para cualquier otra cosa (saludos, preguntas técnicas, dudas de precios, etc.).
        - 'DESCONOCIDA' si no puedes clasificar la intención con certeza.
        Responde solo con la palabra en mayúsculas, sin explicaciones.
    `;
    
    
    // Ejecutamos la clasificación usando el historial completo para mayor precisión.
    const intentResponse = await sendMessageToGemini(classificationSystemPrompt, historyForApi, lastUserMessage, "TEXT");
    
    
    // Normalizamos la respuesta del clasificador.
    intent = intentResponse.toUpperCase().trim().replace(/['"]+/g, '');


    // --- PASO 2: Ejecución Basada en la Intención ---
    
    let responseText;


    if (intent === 'RECOMENDACION') {
        
        console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicios.`);
        geminiMode = "JSON"; // Forzamos la salida JSON.
        
        // Preparamos el catálogo de servicios para incluirlo en el System Prompt.
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
        // userPrompt ya está establecido como lastUserMessage
        
    } else if (intent === 'TEXTO') {
        
        console.log(`[${invocationId}] INTENCIÓN: Texto general/Ventas.`);
        geminiMode = "TEXT";
        
        systemPrompt = `
            Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo de software.
            
            INSTRUCCIONES CLAVE:
            - Responde de forma cortés, profesional y concisa.
            - Responde directamente a la consulta del revendedor.
        `;
        // userPrompt ya está establecido como lastUserMessage

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

    // Llamada final al modelo con el prompt y modo definidos.
    responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt, geminiMode);


    // --- PASO 3: Verificación de Errores de API (Si la respuesta es un JSON de error) ---
    try {
        const errorCheck = JSON.parse(responseText);
        if (errorCheck.error) {
             // Si el JSON contiene 'error: true', retornamos el error 500.
             return { statusCode: 500, body: responseText };
        }
    } catch (e) {
        // Si no se puede parsear a JSON, asumimos que es un texto de respuesta válido.
    }


    // --- PASO 4: Actualización del Historial y Respuesta Final ---

    // Creamos el historial actualizado para devolver al frontend.
    const updatedHistory = [
      ...historyForApi,
      { role: 'model', parts: [{ text: responseText }] }
    ];


    console.log(`[${invocationId}] OK. Intención: ${intent}. Devolviendo respuesta.`);
    
    // Retornamos la respuesta cruda de Gemini (JSON o Texto) junto con el historial actualizado.
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        response: responseText, 
        history: updatedHistory 
      }) 
    };
    
  } catch (err) {
    
    // Manejo de errores fatales en la lógica principal.
    console.error(`[${invocationId}] FATAL:`, err.message);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: true, 
        message: `Error interno del servidor en la función Netlify: ${err.message}` 
      }),
    };
  }
};
