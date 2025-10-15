// Importa el SDK de Google AI
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Accede a tu clave de API de Gemini guardada de forma segura en Netlify
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- CORRECCIÓN CLAVE ---
// Ahora la función es 'async' y usa 'fetch' para cargar el JSON desde la URL pública.
async function getServiceCatalog() {
    try {
        // La variable 'URL' es proporcionada por Netlify y contiene la URL principal de tu sitio.
        const response = await fetch(`${process.env.URL}/pricing.json`);
        if (!response.ok) {
            throw new Error(`Error al cargar pricing.json: ${response.statusText}`);
        }
        const pricingData = await response.json();

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
        console.error("Error en getServiceCatalog:", error);
        return "Error: No se pudo cargar el catálogo de servicios. El asistente podría no funcionar correctamente.";
    }
}

// El manejador principal de la Netlify Function (ahora es 'async')
exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);
        // --- CORRECCIÓN CLAVE ---
        // Esperamos a que el catálogo de servicios se cargue antes de continuar.
        const serviceCatalog = await getServiceCatalog();

        const systemPrompt = `
            Eres 'Proyecto Zen Assistant', un coach de ventas experto y un analista de soluciones de clase mundial, diseñado para ayudar a revendedores de desarrollo web. Eres amigable, profesional y extremadamente útil.

            Tu conocimiento se basa en el catálogo de servicios de la plataforma, que se lista a continuación. DEBES basar todas tus recomendaciones de servicios en este catálogo.

            ${serviceCatalog}

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

        const model = genAI.getGenerativeModel({
            model: "gemini-pro", //El modelo nuevo el gemini-1.5-flash ya no existe!
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
            systemInstruction: systemPrompt,
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