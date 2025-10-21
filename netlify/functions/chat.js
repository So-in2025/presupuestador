// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v3 (Clasificación Estricta y Salida JSON para Recomendaciones)
 * Compatible con Node 18+ en Netlify
 */

const pricingData = require("./pricing.json");

// --- CONFIGURACIÓN DE GEMINI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY no está definida en variables de entorno.");
}

// --- FUNCIÓN DE BÚSQUEDA DE SERVICIOS ---

// Función auxiliar para formatear los servicios para el prompt
function formatServicesForPrompt(serviceIds) {
    if (!serviceIds || serviceIds.length === 0) return "Ninguno";
    return serviceIds.map(id => {
        let service = null;
        for (const category of Object.values(pricingData.allServices)) {
            service = category.items.find(item => item.id === id);
            if (service) return `${service.name} (ID: ${id})`;
        }
        const plan = pricingData.monthlyPlans.find(p => p.id == id);
        if (plan) return `${plan.name} (ID: ${id}, Plan Mensual)`;
        return `Servicio Desconocido (ID: ${id})`;
    }).join("; ");
}

/**
 * Lógica simple de búsqueda por palabras clave en nombre/descripción.
 * @param {string} project_description - La descripción del proyecto del cliente.
 * @returns {Array<string>} - Lista de IDs de los servicios más relevantes.
 */
function findRelevantServices(project_description) {
  if (!project_description) return [];

  const keywords = project_description.toLowerCase().match(/\b(\w{3,})\b/g) || [];
  if (keywords.length === 0) return [];

  const scores = {};
  
  // Buscar en servicios y paquetes
  Object.values(pricingData.allServices).forEach((cat) => {
    cat.items.forEach((item) => {
      const content = `${item.name.toLowerCase()} ${item.description.toLowerCase()}`;
      let score = 0;
      keywords.forEach((k) => {
        if (content.includes(k)) score++;
      });
      if (score > 0) scores[item.id] = score;
    });
  });

  // Buscar en planes (si es relevante, aunque el frontend los maneja por separado)
  pricingData.monthlyPlans.forEach(plan => {
      const content = `${plan.name.toLowerCase()} ${plan.description.toLowerCase()}`;
      let score = 0;
      keywords.forEach((k) => {
        if (content.includes(k)) score++;
      });
      if (score > 0) scores[plan.id] = score;
  });

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4) // Solo los 4 más relevantes
    .map(([id]) => id);
}

// --- FUNCIÓN DE CLASIFICACIÓN DE INTENCIÓN (OPTIMIZADA) ---

/**
 * Función que usa Gemini para clasificar la intención del usuario.
 */
async function detectUserIntent(userMessage, history) {
  const classificationPrompt = `
    Analiza el último mensaje del usuario y todo el historial para determinar su intención principal.
    
    INTENCIONES:
    1. RECOMMEND_SERVICE: El usuario está pidiendo sugerencias de servicios basados en el proyecto de su cliente o preguntando sobre precios.
    2. ASSIST_SALES: El usuario está pidiendo ayuda con la estrategia de venta, textos, emails, objeciones, o consejos generales para hablar con su cliente.

    Tu respuesta debe ser **ESTRICTAMENTE** una de estas dos palabras clave, sin ninguna otra explicación, prefijo o texto adicional.

    Ejemplos:
    - Si el usuario dice: "Mi cliente es un fotógrafo que quiere mostrar su trabajo.", la respuesta es: RECOMMEND_SERVICE
    - Si el usuario dice: "Dame un texto para enviarle este presupuesto por email.", la respuesta es: ASSIST_SALES
  `;
    
  // La API de Gemini necesita el historial en formato { role: "user", parts: [{ text: "..." }] }
  const historyForApi = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.parts[0].text }]
  }));
  
  // Enviamos el mensaje del usuario con el prompt de clasificación como system prompt
  const response = await sendMessageToGemini(
    classificationPrompt,
    historyForApi,
    userMessage,
    'CLASSIFICATION' // Marcador para la función sendMessageToGemini
  );

  // Normalizar y limpiar la respuesta para obtener solo la palabra clave
  const intent = response.trim().toUpperCase().replace(/[^A-Z_]/g, '');

  if (intent.includes('ASSIST_SALES')) return 'ASSIST_SALES';
  return 'RECOMMEND_SERVICE'; 
}

