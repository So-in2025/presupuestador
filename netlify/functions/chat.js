// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v1
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
function findRelevantServices(project_description) {
  if (!project_description) throw new Error("Descripción de proyecto vacía.");

  const keywords = project_description.toLowerCase().match(/\b(\w{3,})\b/g) || [];
  if (keywords.length === 0) return [];

  const scores = {};
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

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);
}

/**
 * Función que usa Gemini para clasificar la intención del usuario.
 * @param {string} userMessage - El último mensaje del usuario.
 * @param {Array<Object>} history - El historial de la conversación.
 * @returns {Promise<string>} - Una de las dos intenciones: 'RECOMMEND_SERVICE' o 'ASSIST_SALES'.
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

  const historyForApi = history.map(msg => ({
    role: msg.role,
    parts: msg.parts
  }));
  
  // Enviamos el mensaje del usuario y el prompt de clasificación.
  const response = await sendMessageToGemini(
    classificationPrompt, // El prompt de clasificación es ahora el system prompt
    historyForApi,
    userMessage // El mensaje del usuario es el último mensaje
  );

  // Normalizar y limpiar la respuesta para obtener solo la palabra clave
  const intent = response.trim().toUpperCase().replace(/[^A-Z_]/g, '');

  if (intent.includes('ASSIST_SALES')) return 'ASSIST_SALES';
  return 'RECOMMEND_SERVICE'; // Por defecto, o si incluye 'RECOMMEND_SERVICE'
}

// --- FUNCIÓN PARA COMUNICARSE CON GEMINI (ROBUSTA) ---
async function sendMessageToGemini(systemPrompt, history, userPrompt) {
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

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
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

// --- HANDLER PRINCIPAL (CON LÓGICA DE INTENCIÓN) ---
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

    const userMessage = history.length > 0 ? history[history.length - 1].parts[0].text : "";
    if (!userMessage) {
      return { statusCode: 400, body: JSON.stringify({ error: "Mensaje vacío." }) };
    }
    
    const historyForApi = history.filter(
      (msg) => msg.parts[0].text !== '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.'
    );

    console.log(`[${invocationId}] MENSAJE: "${userMessage}"`);
    
    // --- LÓGICA DE INTENCIÓN APLICADA ---
    const intent = detectUserIntent(userMessage);
    let userPrompt;
    
    const systemPrompt = `
      Eres "Zen Assistant", un asesor de ventas y coach de negocios experto para una agencia de desarrollo. Tu misión es ayudar a un revendedor a tener éxito. Tienes dos modos de operación:

      1.  **Modo Recomendador**: Cuando el revendedor describe un nuevo proyecto, tu objetivo es analizarlo y recomendar servicios del catálogo. DEBES usar el formato estricto:
          Servicios: [lista de IDs separados por coma]
          Respuesta: [Texto persuasivo para el revendedor explicando la elección.]

      2.  **Modo Coach de Ventas**: Cuando el revendedor pide ayuda sobre una propuesta ya creada (un texto, un email, un consejo), tu objetivo es actuar como un coach experto. Analiza la conversación y entrégale el material que necesita para hablar con su cliente final. NO generes una nueva lista de servicios en este modo.

      Mantén siempre un tono profesional, útil y motivador.`;

    if (intent === 'RECOMMEND_SERVICES') {
      console.log(`[${invocationId}] INTENCIÓN: Recomendar Servicios`);
      const relevantIds = findRelevantServices(userMessage);
      
      if (relevantIds.length > 0) {
        const formattedServices = relevantIds.join(", ");
        userPrompt = `El revendedor describe un nuevo proyecto: "${userMessage}".\nHe encontrado estos servicios relevantes: ${formattedServices}.\nActúa en **Modo Recomendador** y crea la respuesta para el revendedor usando el formato estricto.`;
      } else {
        userPrompt = `El revendedor describe un nuevo proyecto: "${userMessage}".\nNo encontré coincidencias claras. Pide más detalles de forma profesional para poder hacer una recomendación.`;
      }
    } else { // intent === 'ASSIST_SALES'
      console.log(`[${invocationId}] INTENCIÓN: Asistente de Ventas`);
      userPrompt = `El revendedor necesita ayuda con la propuesta que acabamos de discutir. Su solicitud es: "${userMessage}".\n\nAnaliza la conversación anterior para entender el contexto (ej. el fotógrafo). Ahora, actúa en **Modo Coach de Ventas** y genera el texto, el email o el consejo que le piden para que pueda comunicarse eficazmente con su cliente final. No uses el formato de recomendación.`;
    }

    const responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt);
    
    const updatedHistory = [
      ...history,
      { role: 'model', parts: [{ text: responseText }] }
    ];

    console.log(`[${invocationId}] OK`);
    return { statusCode: 200, body: JSON.stringify({ response: responseText, history: updatedHistory }) };
  } catch (err) {
    console.error(`[${invocationId}] FATAL:`, err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Error interno del asistente: ${err.message}` }),
    };
  }
};