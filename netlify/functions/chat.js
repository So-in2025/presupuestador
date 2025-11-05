// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen - v24 (CJS Compatibility Fix)
 * - Utiliza la clase `GoogleGenerativeAI` compatible con el entorno `require` de Netlify Functions para resolver el error fatal del constructor.
 * - Adapta la lógica de llamada a la API para usar `getGenerativeModel` y `generateContent` con `generationConfig`.
 * - Mantiene el uso de `responseSchema` para forzar una salida JSON garantizada, preservando la fiabilidad de la respuesta.
 */
const { GoogleGenerativeAI, Type } = require("@google/generative-ai");

// NOTA: En un entorno de producción real, este archivo JSON debería cargarse de forma más robusta.
// Para Netlify Functions, requerirlo directamente es la forma más sencilla.
const pricingData = require('./pricing.json');

// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Cuerpo de solicitud JSON inválido." }) };
    }

    const { userMessage, history: historyFromClient = [], mode, context, apiKey } = body;

    if (!userMessage || !mode || !apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Parámetros incompletos o API Key inválida." }) };
    }

    try {
        // Inicialización del SDK compatible con CommonJS
        const ai = new GoogleGenerativeAI({apiKey: apiKey});
        const modelName = 'gemini-2.5-flash';

        let systemInstruction = '';
        const contents = [...historyFromClient.map(h => ({ role: h.role, parts: h.parts })), { role: 'user', parts: [{ text: userMessage }] }];

        const generationConfig = {
            temperature: 0.2,
            topK: 1,
            topP: 1,
            maxOutputTokens: 8192,
        };
        
        // --- LÓGICA DE MODOS ---
        switch (mode) {
            case 'builder': {
                const serviceList = Object.values(pricingData.allServices)
                    .flatMap(cat => cat.items.map(s => `ID: ${s.id} | Name: ${s.name}`)).join('\n');
                const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
                const customTaskList = (pricingData.allServices.customTasks?.items || [])
                    .map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
                
                const contextText = (context?.selectedServicesContext?.length > 0)
                    ? `CONTEXTO: El revendedor ya ha seleccionado: ${context.selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Evita sugerir estos ítems de nuevo y basa tus recomendaciones en complementar esta selección.`
                    : '';
                
                systemInstruction = `
                    Eres un experto estratega de ventas de servicios web. Tu tarea es analizar la necesidad del cliente y construir la solución perfecta usando el catálogo proporcionado. Identifica proactivamente oportunidades de upsell y cross-sell. ${contextText}

                    --- CATÁLOGO DISPONIBLE ---
                    Paquetes y Servicios:
                    ${serviceList}
                    Planes Mensuales:
                    ${planList}
                    Tareas a Medida (para solicitudes no catalogadas):
                    ${customTaskList}
                `;

                generationConfig.responseMimeType = "application/json";
                generationConfig.responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        introduction: { type: Type.STRING, description: "Un saludo inicial amigable y un resumen de tu entendimiento de la necesidad del cliente." },
                        services: {
                            type: Type.ARRAY,
                            description: "Una lista de los servicios recomendados del catálogo.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING, description: "El ID exacto del servicio del catálogo." },
                                    name: { type: Type.STRING, description: "El nombre del servicio." },
                                    priority: { 
                                        type: Type.STRING, 
                                        description: "La prioridad de la recomendación.",
                                        enum: ['essential', 'recommended', 'optional']
                                    }
                                },
                                required: ['id', 'name', 'priority']
                            }
                        },
                        closing: { type: Type.STRING, description: "Un párrafo de cierre que explique brevemente por qué esta solución es la ideal." },
                        client_questions: {
                            type: Type.ARRAY,
                            description: "Una lista de 2-3 preguntas clave para el cliente final, para aclarar dudas y avanzar en la venta.",
                            items: { type: Type.STRING }
                        },
                        sales_pitch: { type: Type.STRING, description: "Un 'discurso de venta' de 1-2 frases para el revendedor, dándole un argumento poderoso para presentar la propuesta." }
                    },
                    required: ['introduction', 'services', 'closing', 'client_questions', 'sales_pitch']
                };
                break;
            }
            case 'lead-gen-plan': {
                systemInstruction = `Eres un "Estratega de Marketing y Ventas" IA. Tu única tarea es crear un plan de acción detallado y práctico de 7 días para captar clientes para un servicio web específico. Debes devolver únicamente un objeto JSON.`;
                
                generationConfig.responseMimeType = "application/json";
                generationConfig.responseSchema = {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        introduction: { type: Type.STRING },
                        daily_plan: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    day: { type: Type.INTEGER },
                                    theme: { type: Type.STRING },
                                    tasks: { type: Type.ARRAY, items: { type: Type.STRING } }
                                },
                                required: ['day', 'theme', 'tasks']
                            }
                        },
                        next_steps: { type: Type.STRING }
                    },
                    required: ['title', 'introduction', 'daily_plan', 'next_steps']
                };
                break;
            }
            case 'analyze':
                systemInstruction = `Eres un experto analista de negocios. Tu única tarea es leer la conversación y extraer una lista concisa de 3 a 5 requisitos clave del cliente final. Formatea tu respuesta como una lista con viñetas ('-'). No saludes ni te despidas, solo devuelve la lista.`;
                break;
            case 'objection':
                systemInstruction = `Eres Zen Coach, un experto coach de ventas. Ayuda al revendedor a superar las objeciones del cliente. Proporciona una respuesta estructurada, profesional y empática, enfocada en VALOR y BENEFICIOS. Transforma objeciones de "costo" en conversaciones de "inversión" y "retorno".`;
                break;
            case 'content-creator':
                 systemInstruction = `Eres "Zen Content Strategist", un experto en SEO y redes sociales. Genera contenido de alta conversión para servicios de desarrollo web.`;
                break;
            case 'image-prompt-creator':
                systemInstruction = `Eres un Director de Arte y Prompt Engineer de IA. Genera un prompt conciso en inglés para Midjourney/DALL-E basado en el post de redes sociales proporcionado.`;
                break;
            case 'outreach-generator':
                systemInstruction = `Eres un copywriter de ventas profesional. Escribe un email de contacto en frío altamente personalizado y persuasivo.`;
                break;
            case 'entrenamiento': {
                 let catalogString = '';
                 Object.values(pricingData.allServices).forEach(category => {
                     catalogString += `\nCATEGORÍA: ${category.name}\n` + category.items.map(item => `- ${item.name}: ${item.description} (Costo: $${item.price})`).join('\n');
                 });
                 systemInstruction = `Eres "SO->IN Product Expert", un asistente IA para entrenar afiliados. Proporciona información detallada y orientada a la venta sobre los servicios, basándote exclusivamente en este catálogo:\n${catalogString}`;
                 break;
            }
            default:
                systemInstruction = `Eres un asistente servicial.`;
        }

        const model = ai.getGenerativeModel({
            model: modelName,
            systemInstruction: { parts: [{ text: systemInstruction }] },
        });

        const result = await model.generateContent({
            contents: contents,
            generationConfig: generationConfig,
        });
        
        const response = result.response;
        const responseText = response.text();
        
        const finalHistoryForClient = [
            ...historyFromClient,
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: responseText }] }
        ];

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: finalHistoryForClient })
        };

    } catch (err) {
        console.error(`Error en la función del chat (modo: ${mode}):`, err);
        const errorDetails = err.message || String(err);
        let userFriendlyMessage = "Ocurrió un error inesperado al comunicarme con el asistente.";

        if (errorDetails.includes('API_KEY_INVALID') || errorDetails.includes('API key not valid')) {
            userFriendlyMessage = "Error de Autenticación: La API Key proporcionada no es válida.";
        } else if (errorDetails.includes('billing account')) {
            userFriendlyMessage = "Error de Facturación: La API Key es válida, pero no está asociada a un proyecto con facturación activa.";
        } else if (err.status === 429 || errorDetails.includes('quota')) {
            userFriendlyMessage = "Límite de Cuota Excedido: Has alcanzado el límite de solicitudes. Por favor, espera un momento.";
        } else if (err.status >= 500) {
            userFriendlyMessage = "El servicio de IA está experimentando problemas temporales. Inténtalo de nuevo más tarde.";
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: true,
                message: userFriendlyMessage,
                response: `Hubo un problema con la IA. ${userFriendlyMessage}`,
                history: historyFromClient
            })
        };
    }
};