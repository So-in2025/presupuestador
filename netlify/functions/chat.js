// /netlify/functions/chat.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SECCIÓN CORREGIDA ---
// Se eliminan 'fs' y 'path' que ya no son necesarios.
// Ahora usamos require() para cargar el JSON, que es la forma estándar y más segura en Node.js.
function getCatalogContext() {
    try {
        // require() busca el archivo relativo a este script (chat.js).
        // Por eso es crucial que 'pricing.json' esté en la misma carpeta.
        const pricingData = require('./pricing.json');

        let catalogSummary = "Tu conocimiento se basa exclusivamente en este catálogo de servicios:\n\n";

        // Paquetes (Soluciones Integrales)
        catalogSummary += "--- PAQUETES (Elige uno si el proyecto es nuevo) ---\n";
        pricingData.allServices.completeWebs.items.forEach(item => {
            catalogSummary += `ID: ${item.id}, Nombre: ${item.name}, Precio: $${item.price}, Desc: ${item.description}\n`;
        });

        // Ítems Individuales (Mejoras y Módulos)
        catalogSummary += "\n--- ÍTEMS INDIVIDUALES (Añade a un paquete o selecciona individualmente) ---\n";
        Object.values(pricingData.allServices).forEach(category => {
            if (!category.isExclusive) {
                category.items.forEach(item => {
                    catalogSummary += `ID: ${item.id}, Nombre: ${item.name}, Precio: $${item.price}, Desc: ${item.description}\n`;
                });
            }
        });
        
        // Planes Mensuales
        catalogSummary += "\n--- PLANES MENSUALES (Para soporte y mantenimiento post-lanzamiento) ---\n";
        pricingData.monthlyPlans.forEach(plan => {
             catalogSummary += `ID: ${plan.id}, Nombre: ${plan.name}, Precio: $${plan.price}/mes, Desc: ${plan.description}\n`;
        });

        return catalogSummary;

    } catch (error) {
        console.error("Error crítico al cargar o procesar pricing.json:", error);
        // Mensaje de error más útil para el log.
        return "Error: No se pudo cargar el contexto del catálogo de servicios. Asegúrate de que una copia de 'pricing.json' esté en la misma carpeta que 'chat.js'.";
    }
}

// --- EL RESTO DEL ARCHIVO PERMANECE EXACTAMENTE IGUAL ---
exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);

        if (!history || !Array.isArray(history) || history.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido o está vacío." }) };
        }
        
        const catalogContext = getCatalogContext();
        if (catalogContext.startsWith("Error:")) {
            return { statusCode: 500, body: JSON.stringify({ response: catalogContext }) };
        }

        const systemPrompt = `
            Eres 'Zen Assistant', un estratega de ventas web de élite. Tu misión es ayudar a revendedores a construir la propuesta perfecta para sus clientes usando la herramienta 'Centro de Operaciones'.
            
            ${catalogContext}

            Analiza la necesidad y el presupuesto (si se menciona) del cliente que te describe el revendedor. Responde SIEMPRE con este formato exacto:

            1. **Servicios:** [IDs de los servicios recomendados, separados por comas. Sé preciso. Si eliges un paquete, solo añade ítems sueltos si son mejoras claras y complementarias.]
            2. **Respuesta:** [Un texto de venta conciso y profesional para el REVENDEDOR. Justifica tu elección basándote en los precios y descripciones del catálogo. Guíale sobre cómo proceder en la herramienta.]

            EJEMPLO PERFECTO:
            Servicios: p6, c1
            Respuesta: Para una tienda online con muchos productos, la solución ideal es el E-commerce Avanzado (p6). Dado que cuesta $180, asegura que el cliente tenga un buen volumen de ventas. Añadir la Optimización de Velocidad (c1) es crucial para no perder clientes por tiempos de carga lentos. Puedes encontrar y seleccionar estos ítems en la sección 'Configurar la Solución'.
        `;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const geminiHistory = history.map(turn => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content }]
        }));

        const userMessage = geminiHistory.pop().parts[0].text;

        const chat = model.startChat({ history: geminiHistory, systemInstruction: systemPrompt });
        const result = await chat.sendMessage(userMessage);
        const responseText = result.response.text();

        return { statusCode: 200, body: JSON.stringify({ response: responseText }) };

    } catch (error) {
        console.error("Error en la función de Netlify:", error);
        return { statusCode: 500, body: JSON.stringify({ error: `Error en la IA: ${error.message}` }) };
    }
};