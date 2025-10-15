const { GoogleGenerativeAI } = require("@google/generative-ai");

// *** NUEVO: DEFINE EL CATÁLOGO DE SERVICIOS RESUMIDO AQUÍ ***
const SERVICE_CATALOG = [
    { category: "Paquetes Web", 
      items: [
        { id: "p1", name: "Landing Page", description: "Conversión directa" },
        { id: "p2", name: "Web Presencial", description: "Sitio profesional (hasta 5 secciones)" },
        { id: "p3", name: "Portfolio", description: "Web visual para creativos" },
        { id: "p4", name: "Web+Blog", description: "Generación de leads con blog" },
        { id: "p5", name: "E-commerce Básico", description: "Venta directa (15 productos)" },
        { id: "p6", name: "E-commerce Avanzado", description: "Tienda completa con carrito" },
        { id: "p7", name: "Optimización Web", description: "Mejora velocidad y seguridad" },
        { id: "p8", name: "App Web", description: "Proyecto a medida" }
      ] 
    },
    { category: "Mejoras UX",
      items: [
        { id: "b1", name: "Animaciones", description: "Microinteracciones sutiles" },
        { id: "b2", name: "Landing Extra", description: "Página de aterrizaje adicional" },
        { id: "b3", name: "Formulario Inteligente", description: "Captura datos avanzada" },
        { id: "b4", name: "Mapas/Gráficos", description: "Visualización enriquecida" }
      ]
    },
    { category: "Funcionalidad",
      items: [
        { id: "c1", name: "Velocidad (Web Vitals)", description: "Optimización de carga" },
        { id: "c2", name: "Diseño Visual (Branding)", description: "Guía de estilo" },
        { id: "c3", name: "API (Backend)", description: "Conexión interfaz/datos" },
        { id: "c4", name: "Base de Datos", description: "Estructura de datos" },
        { id: "c5", name: "Sistema de Usuarios", description: "Login y roles" },
        { id: "c6", name: "Seguridad (Auditoría)", description: "Refuerzo contra ataques" }
      ]
    },
    { category: "Integraciones",
      items: [
        { id: "d1", name: "Pasarela de Pagos", description: "Conexión con Stripe/PayPal" },
        { id: "d2", name: "Microservicios", description: "Backend escalable" }
      ]
    },
    { category: "Planes Mensuales",
      items: [
        { id: "1", name: "Mantenimiento Esencial", description: "3 tareas/mes" },
        { id: "2", name: "Soporte Activo", description: "5 tareas/mes (ajustes)" },
        { id: "3", name: "Evolución Continua", description: "4 Ajustes + 1 Desarrollo" },
        { id: "4", name: "Crecimiento Acelerado", description: "5 Ajustes + 2 Desarrollo" },
        { id: "5", name: "Business Pro", description: "6 Ajustes + 3 Desarrollo" },
        { id: "6", name: "Desarrollo Intensivo", description: "5 Ajustes + 5 Desarrollo" },
        { id: "7", name: "Retainer Agencia", description: "15 tareas (1 Integración)" },
        { id: "8", name: "Retainer Corporativo", description: "20 tareas (2 Integraciones)" },
        { id: "9", name: "Retainer Enterprise", description: "30 tareas (3 Integraciones)" },
        { id: "10", name: "Equipo Dedicado", description: "Tareas ilimitadas" }
      ]
    }
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { history } = JSON.parse(event.body);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // NUEVO PROMPT ULTRA-EFICIENTE
        const systemPrompt = `
            Eres 'Proyecto Zen Assistant', experto en ventas web.
            
            Conoces estos servicios:
            ${formatServicesForPrompt()}

            Analiza la necesidad del cliente y responde:
            1. **Servicios:** [IDs exactos, separados por coma]
            2. **Respuesta:** [Texto de venta, MAX 3 oraciones]

            **EJEMPLO:**
            **Servicios:** p4, c5
            **Respuesta:** Para tu web con blog y sistema de usuarios, te recomiendo la Web Corporativa (p4) y el Sistema de Usuarios (c5) para gestionar roles y acceso. ¡Esto atraerá leads y te dará control!
        `;

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

// Formatear servicios para el prompt (mucho más corto)
function formatServicesForPrompt() {
    let serviceList = "\n";
    SERVICE_CATALOG.forEach(category => {
        serviceList += `\n**${category.category}**: `;
        serviceList += category.items.map(item => `**${item.name}** (ID: ${item.id})`).join(', ');
    });
    return serviceList;
}