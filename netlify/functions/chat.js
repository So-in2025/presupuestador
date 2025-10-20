// /netlify/functions/chat.js
/**
 * Backend de producción del Asistente Zen.
 * Motor: DeepSeek R1.
 * Propósito: recibir historial, analizar proyecto, y devolver recomendación estructurada.
 */

const fetch = require("node-fetch"); // si usás Node 18+, fetch ya está disponible
const pricingData = require("./pricing.json");

// --- CONFIGURACIÓN DE DEEPSEEK ---
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.ai/v1/r1/generate";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "TU_API_KEY_DEEPSEEK";

// --- FUNCIÓN DE BÚSQUEDA REAL ---
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

// --- FUNCION PARA COMUNICARSE CON DEEPSEEK ---
async function sendMessageToDeepSeek(systemPrompt, history, userPrompt) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.parts[0].text,
    })),
    { role: "user", content: userPrompt },
  ];

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      input: messages.map(m => m.content).join("\n"),
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`Error al comunicarse con DeepSeek: ${response.status}`);
  }

  const data = await response.json();
  // Ajusta según la estructura real de la respuesta de DeepSeek R1
  return data.output_text || "DeepSeek no devolvió respuesta";
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
        ? `El cliente describe: "${userMessage}".
Servicios relevantes encontrados: ${formattedServices}.
Formula una respuesta usando el formato estricto.`
        : `El cliente describe: "${userMessage}".
No se encontraron coincidencias. Pide más detalles de forma profesional.`;

    const responseText = await sendMessageToDeepSeek(systemPrompt, history, userPrompt);

    console.log(`[${invocationId}] OK`);
    return { statusCode: 200, body: JSON.stringify({ response: responseText }) };
  } catch (err) {
    console.error(`[${invocationId}] FATAL:`, err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `Error interno del asistente: ${err.message}`,
      }),
    };
  }
};
