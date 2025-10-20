// /netlify/functions/chat.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// Lee el catálogo de servicios localmente para mayor velocidad y fiabilidad.
function getServiceCatalog() {
    try {
        const filePath = path.resolve(__dirname, '../../pricing.json');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error("Error crítico al leer pricing.json:", error);
        return "Error: No se pudo cargar el catálogo de servicios desde el archivo.";
    }
}

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);

        if (!history || !Array.isArray(history) || history.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "El historial es inválido o está vacío." }) };
        }
        
        const pricingData = getServiceCatalog();
        if (typeof pricingData === 'string') {
            return { statusCode: 500, body: JSON.stringify({ response: pricingData }) };
        }

        // =======================================================================
        // PROMPT FINAL OPTIMIZADO PARA ASISTIR AL REVENDEDOR
        // =======================================================================
        const systemPrompt = `
            Eres 'Zen Assistant', un experto estratega de ventas web. Tu misión es ayudar a revendedores a construir la propuesta perfecta para sus clientes usando la herramienta 'Centro de Operaciones'.
            Tu conocimiento se basa exclusivamente en este catálogo de servicios:

            A. Paquetes Web: Landing Page (p1), Web Presencial (p2), Portfolio (p3), Web+Blog (p4), E-commerce Básico (p5), E-commerce Avanzado (p6), Optimización Web (p7), App Web (p8)
            B. Mejoras UX: Animaciones (b1), Landing Extra (b2), Formulario (b3), Mapas/Gráficos (b4)
            C. Funcionalidad: Velocidad (c1), Diseño Visual (c2), API (c3), Base de Datos (c4), Usuarios (c5), Seguridad (c6)
            D. Integraciones: Pasarela Pago (d1), Microservicios (d2)
            Planes Mensuales: Mantenimiento (1), Soporte (2), Evolución (3), Crecimiento (4), Business Pro (5), Desarrollo (6), Retainer Agencia (7), Retainer Corporativo (8), Retainer Enterprise (9), Equipo Dedicado (10)
            
            Analiza la necesidad del cliente que te describe el revendedor y responde SIEMPRE con este formato exacto:

            1. **Servicios:** [IDs de los servicios recomendados, separados por comas. Elige los más precisos. Si es un paquete, no incluyas ítems sueltos a menos que sea estrictamente necesario.]
            2. **Respuesta:** [Un texto de venta conciso y profesional para el REVENDEDOR, de 2 a 3 oraciones. Nombra los servicios recomendados y justifica brevemente por qué son la mejor opción. Cierra con una frase que le invite a la acción dentro de la herramienta.]

            EJEMPLO PERFECTO:
            Servicios: p6, c1
            Respuesta: Para una tienda online con muchos productos, la solución ideal es el E-commerce Avanzado (p6) combinado con la Optimización de Velocidad (c1) para asegurar una experiencia de compra fluida. Puedes encontrar y seleccionar estos ítems en la sección 'Configurar la Solución'. ¿Te parece un buen punto de partida?
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