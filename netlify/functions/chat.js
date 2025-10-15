const { GoogleGenerativeAI } = require("@google/generative-ai");

async function getServiceCatalog() {
    try {
        const response = await fetch(`${process.env.URL}/pricing-short.json`);//URL MODIFICADA (y nombre del archivo)
        if (!response.ok) throw new Error(`Error al cargar pricing-short.json: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error("Error en getServiceCatalog:", error);
        return "Error: No se pudo cargar el catálogo de servicios.";
    }
}

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);
        const pricingData = await getServiceCatalog();
        if (typeof pricingData === 'string') return { statusCode: 500, body: JSON.stringify({ response: pricingData }) };

        // NUEVO PROMPT ULTRA-CORTO
        const systemPrompt = `
            Eres 'Proyecto Zen Assistant', experto en ventas web.
            Conoces estos servicios:

            A. Paquetes Web: Landing Page (p1), Web Presencial (p2), Portfolio (p3), Web+Blog (p4), E-commerce Básico (p5), E-commerce Avanzado (p6), Optimización Web (p7), App Web (p8)
            B. Mejoras UX: Animaciones (b1), Landing Extra (b2), Formulario (b3), Mapas/Gráficos (b4)
            C. Funcionalidad: Velocidad (c1), Diseño Visual (c2), API (c3), Base de Datos (c4), Usuarios (c5), Seguridad (c6)
            D. Integraciones: Pasarela Pago (d1), Microservicios (d2)
            Planes Mensuales: Mantenimiento (1), Soporte (2), Evolución (3), Crecimiento (4), Business Pro (5), Desarrollo (6), Retainer Agencia (7), Retainer Corporativo (8), Retainer Enterprise (9), Equipo Dedicado (10)
            
            Analiza la necesidad del cliente y responde:
            1. **Servicios:** [IDs, separados por coma]
            2. **Respuesta:** [Texto de venta, MAX 3 oraciones]. Cierra con "¿Qué te parece?"

            EJEMPLO:
            **Servicios:** p4, c5
            **Respuesta:** Para tu web con blog y sistema de usuarios, te recomiendo Web+Blog (p4) y Sistema de Usuarios (c5). Atraerá leads y te dará control. ¿Qué te parece?
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