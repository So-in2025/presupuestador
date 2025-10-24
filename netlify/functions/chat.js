// /netlify/functions/chat.js
// VERSIÓN FINAL, CREADA DESDE CERO PARA SER 100% COMPATIBLE.

const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DE GEMINI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY no está definida en variables de entorno.");
}

// --- FUNCIÓN DE AYUDA PARA LA API DE GEMINI ---
async function sendMessageToGemini(systemPrompt, history, geminiMode = "TEXT") {
  if (!GEMINI_API_KEY) {
    throw new Error("API Key de Gemini no configurada.");
  }
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: history,
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  // Configuración específica para forzar la salida JSON cuando se solicita
  if (geminiMode === "JSON") {
    payload.responseMimeType = "application/json";
    payload.responseSchema = {
      type: "OBJECT",
      properties: {
        introduction: { type: "STRING", description: "Texto introductorio y explicativo para el revendedor." },
        services: { type: "ARRAY", items: { type: "STRING" }, description: "Array de IDs de servicios recomendados (ej: 'p1', 'c2')." },
        closing: { type: "STRING", description: "Texto de cierre para el revendedor." }
      },
      required: ["introduction", "services", "closing"]
    };
  }

  // Lógica de reintentos
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Error de API Gemini: ${response.status}. ${errorDetails.substring(0, 100)}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("Respuesta de Gemini vacía o en formato inesperado.");
      }
      return text;
    } catch (error) {
      console.error(`Intento ${attempt + 1} fallido:`, error.message);
      if (attempt === 2) {
        // Si todos los reintentos fallan, devolvemos un JSON de error que el frontend puede mostrar.
        return JSON.stringify({ error: true, message: `No se pudo conectar con el asistente IA. ${error.message}` });
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

// --- HANDLER PRINCIPAL DE NETLIFY ---
exports.handler = async (event) => {
  // 1. Validaciones iniciales
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2. Carga del catálogo de precios (de forma segura DENTRO del handler)
  let pricingData;
  try {
      const pricingPath = path.join(__dirname, 'pricing.json');
      const pricingFileContent = fs.readFileSync(pricingPath, 'utf8');
      pricingData = JSON.parse(pricingFileContent);
  } catch (err) {
      console.error("ERROR CRÍTICO al cargar pricing.json:", err);
      return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Error interno: No se pudo cargar la configuración de precios.' }) };
  }

  try {
    const { userMessage, history } = JSON.parse(event.body);
    if (!userMessage || !history) {
      return { statusCode: 400, body: JSON.stringify({ error: true, message: "Faltan parámetros 'userMessage' o 'history'." }) };
    }

    // 3. Detección de intención del usuario (rápida y eficiente)
    const classificationPrompt = `Analiza la petición del usuario. Responde solo con una palabra: RECOMENDACION para sugerencias de servicios, o TEXTO para todo lo demás.`;
    const intentHistory = [{ role: 'user', parts: [{ text: userMessage }] }];
    const intentResponse = await sendMessageToGemini(classificationPrompt, intentHistory);
    const intent = intentResponse.toUpperCase().trim();

    let systemPrompt;
    let geminiMode = "TEXT";
    let finalHistory = [...history, { role: 'user', parts: [{ text: userMessage }] }];

    // 4. Lógica basada en la intención
    if (intent === 'RECOMENDACION') {
        geminiMode = "JSON";
        const serviceList = Object.values(pricingData.allServices).flatMap(c => c.items).map(s => `ID: ${s.id} | Nombre: ${s.name}`).join('\n');
        const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Nombre: ${p.name}`).join('\n');
        const catalog = `--- CATÁLOGO ---\n${serviceList}\n${planList}`;

        systemPrompt = `
            Eres Zen Assistant, un experto en desarrollo web. Tu tarea es recomendar IDs de servicios del catálogo para el proyecto que describe el usuario.
            BASA tu recomendación únicamente en el catálogo proporcionado.
            Responde ESTRICTAMENTE en el formato JSON definido, con las claves "introduction", "services" (un array de strings con los IDs), y "closing".
            La respuesta debe ser profesional y persuasiva para el revendedor.
            ${catalog}
        `;
    } else { // TEXTO
        systemPrompt = `
            Eres Zen Assistant, un coach de ventas experto. Responde al usuario de forma cortés, profesional y concisa, ayudándole con su consulta.
        `;
    }

    // 5. Llamada final a Gemini y construcción de la respuesta
    const responseText = await sendMessageToGemini(systemPrompt, finalHistory, geminiMode);
    
    // El frontend espera el historial completo, incluyendo la última respuesta del modelo
    const updatedHistory = [...finalHistory, { role: 'model', parts: [{ text: responseText }] }];

    return {
      statusCode: 200,
      body: JSON.stringify({ response: responseText, history: updatedHistory })
    };

  } catch (err) {
    console.error("FATAL ERROR en el handler:", err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: true, message: `Error interno del servidor: ${err.message}` })
    };
  }
};