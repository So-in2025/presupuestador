// /netlify/functions/chat.js
/**
 * Backend actualizado para Asistente Zen
 * Modelo: Gemini 2.5 Flash
 * Lógica de Intención: v4 (Soporte para modo 'objeción')
 * SDK: @google/generative-ai (Sintaxis corregida para el paquete solicitado)
 */

const fs = require('fs');
const path = require('path');
// MANTENER EL PAQUETE SOLICITADO POR EL USUARIO
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURACIÓN DE GEMINI ---
if (!process.env.API_KEY) {
  console.error("❌ API_KEY no está definida en variables de entorno.");
}
// CORRECCIÓN: Inicialización según la sintaxis del paquete antiguo
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const GEMINI_MODEL = "gemini-2.5-flash";

// --- FUNCIÓN DE AYDA PARA LA API DE GEMINI (ADAPTADA AL SDK ANTIGUO) ---
async function sendMessageToGemini(systemPrompt, history, geminiMode = "TEXT") {
  
  const generationConfig = {};
  let fullSystemPrompt = systemPrompt;

  if (geminiMode === "JSON") {
    generationConfig.responseMimeType = "application/json";
    // El SDK antiguo no usa `responseSchema`, se debe instruir en el prompt.
    fullSystemPrompt += `\n\nIMPORTANTE: Tu respuesta DEBE ser un objeto JSON válido que cumpla con este esquema:
    {
      "type": "OBJECT",
      "properties": {
        "introduction": { "type": "STRING" },
        "services": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "id": { "type": "STRING" },
              "is_new": { "type": "BOOLEAN" },
              "name": { "type": "STRING" },
              "description": { "type": "STRING" },
              "price": { "type": "NUMBER" }
            },
            "required": ["id", "is_new", "name"]
          }
        },
        "closing": { "type": "STRING" },
        "client_questions": { "type": "ARRAY", "items": { "type": "STRING" } },
        "sales_pitch": { "type": "STRING" }
      },
      "required": ["introduction", "services", "closing", "client_questions", "sales_pitch"]
    }`;
  }

  // CORRECCIÓN: Obtener el modelo con la configuración
  const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig,
      systemInstruction: {
          parts: [{ text: fullSystemPrompt }]
      }
  });

  // Lógica de reintento simple
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // CORRECCIÓN: Llamar a `generateContent` desde el objeto `model`
      const result = await model.generateContent({ contents: history });
      const response = await result.response;
      
      // CORRECCIÓN: Extraer texto usando el método `.text()` del objeto de respuesta
      const text = response.text();

      if (!text) {
        throw new Error("Respuesta de Gemini vacía o mal formada.");
      }
      return text;

    } catch (error) {
      console.error(`Error en intento ${attempt + 1}:`, error.message, error.stack);
      if (attempt === 2) {
        return JSON.stringify({ error: true, message: `Error al contactar con el asistente IA (máximo de reintentos): ${error.message}` });
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); 
    }
  }
}

