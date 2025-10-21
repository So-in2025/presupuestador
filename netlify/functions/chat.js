// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 1.5 Flash (v1beta)
 * Compatible con Node 18+ en Netlify
 */

const pricingData = require("./pricing.json");

// --- CONFIGURACIÓN DE GEMINI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Se recomienda usar gemini-1.5-flash para un mejor rendimiento y capacidades.
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

// --- FUNCIÓN PARA COMUNICARSE CON GEMINI (CORREGIDA) ---
// --- FUNCIÓN PARA COMUNICARSE CON GEMINI (CORREGIDA Y ROBUSTA) ---
async function sendMessageToGemini(systemPrompt, history, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API no configurada correctamente.");

  const GEMINI_MODEL = "gemini-2.5-flash"; // Usando el nombre de modelo correcto
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API respondió con ${response.status}: ${text}`);
    }

    const data = await response.json();
    
    // --- INICIO DE LA CORRECCIÓN CLAVE ---
    // Esta nueva línea extrae el texto de forma segura, previniendo el error.
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    // --- FIN DE LA CORRECCIÓN CLAVE ---

    if (!responseText) {
      // Si no hay texto, investigamos por qué.
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`Respuesta de Gemini bloqueada por: ${blockReason}`);
        return `Mi respuesta fue bloqueada por políticas de seguridad (${blockReason}). Por favor, reformula tu pregunta.`;
      }
      // Si no fue bloqueada, es otra respuesta vacía inesperada.
      console.error("Respuesta de Gemini vacía o en formato inesperado:", JSON.stringify(data, null, 2));
      return "El asistente no pudo generar una respuesta. Intenta de nuevo.";
    }
    
    return responseText;

  } catch (err) {
    // Aquí atrapamos el error si el JSON.parse falla o si hay un error de red.
    // El error que veías ("Cannot read properties...") estaba sucediendo ANTES de que pudiera ser atrapado aquí.
    console.error("Error comunicándose con Gemini:", err.message);
    throw new Error("No se pudo conectar con el motor Gemini.");
  }
}

// --- HANDLER PRINCIPAL ---
exports.handler = async (event) => {
  const invocationId =
    new Date().toISOString() + "_" + Math.random().toString(36).substr(2, 9);
  console.log(`[${invocationId}] START`);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { history } = JSON.parse(event.body);
    if (!Array.isArray(history)) {
      console.error(`[${invocationId}] ERROR: historial inválido`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Historial inválido." }),
      };
    }

    const userMessage =
      history.length > 0 ? history[history.length - 1].parts[0].text : "";
    if (!userMessage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Mensaje vacío." }),
      };
    }
    
    // Filtramos el mensaje de bienvenida inicial del historial que se envía a la API
    const historyForApi = history.filter(
      (msg) => msg.parts[0].text !== '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.'
    );

    console.log(`[${invocationId}] MENSAJE: "${userMessage}"`);

    const relevantIds = findRelevantServices(userMessage);
    const formattedServices = relevantIds.join(", ");

    const systemPrompt = `
Eres "Zen Assistant", un asesor de ventas web profesional para una agencia de desarrollo.
Tu objetivo es analizar la descripción de un cliente y recomendar servicios específicos de un catálogo interno.
Si encuentras servicios relevantes, DEBES usar el siguiente formato de manera ESTRICTA, sin añadir texto introductorio antes o después:

Servicios: [lista de IDs de servicios separados por coma, ej: p2, c1, b3]
Respuesta: [Aquí va tu texto de respuesta. Debe ser persuasivo, profesional y dirigido a un revendedor (la agencia), explicándole por qué esos servicios son los correctos para su cliente final.]

Si la descripción del cliente es demasiado vaga o no encuentras coincidencias claras, pide más información de forma profesional para poder hacer una recomendación precisa. No inventes servicios.
`;

    const userPrompt =
      relevantIds.length > 0
        ? `El cliente describe: "${userMessage}".\nBasado en esto, los IDs de servicios más relevantes que he encontrado son: ${formattedServices}.\nPor favor, formula una respuesta para el revendedor usando el formato estricto que te indiqué.`
        : `El cliente describe: "${userMessage}".\nNo he encontrado coincidencias claras en el catálogo con esta descripción. Por favor, pide al revendedor más detalles de forma profesional para poder asistirle mejor.`;

    const responseText = await sendMessageToGemini(systemPrompt, historyForApi, userPrompt);
    
    // Añadimos la respuesta del modelo al historial para la siguiente llamada
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
      body: JSON.stringify({
        error: `Error interno del asistente: ${err.message}`,
      }),
    };
  }
};