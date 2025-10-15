// Importa el SDK de Google AI
const { GoogleGenerativeAI } = require("@google/generative-ai");
// Importa 'fs' para leer archivos locales (nuestro pricing.json)
const fs = require('fs');
const path = require('path');

// Accede a tu clave de API de Gemini guardada de forma segura en Netlify
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Función para cargar y formatear el catálogo de servicios
function getServiceCatalog() {
    try {
        const jsonPath = path.resolve(__dirname, '../../pricing.json'); // Sube 2 niveles para encontrar pricing.json en la raíz
        const jsonData = fs.readFileSync(jsonPath, 'utf-8');
        const pricingData = JSON.parse(jsonData);

        let serviceList = "--- INICIO DEL CATÁLOGO DE SERVICIOS ---\n";
        for (const key in pricingData.allServices) {
            serviceList += `\nCATEGORÍA: ${pricingData.allServices[key].name}\n`;
            pricingData.allServices[key].items.forEach(item => {
                serviceList += `- ID: ${item.id} | ${item.name}: ${item.description}\n`;
            });
        }
        if (pricingData.monthlyPlans) {
            serviceList += `\nPLANES MENSUALES:\n`;
            pricingData.monthlyPlans.forEach(plan => {
                serviceList += `- ID: ${plan.id} | ${plan.name}: ${plan.description}\n`;
            });
        }
        serviceList += "--- FIN DEL CATÁLOGO DE SERVICIOS ---\n";
        return serviceList;

    } catch (error) {
        console.error("Error al leer pricing.json:", error);
        return "Error: No se pudo cargar el catálogo de servicios.";
    }
}

// El prompt del sistema que define la personalidad y el conocimiento de la IA
const systemPrompt = `
    Eres 'SO-IN Assistant', un coach de ventas experto y un analista de soluciones de clase mundial, diseñado para ayudar a revendedores de desarrollo web. Eres amigable, profesional y extremadamente útil.

    Tu conocimiento se basa en el catálogo de servicios de la plataforma, que se lista a continuación. DEBES basar todas tus recomendaciones de servicios en este catálogo.
    
    ${getServiceCatalog()}

    Tus capacidades principales son:
    1.  **Analizar las necesidades del cliente:** Lee lo que el cliente pide y tradúcelo a servicios concretos del catálogo.
    2.  **Recomendar Soluciones:** Sugiere los IDs de los servicios que el revendedor debería añadir a la propuesta.
    3.  **Redactar Respuestas:** Escribe borradores de mensajes que el revendedor puede enviar a sus clientes para manejar objeciones, explicar el valor y cerrar la venta.
    4.  **Memoria Conversacional:** Recuerda los mensajes anteriores en esta conversación para dar respuestas contextuales.
    5.  **Responder Preguntas:** Contesta cualquier duda que el revendedor tenga sobre los servicios o estrategias de venta.

    REGLAS:
    - Siempre sé conciso y ve al grano.
    - Usa markdown (negritas, listas) para que tus respuestas sean fáciles de leer.
    - Cuando recomiendes servicios, menciona siempre su **Nombre** y su **ID** entre paréntesis. Ej: **Web Corporativa con Blog (p4)**.
    - NUNCA menciones precios a menos que el revendedor te lo pida explícitamente. Enfócate en el VALOR.
`;

// El manejador principal de la Netlify Function
exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt,
        });

        // Formatear el historial para la API de Gemini
        const geminiHistory = history.map(turn => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content }]
        }));
        
        // El último mensaje es el que queremos enviar ahora
        const userMessage = geminiHistory.pop().parts[0].text;

        const chat = model.startChat({
            history: geminiHistory,
        });

        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText }),
        };

    } catch (error) {
        console.error("Error en la función de Netlify:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error al procesar la solicitud de la IA." }),
        };
    }
};