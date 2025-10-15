const { GoogleGenerativeAI } = require("@google/generative-ai");

async function getServiceCatalog() {
    try {
        const response = await fetch(`${process.env.URL}/pricing.json`);
        if (!response.ok) throw new Error(`Error al cargar pricing.json: ${response.statusText}`);
        const pricingData = await response.json();
        return pricingData;
    } catch (error) {
        console.error("Error en getServiceCatalog:", error);
        return "Error: No se pudo cargar el catálogo de servicios.";
    }
}

function formatServicesForPrompt(pricingData) {
    let serviceList = "\n--- CATÁLOGO DE SERVICIOS ---\n";
    for (const key in pricingData.allServices) {
        serviceList += `\n**CATEGORÍA**: ${pricingData.allServices[key].name}\n`;
        pricingData.allServices[key].items.forEach(item => {
            serviceList += `- **${item.name}** (ID: ${item.id}): ${item.description}\n`;
        });
    }
    if (pricingData.monthlyPlans) {
        serviceList += `\n**PLANES MENSUALES**\n`;
        pricingData.monthlyPlans.forEach(plan => {
            serviceList += `- **${plan.name}** (ID: ${plan.id}): ${plan.description}\n`;
        });
    }
    return serviceList;
}

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);
        const pricingData = await getServiceCatalog();
        if (typeof pricingData === 'string') return { statusCode: 500, body: JSON.stringify({ response: pricingData }) };
        const serviceCatalog = formatServicesForPrompt(pricingData);

        // NUEVO PROMPT ULTRA-CORTO
        const systemPrompt = `
            Eres 'Proyecto Zen Assistant', experto en ventas web.

            Conoces estos servicios. Cuando recomiendes algo, incluye siempre el Nombre y el ID (entre parentesis):
             ${formatServicesForPrompt(pricingData)}

            Analiza la necesidad del cliente (sin repetir sus palabras) y responde:
            1. **Servicios:** [IDs exactos, separados por coma]
            2. **Respuesta:** [Texto de venta, MAX 3 oraciones]. Cierra siempre preguntando "¿Qué te parece?"

            **EJEMPLO:**
            **Servicios:** p4, c5
            **Respuesta:** Para una web con blog y sistema de usuarios, te recomiendo la Web Corporativa (p4) y el Sistema de Usuarios (c5). Esto atraerá leads y te dará control. ¿Qué te parece?
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