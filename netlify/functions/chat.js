// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * Lógica de Intención: v36 - Lead Gen Plan
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json');

// --- CONSTANTS & CONFIGURATION ---
const TEXT_MODEL_NAME = 'gemini-2.5-flash';
const IMAGE_MODEL_NAME = 'gemini-2.5-flash-image';

// --- PROMPT TEMPLATES ---
const ANALYZE_INSTRUCTION = `You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using '-' for each point. Do not greet, do not say goodbye, just return the list.`;

const OBJECTION_INSTRUCTION = `You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."`;

const LEAD_GEN_PLAN_INSTRUCTION = `You are a "Marketing & Sales Strategist" AI. Your one and only mission is to empower a web development affiliate/reseller to get their first high-quality client within 7 days. You will create a detailed, actionable 7-day plan.

**CONTEXT:**
- The affiliate will promote a specific service: [SERVICE TO PROMOTE]
- Their ideal client is: [TARGET AUDIENCE]

**YOUR TASK:**
Create a step-by-step 7-day plan. For each day, provide a clear "Theme" and a list of 2-3 concrete, actionable "Tasks". The tasks should be practical and focused on building authority, creating value, and initiating conversations.

**OUTPUT FORMAT:**
Your response MUST be a single, valid JSON object. Do NOT include any text, comments, or markdown before or after the JSON.

**JSON STRUCTURE:**
{
  "title": "Plan de Captación de Clientes: Tu Hoja de Ruta de 7 Días",
  "introduction": "Este plan está diseñado para posicionarte como un experto y atraer a tu cliente ideal en una semana. La clave es la consistencia y aportar valor en cada paso.",
  "daily_plan": [
    {
      "day": 1,
      "theme": "Optimización de Perfil y Mentalidad",
      "tasks": [
        "Tarea 1 para el día 1...",
        "Tarea 2 para el día 1..."
      ]
    },
    {
      "day": 2,
      "theme": "Creación de Contenido de Valor",
      "tasks": [
        "Tarea 1 para el día 2...",
        "Tarea 2 para el día 2..."
      ]
    },
    // ... continue for all 7 days ...
    {
      "day": 7,
      "theme": "La Llamada a la Acción (CTA)",
      "tasks": [
        "Tarea 1 para el día 7...",
        "Tarea 2 para el día 7..."
      ]
    }
  ],
  "next_steps": "Al final de esta semana, no solo tendrás más visibilidad, sino que habrás iniciado conversaciones valiosas. ¡Ahora, a ejecutar con disciplina!"
}
`;

const ENTRENAMIENTO_INSTRUCTION_TEMPLATE = (catalogData) => `You are "SO->IN Product Expert", a specialized AI assistant. Your sole purpose is to train and empower affiliates by providing detailed, sales-oriented information about the services offered. You MUST base your answers exclusively on the provided service catalog.

**Your Core Directives:**
1.  **Be an Expert:** When asked about a service, explain what it is, who it's for, and most importantly, what the key selling points (benefits) are.
2.  **Stay Focused:** Do NOT invent services or features. If a service is not in the catalog, state that clearly and professionally.
3.  **Think Like a Salesperson:** Frame your answers to help the affiliate sell. Instead of just listing features, explain the value they provide to the end client. For example, instead of "it has SEO," say "it helps the client get found on Google, attracting more customers."
4.  **Be Clear and Concise:** Provide answers in a structured way, using bullet points or short paragraphs for readability.

--- SO->IN SERVICE CATALOG (YOUR KNOWLEDGE BASE) ---
${catalogData}
--- END OF CATALOG ---

Now, answer the affiliate's question based on this information.`;

