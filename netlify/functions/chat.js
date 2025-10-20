// /netlify/functions/chat.js
/**
 * Backend de producción del Asistente Zen.
 * Motor: Gemini 2.5 Pro (con fallback a Gemini 2.5 base).
 * Propósito: recibir historial, analizar proyecto, y devolver recomendación estructurada.
 * Configurado para Netlify Node 18+ usando fetch global.
 */

const pricingData = require("./pricing.json");

// --- CONFIGURACIÓN DE GEMINI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_PRIMARY = "gemini-2.5-pro";
const GEMINI_MODEL_FALLBACK = "gemini-2.5";
const GEMINI_API_URL = (model) => `https://gemini.googleapis.com/v1/models/${model}:generate`;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY no está definida en variables de entorno.");
}

// --- FUNCIÓN DE BÚSQUEDA DE SERVICIOS ---
function findRelevantServices(project_description) {
  if (!project_description) throw new Error("Descripción de proyecto vacía.");

  const keywords =
    project_description.toLowerCase().match(/\b(\w{3,})\b/g) || [];
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

// --- FUNCIÓN PARA COMUNICARSE CON GEMINI ---
async function callGemini(model, url, systemPrompt, history, userPrompt) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.parts[0].text,
    })),
    { role: "user", content: userPrompt },
  ];

  const apiUrl = url || GEMINI_API_URL(model);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: messages.map((m) => m.content).join("\n"),
      max_output_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API responded with ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content || "Gemini no devolvió respuesta";
}

async function sendMessageToGemini(systemPrompt, history, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("Gemini API no configurada correctamente.");

  try {
    return await callGemini(GEMINI_MODEL_PRIMARY, null, systemPrompt, history, userPrompt);
  } catch (err) {
    console.warn("⚠️ Error con Gemini Pro, intentando modelo base...", err.message);
    try {
      return await callGemini(GEMINI_MODEL_FALLBACK, null, systemPrompt, history, userPrompt);
    } catch (fallbackErr) {
      console.error("❌ Falla también con modelo base:", fallbackErr.message);
      throw new Error("No se pudo conectar con el motor Gemini.");
    }
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

    console.log(`[${invocationId}] MENSAJE: "${userMessage}"`);

    const relevantIds = findRelevantServices(userMessage);
    const formattedServices = relevantIds.join(", ");

    const systemPrompt = `
Eres "Zen Assistant", un asesor de ventas web profesional.
Analizas la descripción del cliente y recomiendas servicios del catálogo.
Si hay coincidencias, usa el formato EXACTO:

Servicios: [IDs encontrados]
Respuesta: [Texto persuasivo y concreto para el revendedor.]

Si no hay coincidencias, pide más información profesionalmente.
`;

    const userPrompt =
      relevantIds.length > 0
        ? `El cliente describe: "${userMessage}".\nServicios relevantes encontrados: ${formattedServices}.\nFormula una respuesta usando el formato estricto.`
        : `El cliente describe: "${userMessage}".\nNo se encontraron coincidencias. Pide más detalles de forma profesional.`;

    const responseText = await sendMessageToGemini(systemPrompt, history, userPrompt);

    console.log(`[${invocationId}] OK`);
    return { statusCode: 200, body: JSON.stringify({ response: responseText }) };
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