// --- LÓGICA PRINCIPAL DE LA FUNCIÓN NETLIFY (HANDLER) ---
exports.handler = async (event) => {
  let pricingData;
  try {
      const pricingPath = path.join(__dirname, 'pricing.json');
      const pricingFileContent = fs.readFileSync(pricingPath, 'utf8');
      pricingData = JSON.parse(pricingFileContent);
  } catch (err) {
      console.error("ERROR CRÍTICO: No se pudo leer o parsear pricing.json", err);
      return {
          statusCode: 500,
          body: JSON.stringify({ error: true, message: 'Error interno del servidor: no se pudo cargar la configuración de precios.' })
      };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const { userMessage, history: historyForApi, mode } = body;
  const invocationId = Date.now(); 

  if (!userMessage || !historyForApi) {
    return { statusCode: 400, body: "Faltan parámetros: userMessage o history." };
  }

  const lastUserMessage = userMessage;

  try {
    let intent = "TEXTO"; 
    let geminiMode = "TEXT";
    let systemPrompt;

    if (mode === 'objection') {
        console.log(`[${invocationId}] MODO: Manejo de Objeción.`);
        intent = "OBJECION";
        systemPrompt = `
            Eres Zen Coach, un experto coach de ventas para revendedores de desarrollo web. Tu única misión es ayudar al revendedor a superar las objeciones de sus clientes.
            
            INSTRUCCIONES CLAVE:
            1.  Analiza la objeción del cliente que el revendedor te ha pasado.
            2.  Proporciona una respuesta estructurada, profesional y empática.
            3.  Divide tu respuesta en 2 o 3 puntos clave (párrafos cortos).
            4.  Enfócate en el VALOR y los BENEFICIOS, no en las características técnicas.
            5.  Traduce la objeción de "costo" a una conversación sobre "inversión" y "retorno".
            6.  Tu tono debe ser de apoyo y confianza, dándole al revendedor las herramientas para sonar como un experto.
            7.  NO generes JSON. Responde en texto plano y amigable.
            
            Ejemplo de objeción: "Tu propuesta es muy cara, he visto opciones más baratas."
            Tu posible respuesta podría empezar con: "Entiendo perfectamente que el precio es un factor importante. Aquí tienes cómo puedes abordar esa conversación, enfocándote en el valor a largo plazo..."
        `;
    } else {
        // --- MODO BUILDER (CLASIFICACIÓN) ---
        let classificationSystemPrompt = `
            Eres un clasificador de peticiones. Analiza el mensaje del revendedor.
            Tu única respuesta debe ser 'RECOMENDACION' si la pregunta es para pedir una sugerencia de servicios para un proyecto, o 'TEXTO' para cualquier otra cosa.
            Responde solo con la palabra en mayúsculas.
        `;
        const classificationHistory = [{ role: 'user', parts: [{ text: lastUserMessage }] }];
        const intentResponse = await sendMessageToGemini(classificationSystemPrompt, classificationHistory, "TEXT");
        intent = intentResponse.toUpperCase().trim().replace(/['"]+/g, '');
    }

    let responseText;
    
    if (intent === 'RECOMENDACION') {
        console.log(`[${invocationId}] INTENCIÓN: Recomendación de Servicios.`);
        geminiMode = "JSON"; 
        
        const serviceList = Object.values(pricingData.allServices)
            .flatMap(category => category.items) 
            .map(s => `ID: ${s.id} | Nombre: ${s.name} | Descripción: ${s.description}`).join('\n');
            
        const planList = pricingData.monthlyPlans
            .map(p => `ID: ${p.id} | Nombre: ${p.name} | Descripción: ${p.description}`).join('\n');
        
        const allServicesString = `--- CATÁLOGO COMPLETO ---\nSERVICIOS ESTÁNDAR:\n${serviceList}\nPLANES MENSUALES:\n${planList}`;

          systemPrompt = `
            Eres Zen Assistant, un estratega de productos y coach de ventas de élite. Tu tarea es analizar las necesidades del cliente y construir la solución perfecta.
            ${allServicesString}
            INSTRUCCIONES CLAVE:
            1.  Analiza la petición. Para cada servicio que recomiendes, crea un objeto en el array 'services'.
            2.  **Para servicios existentes:** Usa su 'id' y 'name' reales, y pon 'is_new: false'.
            3.  **Si un servicio necesario no existe:** ¡Créalo! Pon 'is_new: true', inventa un 'id' único (ej: 'custom-crm-integration'), un 'name' claro, una 'description' vendedora y un 'price' de producción justo.
            4.  En 'client_questions', crea preguntas para descubrir más oportunidades.
            5.  En 'sales_pitch', escribe un párrafo de venta enfocado en los beneficios.
        `;
    } else if (intent === 'TEXTO' || intent === 'DESCONOCIDA') {
        console.log(`[${invocationId}] INTENCIÓN: Texto general.`);
        geminiMode = "TEXT";
        systemPrompt = `
            Eres Zen Assistant. Actúa como un asistente de ventas general experto en desarrollo web.
            Responde de forma cortés, profesional y concisa a la consulta del revendedor.
        `;
    }
    // El caso de 'OBJECION' ya tiene su `systemPrompt` definido.

    responseText = await sendMessageToGemini(systemPrompt, historyForApi, geminiMode);

    try {
        const errorCheck = JSON.parse(responseText);
        if (errorCheck.error) {
             return { statusCode: 500, body: responseText };
        }
    } catch (e) { /* No es JSON, es texto de respuesta válido. */ }

    const updatedHistory = [
      ...historyForApi,
      { role: 'model', parts: [{ text: responseText }] }
    ];

    console.log(`[${invocationId}] OK. Intención/Modo: ${intent}. Devolviendo respuesta.`);
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        response: responseText, 
        history: updatedHistory 
      }) 
    };
    
  } catch (err) {
    console.error(`[${invocationId}] FATAL:`, err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: true, 
        message: `Error interno del servidor en la función Netlify: ${err.message}` 
      }),
    };
  }
};
