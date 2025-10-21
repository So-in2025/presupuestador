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
async function sendMessageToGemini(systemPrompt, history, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API no configurada correctamente.");

  // La URL de la API ahora incluye la clave como parámetro, que es el método correcto.
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // La API moderna de Gemini gestiona el historial y el system prompt directamente en el array de contenidos.
  const contents = [
    // El historial se formatea para que coincida con la estructura que espera la API
    ...history.map((msg) => ({
      role: msg.role, // "user" o "model"
      parts: [{ text: msg.parts[0].text }],
    })),
    // El mensaje final del usuario se añade al final
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
        // El encabezado "Authorization: Bearer" se elimina. La clave ahora va en la URL.
      },
      body: JSON.stringify({
        contents: contents, // Se usa la estructura "contents"
        systemInstruction: { // El system prompt se envía en un campo dedicado
          parts: [{ text: systemPrompt }]
        },
        generationConfig: { // Los parámetros van dentro de "generationConfig"
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
    
    // La estructura de la respuesta también ha cambiado
    if (!data.candidates || data.candidates.length === 0) {
      // Manejar el caso de bloqueo de contenido u otras respuestas vacías
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`Respuesta de Gemini bloqueada por: ${blockReason}`);
        return `Mi respuesta fue bloqueada por políticas de seguridad (${blockReason}). Por favor, reformula tu pregunta.`;
      }
      return "Gemini no devolvió una respuesta válida.";
    }
    
    return data.candidates[0]?.content?.parts[0]?.text || "Gemini no devolvió contenido de texto.";
  } catch (err) {
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