const BUILDER_INSTRUCTION_TEMPLATE = (serviceList, planList, contextText, customTaskList) =>
`Act as a JSON API. Analyze the user's request for a web project and build the perfect solution using ONLY the provided catalog. You MUST proactively identify opportunities for 'upsell' or 'cross-sell'. ${contextText}

--- AVAILABLE CATALOG ---
${serviceList}
${planList}
--- CUSTOM TASKS (Use these for requests not in the catalog) ---
${customTaskList}

Your response MUST be a single, valid JSON object with the following structure: 
{ 
  "introduction": "...", 
  "services": [{ "id": "...", "name": "...", "priority": "...", "is_new": boolean (optional) }], 
  "closing": "...", 
  "client_questions": ["..."], 
  "sales_pitch": "..." 
}

**CRITICAL INSTRUCTIONS FOR 'services' ARRAY:**
1.  For each service object, you MUST include a "priority" key.
2.  The value for "priority" MUST be one of these three strings: "essential", "recommended", or "optional".
3.  **NEW TASK: CUSTOM SERVICE SUGGESTIONS:**
    - If the user requests a specific feature NOT in the catalog (e.g., 'integration with Calendly', 'real-time chat'), you MUST handle it.
    - First, ESTIMATE its complexity: 'small', 'medium', or 'large'.
    - Second, assign the corresponding ID from the 'CUSTOM TASKS' list ('custom-s', 'custom-m', 'custom-l').
    - Third, you MUST provide a descriptive 'name' for the task (e.g., "Integración con Calendly").
    - Fourth, you MUST include the property '"is_new": true'.
    - Example: For a Calendly integration, you estimate it's a medium task. Your service object MUST be: { "id": "custom-m", "name": "Integración con Calendly", "priority": "recommended", "is_new": true }
4.  Do NOT add any text, markdown, or comments before or after the JSON object. Your entire response must be the raw JSON.`;

const CONTENT_CREATOR_INSTRUCTION = `You are "Zen Content Strategist", an elite SEO and social media expert specialized in generating high-conversion content for web development services. Your goal is to create posts that not only engage but are optimized for maximum discoverability and lead generation.

**CRITICAL METHODOLOGY (Follow these 5 steps meticulously):**

1.  **DECONSTRUCT THE REQUEST:**
    *   **Service:** Analyze the provided service (e.g., "E-commerce Avanzado").
    *   **Target Audience:** Infer the target audience. For E-commerce, it's business owners wanting to scale. For a Portfolio, it's creative professionals. Tailor the language and pain points to this audience.
    *   **Platform & Tone:** Strictly adhere to the specified platform (LinkedIn = professional, formal; Instagram = visual, personal) and tone (Urgente, Inspirador, etc.).

2.  **STRATEGIC KEYWORD INTEGRATION:**
    *   Identify a **Primary Keyword** (e.g., "tienda online profesional").
    *   Identify 3-4 **Secondary/LSI Keywords** (e.g., "aumentar ventas online", "pasarela de pago segura", "experiencia de compra", "gestión de inventario").
    *   Weave these keywords **organically** throughout the copy. The post must read naturally, not like a list of keywords.

3.  **CRAFT THE PERSUASIVE NARRATIVE (AIDA Model):**
    *   **Attention (Hook):** Start with a provocative question or a startling statistic that targets a specific pain point of the audience. (e.g., "¿Tu carrito de compras abandona más clientes de los que convierte?").
    *   **Interest (Problem/Solution):** Briefly agitate the problem. Describe the negative business impact of not having this service. Then, introduce the service as the definitive solution.
    *   **Desire (Value Proposition & Benefits):** Do not list features. Translate features into tangible business outcomes. Instead of "Pasarela de Pagos", say "Convierte visitantes en clientes con un proceso de pago sin fricciones que inspira confianza y aumenta tus ingresos." Focus on ROI, time saved, and competitive advantage.
    *   **Action (Call to Action):** End with a powerful, low-friction CTA. If the user provides one, integrate it. If not, create a compelling one. Examples: "Comenta 'ECOMMERCE' y te envío un diagnóstico gratuito por DM." or "¿Listo para escalar? Agenda una llamada estratégica en el link de nuestra bio."

4.  **OPTIMIZE FOR ENGAGEMENT:**
    *   Use 1-2 relevant emojis to break up text and add personality.
    *   Use formatting (like bullet points or numbered lists where appropriate on platforms like LinkedIn) to improve readability.

5.  **MAXIMIZE REACH WITH HASHTAGS:**
    *   Generate a block of 7-10 strategic hashtags.
    *   **Mix:** Include 2-3 broad industry tags (#DesarrolloWeb, #MarketingDigital), 3-4 specific service tags (#Ecommerce, #TiendaOnline, #ShopifyDevs), and 1-2 community/niche tags (#PyMEs, #EmprendedoresDigitales).

**FINAL OUTPUT:** The entire response should be the generated post, ready to be copied and pasted.`;