// --- FUNCIÓN PARA COMUNICARSE CON GEMINI (ROBUSTA) ---

/**
 * @param {string} systemPrompt - Instrucción de sistema
 * @param {Array<Object>} history - Historial de chat
 * @param {string} userPrompt - Mensaje del usuario
 * @param {string} mode - Modo para ajustar configuración (ej. 'CLASSIFICATION' o 'RECOMMENDATION')
 */
async function sendMessageToGemini(systemPrompt, history, userPrompt, mode = 'DEFAULT') {
  if (!GEMINI_API_KEY) throw new Error("Gemini API no configurada correctamente.");

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const contents = [
    ...history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.parts[0].text }],
    })),
    { 
      role: "user", 
      parts: [{ text: userPrompt }] 
    },
  ];
  
  // Ajustar configuración para mayor precisión en clasificación/estructuración
  let config = { 
      temperature: 0.2, // Reducir temperatura para ser más estricto
      maxOutputTokens: 1000 
  };
  
  if (mode === 'CLASSIFICATION') {
      config.temperature = 0.0; // Lo más estricto posible
      config.maxOutputTokens = 20;
  }
  
  // Forzar respuesta JSON para recomendación (si la API lo soporta)
  // Aunque no es explícito en esta llamada de API, el System Prompt debe ser suficiente.
  // if (mode === 'RECOMMENDATION') { 
  //     config.responseMimeType = "application/json";
  // }
  
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: contents,
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          ...config
        }
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API respondió con ${response.status}: ${text}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`Respuesta de Gemini bloqueada por: ${blockReason}`);
        return `Mi respuesta fue bloqueada por políticas de seguridad (${blockReason}). Por favor, reformula tu pregunta.`;
      }
      console.error("Respuesta de Gemini vacía o en formato inesperado:", JSON.stringify(data, null, 2));
      return "El asistente no pudo generar una respuesta. Intenta de nuevo.";
    }
    
    return responseText;
  } catch (err) {
    console.error("Error comunicándose con Gemini:", err.message);
    throw new Error("No se pudo conectar con el motor Gemini.");
  }
}

// --- HANDLER PRINCIPAL (CON LÓGICA DE INTENCIÓN DINÁMICA) ---

