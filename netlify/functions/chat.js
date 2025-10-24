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
 * 4. El historial se devuelve al frontend (almacenando el user_message + model_response)
 */

// Importa el catálogo de precios (asumiendo que existe un pricing.json en el mismo directorio)
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
 * * @param {string} systemPrompt - Instrucciones de comportamiento para el modelo.
 * @param {Array<Object>} history - Historial de chat completo para mantener el contexto (incluye el último mensaje de usuario).
 * @param {string} userPrompt - Mensaje del usuario (usado solo para referencia en systemPrompt/debugging).
 * @param {string} geminiMode - Define el formato de respuesta: "TEXT" o "JSON".
 * @returns {Promise<string>} La respuesta de texto (o JSON stringificado) de Gemini.
 */
async function sendMessageToGemini(systemPrompt, history, userPrompt, geminiMode = "TEXT") {
  
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
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
          'Accept': 'application/json', 
        },
        body: JSON.stringify(payload)
      });


      if (!response.ok) {
        // Si la respuesta HTTP no es 2xx, lanzamos un error con el cuerpo de la respuesta.
        const errorDetails = await response.text();
        throw new Error(`HTTP error! status: ${response.status}. Details: ${errorDetails.substring(0, 100)}...`);
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
        // Se devuelve un JSON de error que el frontend puede manejar.
        return JSON.stringify({ error: true, message: `Error al contactar con el asistente IA (máximo de reintentos): ${error.message}` });
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
  const { userMessage, history: historyForApi } = body;
  const invocationId = Date.now(); 


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


    let classificationSystemPrompt = `
        Eres un clasificador de peticiones.
        Analiza el siguiente mensaje del revendedor.
        Tu única respuesta debe ser una de estas tres palabras:
        - 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicio o un plan para un proyecto.
        - 'TEXTO' para cualquier otra cosa (saludos, preguntas técnicas, dudas de precios, etc.).
        - 'DESCONOCIDA' si no puedes clasificar la intención con certeza.
        Responde solo con la palabra en mayúsculas, sin explicaciones.
    `;
    
    
    const intentResponse = await sendMessageToGemini(classificationSystemPrompt, historyForApi, lastUserMessage, "TEXT");
    
    
    intent = intentResponse.toUpperCase().trim().replace(/['"]+/g, '');


    // --- PASO 2: Ejecución Basada en la Intención ---
    
    let responseText;


    if (intent === 'RECOMENDACION') {
        
        console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicios.`);
        geminiMode = "JSON"; 
        
        // Extraemos los items de todas las categorías de 'allServices' en un solo array
        const serviceList = Object.values(pricingData.allServices)
            .flatMap(category => category.items) 
            .map(s => `ID: ${s.id} | Nombre: ${s.name} | Descripción: ${s.description}`).join('\n');
            
        const planList = pricingData.monthlyPlans
            .map(p => `ID: ${p.id} | Nombre: ${p.name} | Descripción: ${p.description}`).join('\n');
        
        const allServicesString = `--- CATÁLOGO COMPLETO DE SERVICIOS ---\nSERVICIOS ESTÁNDAR:\n${serviceList}\nPLANES MENSUALES:\n${planList}`;


        systemPrompt = `
            Eres Zen Assistant, un experto en presupuestos de desarrollo web.
            Tu tarea es recomendar al revendedor la lista de IDs de servicios más adecuada 
            para su proyecto, BASÁNDOSE SÓLO en el catálogo proporcionado.
            
            ${allServicesString}

            INSTRUCCIONES CLAVE:
            1. Genera una respuesta ESTRICTAMENTE en el formato JSON.
            2. SÓLO incluye IDs de servicios que existan en el CATÁLOGO (ej: s1, p3, m1).
            3. La 'introduction' debe ser profesional y persuasiva.
        `;
        
    } else if (intent === 'TEXTO' || intent === 'DESCONOCIDA') {
        
        console.log(`[${invocationId}] INTENCIÓN: Texto general/Ventas (${intent}).`);
        geminiMode = "TEXT";
        
        systemPrompt = `
            Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo de software.
            
            INSTRUCCIONES CLAVE:
            - Responde de forma cortés, profesional y concisa.
            - Responde directamente a la consulta del revendedor.
        `;
        
    } else {
        
        console.log(`[${invocationId}] INTENCIÓN: Inesperada (${intent}). Fallback a Texto simple.`);
        geminiMode = "TEXT";

        systemPrompt = `
            Eres Zen Assistant. Responde al revendedor de forma cortés, indicando que hubo un pequeño problema con tu clasificación de su solicitud, pero que le ayudarás de todas formas.
        `;
    }

    // Llamada final al modelo con el prompt y modo definidos.
    responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt, geminiMode);


    // --- PASO 3: Verificación de Errores de API ---
    try {
        const errorCheck = JSON.parse(responseText);
        if (errorCheck.error) {
             // Si el JSON contiene 'error: true' (devuelto por sendMessageToGemini), retornamos el error 500.
             return { statusCode: 500, body: responseText };
        }
    } catch (e) {
        // Si no se puede parsear a JSON, asumimos que es un texto de respuesta válido.
    }


    // --- PASO 4: Actualización del Historial y Respuesta Final ---

    // Creamos el historial actualizado para devolver al frontend, incluyendo la respuesta del modelo.
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