const IMAGE_CREATOR_PROMPT_TEMPLATE = (style, concept, colors) => `Generate a high-quality, professional, and aesthetically pleasing image suitable for a social media campaign for a web development agency. The image must be visually striking and directly related to the provided concept.
- Style: ${style}
- Core Concept: ${concept}
- Color Palette: ${colors}
Do not include any text, logos, or watermarks in the image. The image should be clean and symbolic.`;


// --- PROMPT ENGINEERING HELPERS ---
function getSystemInstructionForMode(mode, context = {}) {
    switch (mode) {
        case 'analyze': return ANALYZE_INSTRUCTION;
        case 'objection': return OBJECTION_INSTRUCTION;
        case 'content-creator': return CONTENT_CREATOR_INSTRUCTION;
        case 'lead-gen-plan': return LEAD_GEN_PLAN_INSTRUCTION;
        case 'entrenamiento': {
            let catalogString = '';
            Object.values(pricingData.allServices).forEach(category => {
                catalogString += `\nCATEGORY: ${category.name}\n`;
                category.items.forEach(item => {
                    catalogString += `- Service: ${item.name}\n  - Description: ${item.description}\n  - Cost: $${item.price} USD\n`;
                    if(item.pointCost) catalogString += `  - Point Cost for Monthly Plans: ${item.pointCost}\n`;
                });
            });
            pricingData.monthlyPlans.forEach(plan => {
                 catalogString += `\nPLAN: ${plan.name}\n  - Description: ${plan.description}\n  - Monthly Cost: $${plan.price} USD\n  - Included Development Points: ${plan.points}\n`;
            });
            return ENTRENAMIENTO_INSTRUCTION_TEMPLATE(catalogString);
        }
        case 'builder':
        default:
            const serviceList = Object.values(pricingData.allServices).filter(cat => cat.name !== "H. Tareas a Medida (Sugeridas por IA)").flatMap(cat => cat.items).map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
            const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
            const customTaskList = (pricingData.allServices.customTasks?.items || []).map(s => `ID: ${s.id} | Name: ${s.name} (This is a bucket for custom tasks of ${s.id.split('-')[1] === 's' ? 'small' : s.id.split('-')[1] === 'm' ? 'medium' : 'large'} complexity. Assign this ID and provide a descriptive name.)`).join('\n');
            const contextText = (context.selectedServicesContext && context.selectedServicesContext.length > 0)
                ? `CONTEXT: The reseller has already selected: ${context.selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Avoid suggesting these items again and base your recommendations on complementing this selection.`
                : '';
            return BUILDER_INSTRUCTION_TEMPLATE(serviceList, planList, contextText, customTaskList);
    }
}

// --- INTELLIGENCE HELPERS ---
function createErrorJsonResponse(introduction, closing) {
    return JSON.stringify({
        introduction, services: [], closing,
        client_questions: ["¿Podrías reformular tu solicitud para ser más específico?"],
        sales_pitch: "El asistente no pudo generar una recomendación con la información actual."
    });
}


// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    if (!pricingData) return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Internal Server Error: Pricing configuration is not available.' }) };

    let body;
    try { body = JSON.parse(event.body); } 
    catch (e) { return { statusCode: 400, body: "Invalid JSON-formatted request body." }; }

    const { userMessage, history: historyFromClient, mode, context, apiKey } = body;
    if (!userMessage || !mode || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // --- IMAGE GENERATION LOGIC ---
        if (mode === 'image-creator') {
            const model = genAI.getGenerativeModel({ model: IMAGE_MODEL_NAME });
            const { style, concept, colors } = context;
            let finalConcept = concept;
            if (concept === 'general') {
                finalConcept = "A symbolic representation of digital innovation, business growth through technology, and professional web solutions.";
            } else {
                finalConcept = `A symbolic, visually appealing representation of the web service: "${concept}".`;
            }
            const prompt = IMAGE_CREATOR_PROMPT_TEMPLATE(style, finalConcept, colors);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const candidate = response.candidates?.[0];
            if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                const refusalText = response.text(); 
                if (refusalText) {
                    throw new Error(`La IA no generó una imagen. Razón: ${refusalText}`);
                }
                throw new Error("La IA no devolvió una imagen. Intenta con una combinación de opciones diferente.");
            }
            const imagePart = candidate.content.parts.find(p => p.inlineData && p.inlineData.data);
            if (!imagePart) {
                const textResponse = response.text();
                if (textResponse) {
                     throw new Error(`La IA respondió con texto en lugar de una imagen: "${textResponse}"`);
                }
                throw new Error("La respuesta de la IA no contiene datos de imagen válidos.");
            }
            return {
                statusCode: 200,
                body: JSON.stringify({ base64Image: imagePart.inlineData.data })
            };
        }
        
        // --- TEXT GENERATION LOGIC (ALL OTHER MODES) ---
        const model = genAI.getGenerativeModel(
            { model: TEXT_MODEL_NAME, systemInstruction: getSystemInstructionForMode(mode, context) },
        );
        
        const chat = model.startChat({
            history: historyFromClient || [],
            generationConfig: {
                ...((mode === 'builder' || mode === 'lead-gen-plan') && { responseMimeType: "application/json" })
            }
        });

        let finalUserMessage = userMessage;

        if (mode === 'content-creator') {
            const { service, cta, platform, tone } = context;
            finalUserMessage = `Service to promote: "${service}". Platform: ${platform}. Tone: ${tone}. Custom CTA: "${cta || 'None provided'}".`;
        } else if (mode === 'lead-gen-plan') {
            const { service, audience } = context;
            finalUserMessage = `Generate the plan. The service to promote is "[SERVICE TO PROMOTE]: ${service}". The target audience is "[TARGET AUDIENCE]: ${audience}".`;
        }
        
        const result = await chat.sendMessage(finalUserMessage);
        const response = await result.response;
        const responseText = response.text();

        if (!responseText) {
             throw new Error("Respuesta inválida de la API de IA. La estructura del objeto no es la esperada.");
        }
        
        const finalHistory = [...(historyFromClient || []), { role: 'user', parts: [{ text: userMessage }] }, { role: 'model', parts: [{ text: responseText }] }];

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responseText, history: finalHistory })
        };

    } catch (err) {
        console.error("Error in Netlify function handler:", err);
        const errorDetails = err.message || err.toString();
        let userFriendlyMessage = "un error inesperado ocurrió al comunicarme con el asistente.";
        const status = err.status || 500;

        if (errorDetails.includes('API_KEY_INVALID') || errorDetails.includes('API key not valid')) {
            userFriendlyMessage = "Error de Autenticación: La API Key proporcionada no es válida.";
        } else if (errorDetails.includes('billing account')) {
            userFriendlyMessage = "Error de Facturación: La API Key es válida, pero no está asociada a un proyecto con facturación activa.";
        } else if (status === 429 || errorDetails.includes('quota')) {
            userFriendlyMessage = "Límite de Cuota Excedido: Has alcanzado el límite de solicitudes. Por favor, espera un momento.";
        } else if (status >= 500) {
            userFriendlyMessage = "el servicio de IA está experimentando problemas temporales. Inténtalo de nuevo más tarde.";
        } else if (mode === 'image-creator' && errorDetails) {
            userFriendlyMessage = errorDetails;
        } else if (errorDetails.includes('Respuesta inválida')) {
            userFriendlyMessage = "la IA no devolvió una respuesta válida. Inténtalo de nuevo."
        }

        const finalMessage = `Hubo un problema con la IA. ${userFriendlyMessage}`;
        const errorBody = (mode === 'builder' || mode === 'lead-gen-plan')
            ? createErrorJsonResponse("Hubo un error de conexión con la IA.", `Detalles: ${userFriendlyMessage}`)
            : finalMessage;

        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: userFriendlyMessage, response: errorBody, history: historyFromClient })
        };
    }
};