exports.handler = async (event) => {
  const invocationId = new Date().toISOString() + "_" + Math.random().toString(36).substr(2, 9);
  console.log(`[${invocationId}] START`);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { history } = JSON.parse(event.body);
    if (!Array.isArray(history)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Historial inválido." }) };
    }

    const lastMessage = history[history.length - 1];
    const userMessage = lastMessage ? lastMessage.parts[0].text : "";
    
    if (!userMessage) {
      return { statusCode: 400, body: JSON.stringify({ error: "Mensaje vacío." }) };
    }
    
    // Filtramos el mensaje de bienvenida para no contaminar el contexto.
    const historyForApi = history.filter(
        (msg) => msg.parts[0].text !== '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.'
    );

    console.log(`[${invocationId}] MENSAJE: "${userMessage}"`);
    
    // --- LÓGICA DE INTENCIÓN APLICADA ---
    const intent = await detectUserIntent(userMessage, historyForApi);
    let userPrompt;
    let systemPrompt;
    let geminiMode = 'DEFAULT';
    
    if (intent === 'RECOMMEND_SERVICE') {
        // --- PROMPT PARA RECOMENDACIÓN DE SERVICIOS (MODO CONCISO Y ESTRUCTURADO JSON) ---
        
        geminiMode = 'RECOMMENDATION';
        const relevantIds = findRelevantServices(userMessage);
        
        // System Prompt que fuerza la salida JSON
        systemPrompt = `
            Eres Zen Assistant, un experto en desarrollo web enfocado en la reventa.
            Tu rol es ayudar a un revendedor a seleccionar los servicios exactos de un catálogo.
            
            INSTRUCCIONES CLAVE:
            1. Mantén el mensaje al revendedor profesional y conciso.
            2. Genera la respuesta **ESTRICTAMENTE** en el formato JSON a continuación.
            
            FORMATO DE RESPUESTA ESTRICTO (JSON):
            {
              "message": "[Tu mensaje profesional y conciso al revendedor]",
              "recommendations": [
                { "id": "[ID_DEL_SERVICIO]", "type": "[package|plan|standard]" },
                // ... hasta 4 recomendaciones
              ]
            }
            
            NO INCLUYAS NADA MÁS QUE EL BLOQUE JSON.
        `;

        if (relevantIds.length > 0) {
            const serviceIdsWithTypes = relevantIds.map(id => {
                let type;
                if (/^p\d+/.test(id)) type = 'package'; // Asumiendo pX son paquetes
                else if (/^\d+$/.test(id) && id >= 10) type = 'standard'; // Asumiendo IDs altos son estándar
                else if (/^\d+$/.test(id) && id <= 9) type = 'plan'; // Asumiendo IDs bajos son planes
                else type = 'standard'; // Valor por defecto
                
                return { id, type };
            });
            
            // Pasamos los IDs al prompt para que Gemini pueda usarlos.
            const recommendationsPayload = JSON.stringify(serviceIdsWithTypes);
            
            console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicio. Relevantes: ${relevantIds.join(", ")}`);
            userPrompt = `El revendedor describe un proyecto: "${userMessage}". Los servicios más relevantes son: ${formatServicesForPrompt(relevantIds)}. Crea la respuesta en el formato JSON estricto, seleccionando hasta 4 de esos IDs para el array "recommendations" y asignando el tipo correcto ('package', 'plan', o 'standard').`;
        } else {
            console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicio. Sin coincidencias.`);
            // En este caso, el campo recommendations estará vacío en el JSON.
            userPrompt = `El revendedor describe un nuevo proyecto: "${userMessage}". No encontré coincidencias claras. Genera la respuesta en el formato JSON estricto, con el array "recommendations" vacío, y pidiendo más detalles al revendedor en el campo 'message'.`;
        }
    } else { // intent === 'ASSIST_SALES'
        // --- PROMPT PARA ASISTENCIA EN VENTAS (MODO CONCISO) ---
        
        console.log(`[${invocationId}] INTENCIÓN: Asistente de Ventas`);
        
        systemPrompt = `
            Eres Zen Assistant, un coach de ventas de alto nivel para servicios web.
            Tu rol es ayudar a un revendedor a comunicarse eficazmente con su cliente final.
            
            INSTRUCCIONES CLAVE:
            - **Nunca uses el formato HTML o JSON.**
            - Mantén la respuesta concisa, profesional y directamente aplicable a la solicitud (ej. genera el texto solicitado, no lo resumas).
            - Analiza el historial para entender el contexto.
        `;
        
        userPrompt = `El revendedor necesita ayuda con la propuesta que acabamos de discutir. Su solicitud es: "${userMessage}". Genera el texto, el email o el consejo que le piden.`;
    }

    const responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt, geminiMode);
    
    // Solo actualizamos el historial si el mensaje no es el de clasificación.
    const updatedHistory = [
      ...history,
      { role: 'model', parts: [{ text: responseText }] }
    ];

    console.log(`[${invocationId}] OK. Intención: ${intent}`);
    // data.response es la respuesta cruda de Gemini (JSON o Texto)
    return { statusCode: 200, body: JSON.stringify({ response: responseText, history: updatedHistory }) };
  } catch (err) {
    console.error(`[${invocationId}] FATAL:`, err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Error interno del asistente: ${err.message}` }),
    };
  }
};