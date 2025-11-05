// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen
 * Lógica de Intención: v76 - FULL RESTORE to original robust architecture
 * This version restores the original, monolithic structure that was stable.
 * All prompts are inline, it uses the correct 'gemini-2.5-flash' model,
 * and it re-implements the robust JSON parser for builder mode.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json');

// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    // --- START OF INLINE PROMPT TEMPLATES (Original Robust Structure) ---

    // This function encapsulates the complex builder prompt, as it was in the original version.
    const getBuilderPrompt = (userMessage, context) => {
        const serviceList = Object.values(pricingData.allServices).filter(cat => cat.name !== "H. Tareas a Medida (Sugeridas por IA)").flatMap(cat => cat.items).map(s => `ID: ${s.id} | Name: ${s.name}`).join('\n');
        const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');
        const customTaskList = (pricingData.allServices.customTasks?.items || []).map(s => `ID: ${s.id} | Name: ${s.name} (This is a bucket for custom tasks of ${s.id.split('-')[1] === 's' ? 'small' : s.id.split('-')[1] === 'm' ? 'medium' : 'large'} complexity. Assign this ID and provide a descriptive name.)`).join('\n');
        
        const contextText = (context.selectedServicesContext && context.selectedServicesContext.length > 0)
            ? `CONTEXTO ADICIONAL: El revendedor ya ha preseleccionado los siguientes servicios: ${context.selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. No sugieras estos ítems de nuevo y basa tus recomendaciones en complementar esta selección.`
            : '';

        // This is the main system instruction for the builder.
        const systemInstruction = `Eres un "Arquitecto de Soluciones" experto y un asistente de ventas de élite. Tu única misión es actuar como una API JSON. Analizarás la solicitud del revendedor para un proyecto web y construirás la solución perfecta utilizando EXCLUSIVAMENTE el catálogo de servicios proporcionado. Debes ser proactivo en la identificación de oportunidades de 'upsell' (sugerir un servicio de mayor valor) y 'cross-sell' (sugerir servicios complementarios).

**INSTRUCCIONES CRÍTICAS E INQUEBRANTABLES:**
1.  **FORMATO DE SALIDA:** Tu respuesta COMPLETA debe ser UN ÚNICO objeto JSON válido. NO incluyas texto, explicaciones, comentarios, ni ninguna envoltura de markdown como \`\`\`json. La respuesta debe comenzar con \`{\` y terminar con \`}\`.
2.  **ESTRUCTURA JSON:** El JSON debe adherirse estrictamente a la siguiente estructura:
    {
      "introduction": "Un saludo inicial y una breve confirmación de que has entendido la solicitud.",
      "services": [
        {
          "id": "ID_DEL_SERVICIO_DEL_CATALOGO",
          "name": "NOMBRE_EXACTO_DEL_SERVICIO",
          "priority": "PRIORIDAD",
          "is_new": false
        }
      ],
      "closing": "Un párrafo de cierre que refuerza el valor de la propuesta.",
      "client_questions": ["Una lista de 3 a 5 preguntas de seguimiento inteligentes para que el revendedor le haga a su cliente."],
      "sales_pitch": "Un breve párrafo de 'discurso de ventas' que el revendedor puede usar para presentar la solución."
    }
3.  **CAMPO 'priority':** DEBES usar una de estas tres cadenas de texto exactas: "essential", "recommended", u "optional".
4.  **MANEJO DE TAREAS A MEDIDA:** Si el usuario solicita una funcionalidad que NO está en el catálogo (ej: 'integración con Calendly', 'un sistema de foros'), DEBES:
    a. Estimar su complejidad (pequeña, mediana o grande).
    b. Asignar el ID correspondiente de 'TAREAS A MEDIDA' ('custom-s', 'custom-m', 'custom-l').
    c. Proporcionar un 'name' descriptivo para la tarea (ej: "Integración con Calendly").
    d. Incluir la propiedad \`"is_new": true\`.
5.  **NO INVENTES SERVICIOS:** Si no estás seguro de qué servicio asignar, es mejor no incluirlo. Usa solo los IDs del catálogo.

--- CATÁLOGO DE SERVICIOS DISPONIBLES (TU ÚNICA FUENTE DE VERDAD) ---
${serviceList}
${planList}
--- TAREAS A MEDIDA (ÚSALAS PARA SOLICITUDES NO CATALOGADAS) ---
${customTaskList}
--- FIN DEL CATÁLOGO ---`;

        const fullPromptForUser = `Analiza la siguiente solicitud de proyecto y genera la respuesta JSON: "${userMessage}". ${contextText}`;

        return { systemInstruction, fullPromptForUser };
    };

    const getTrainingPrompt = () => {
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
        return `You are "SO->IN Product Expert", a specialized AI assistant. Your sole purpose is to train and empower affiliates by providing detailed, sales-oriented information about the services offered. You MUST base your answers exclusively on the provided service catalog.

**Your Core Directives:**
1.  **Be an Expert:** When asked about a service, explain what it is, who it's for, and most importantly, what the key selling points (benefits) are.
2.  **Stay Focused:** Do NOT invent services or features. If a service is not in the catalog, state that clearly and professionally.
3.  **Think Like a Salesperson:** Frame your answers to help the affiliate sell. Instead of just listing features, explain the value they provide to the end client. For example, instead of "it has SEO," say "it helps the client get found on Google, attracting more customers."
4.  **Be Clear and Concise:** Provide answers in a structured way, using bullet points or short paragraphs for readability.

--- SO->IN SERVICE CATALOG (YOUR KNOWLEDGE BASE) ---
${catalogString}
--- END OF CATALOG ---

Now, answer the affiliate's question based on this information.`;
    };

    const getOtherModePrompt = (mode, context) => {
        switch (mode) {
            case 'analyze':
                return 'You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using \'-\' for each point. Do not greet, do not say goodbye, just return the list.';
            case 'objection':
                return 'You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients\' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."';
            case 'content-creator':
                const { service, cta, platform, tone } = context;
                return `You are "Zen Content Strategist", an elite SEO and social media expert specialized in generating high-conversion content for web development services. Your goal is to create posts that not only engage but are optimized for maximum discoverability and lead generation.

**CRITICAL METHODOLOGY (Follow these 5 steps meticulously):**

1.  **DECONSTRUCT THE REQUEST:**
    *   **Service:** Analyze the provided service ("${service}").
    *   **Target Audience:** Infer the target audience. For E-commerce, it's business owners wanting to scale. For a Portfolio, it's creative professionals. Tailor the language and pain points to this audience.
    *   **Platform & Tone:** Strictly adhere to the specified platform (${platform}) and tone (${tone}).

2.  **STRATEGIC KEYWORD INTEGRATION:**
    *   Identify a **Primary Keyword** (e.g., "tienda online profesional").
    *   Identify 3-4 **Secondary/LSI Keywords** (e.g., "aumentar ventas online", "pasarela de pago segura", "experiencia de compra", "gestión de inventario").
    *   Weave these keywords **organically** throughout the copy. The post must read naturally, not like a list of keywords.

3.  **CRAFT THE PERSUASIVE NARRATIVE (AIDA Model):**
    *   **Attention (Hook):** Start with a provocative question or a startling statistic that targets a specific pain point of the audience. (e.g., "¿Tu carrito de compras abandona más clientes de los que convierte?").
    *   **Interest (Problem/Solution):** Briefly agitate the problem. Describe the negative business impact of not having this service. Then, introduce the service as the definitive solution.
    *   **Desire (Value Proposition & Benefits):** Do not list features. Translate features into tangible business outcomes. Instead of "Pasarela de Pagos", say "Convierte visitantes en clientes con un proceso de pago sin fricciones que inspira confianza y aumenta tus ingresos." Focus on ROI, time saved, and competitive advantage.
    *   **Action (Call to Action):** End with a powerful, low-friction CTA. If the user provides one ("${cta || 'None provided'}"), integrate it. If not, create a compelling one.

4.  **OPTIMIZE FOR ENGAGEMENT & FORMATTING:**
    *   **Formatting Rules:** Do NOT use markdown like \`**\` for bolding. Use line breaks to create readable paragraphs. Strategically use 2-4 relevant emojis to enhance the message and visual appeal.

5.  **MAXIMIZE REACH WITH HASHTAGS:**
    *   Generate a block of 7-10 strategic hashtags.

**FINAL OUTPUT:** The entire response should be the generated post, ready to be copied and pasted. Do not add any greetings or explanations.`;
            case 'image-prompt-creator':
                 const { postText } = context;
                 return `You are a world-class Art Director and AI Prompt Engineer. Your mission is to transform a social media post's concept into a masterpiece-level, hyper-detailed prompt for an advanced image generation AI like Midjourney or DALL-E 3. You must be extremely specific and artistic.

**YOUR METHODOLOGY (Follow these steps rigorously):**

1.  **Deconstruct the Core Concept:** Read the social media post and identify the single most important subject or feeling.
2.  **Build the Scene (The "What"):** Define subject, action, and environment.
3.  **Define the Art Direction (The "How"):** Specify style, lighting, color palette, and composition.
4.  **Add "Magic Ingredients":** Include technical keywords like "8K," "UHD," "trending on Artstation."
5.  **Final Assembly:** Combine elements into a single paragraph in **English**. Your entire response MUST be **ONLY the prompt text**.

**Social Media Post Text to Analyze:**
---
${postText}
---`;
            case 'lead-gen-plan':
                const { service: leadGenService, audience } = context;
                return `You are a "Marketing & Sales Strategist" AI. Your one and only mission is to empower a web development affiliate/reseller to get their first high-quality client within 7 days. You will create a detailed, actionable 7-day plan.

**CONTEXT:**
- The affiliate will promote a specific service: ${leadGenService}
- Their ideal client is: ${audience}

**YOUR TASK:**
Create a step-by-step 7-day plan. For each day, provide a clear "Theme" and a list of 2-3 concrete, actionable "Tasks".

**OUTPUT FORMAT:**
Your response MUST be a single, valid JSON object. Do NOT include any text, comments, or markdown before or after the JSON.

**JSON STRUCTURE:**
{
  "title": "Plan de Captación de Clientes: Tu Hoja de Ruta de 7 Días",
  "introduction": "Este plan está diseñado para posicionarte como un experto y atraer a tu cliente ideal en una semana. La clave es la consistencia y aportar valor en cada paso.",
  "daily_plan": [
    { "day": 1, "theme": "...", "tasks": ["..."] },
    { "day": 2, "theme": "...", "tasks": ["..."] },
    { "day": 3, "theme": "...", "tasks": ["..."] },
    { "day": 4, "theme": "...", "tasks": ["..."] },
    { "day": 5, "theme": "...", "tasks": ["..."] },
    { "day": 6, "theme": "...", "tasks": ["..."] },
    { "day": 7, "theme": "...", "tasks": ["..."] }
  ],
  "next_steps": "Al final de esta semana, no solo tendrás más visibilidad, sino que habrás iniciado conversaciones valiosas. ¡Ahora, a ejecutar con disciplina!"
}`;

            default:
                return "You are a helpful assistant.";
        }
    };
    
    // --- END OF INLINE PROMPT TEMPLATES ---


    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    let body;
    try { body = JSON.parse(event.body); } 
    catch (e) { return { statusCode: 400, body: "Invalid JSON-formatted request body." }; }

    const { userMessage, history: historyFromClient, mode, context, apiKey } = body;
    if (!userMessage || !mode || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        let systemInstruction;
        let finalUserMessage = userMessage;
        
        if (mode === 'builder') {
            const builderPrompts = getBuilderPrompt(userMessage, context);
            systemInstruction = builderPrompts.systemInstruction;
            finalUserMessage = builderPrompts.fullPromptForUser;
        } else if (mode === 'entrenamiento') {
            systemInstruction = getTrainingPrompt();
        } else {
            // All other modes are handled here, using a single function.
            systemInstruction = getOtherModePrompt(mode, context);
        }

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemInstruction }] },
                { role: "model", parts: [{ text: "Understood. I will follow all directives and provide the response in the required format." }] },
                ...(historyFromClient || [])
            ]
        });

        const result = await chat.sendMessage(finalUserMessage);
        let responseText = result.response.text();
        let responsePayload;
        
        if (mode === 'builder' || mode === 'lead-gen-plan') {
            const jsonMatch = responseText.match(/{[\s\S]*}/); 
            if (jsonMatch) {
                const jsonString = jsonMatch[0];
                try {
                    JSON.parse(jsonString); 
                    responsePayload = jsonString; 
                } catch (e) {
                    console.error("AI response contained a JSON-like block that was invalid.", e, "Raw response:", responseText);
                    throw new Error("La IA devolvió un JSON malformado.");
                }
            } else {
                console.error(`AI response for ${mode} mode did not contain a JSON block. Raw response:`, responseText);
                throw new Error("La IA no devolvió una respuesta en el formato esperado (JSON).");
            }
        } else {
            responsePayload = responseText;
        }
        
        const finalHistoryForClient = [
            ...(historyFromClient || []),
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: responsePayload }] }
        ];

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responsePayload, history: finalHistoryForClient })
        };

    } catch (err) {
        console.error("Error in Netlify function handler:", err);
        const errorDetails = err.message || err.toString();
        
        let userFriendlyMessage = "un error inesperado ocurrió al comunicarme con el asistente.";
        if (err.message.includes("La IA devolvió un JSON malformado") || err.message.includes("formato esperado (JSON)")) {
             userFriendlyMessage = "El asistente devolvió una respuesta, pero no en el formato esperado.";
        } else if (errorDetails.includes('API_KEY_INVALID') || errorDetails.includes('API key not valid')) {
            userFriendlyMessage = "Error de Autenticación: La API Key proporcionada no es válida.";
        } else if (errorDetails.includes('billing account')) {
            userFriendlyMessage = "Error de Facturación: La API Key es válida, pero no está asociada a un proyecto con facturación activa.";
        } else {
            userFriendlyMessage = "el servicio de IA está experimentando problemas temporales. Inténtalo de nuevo más tarde.";
        }

        const errorBody = (mode === 'builder' || mode === 'lead-gen-plan')
            ? JSON.stringify({
                introduction: "Lo siento, hubo un error de conexión con el asistente.",
                services: [],
                closing: `Error: ${userFriendlyMessage}`,
                client_questions: [],
                sales_pitch: ""
            })
            : `Lo siento, hubo un error de conexión con el asistente. Error: ${userFriendlyMessage}`;

        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: userFriendlyMessage, response: errorBody, history: historyFromClient })
        };
    }
};
