// /netlify/functions/chat.js
/**
 * Backend de producción del Asistente Zen.
 * Motor: OpenAI GPT-4o.
 * Propósito: recibir historial, analizar proyecto, y devolver recomendación estructurada.
 */

const OpenAI = require("openai");
const pricingData = require("./pricing.json");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Definila en Netlify
});

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((msg) => ({
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.parts[0].text,
        })),
        { role: "user", content: userPrompt },
      ],
    });

    const responseText = completion.choices[0].message.content.trim();
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
