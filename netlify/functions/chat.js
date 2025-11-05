
// /netlify/functions/chat.js
/**
 * Backend para Asistente Zen - versión producción endurecida
 * - Mejor manejo de respuestas JSON generadas por la IA
 * - Sanitización de texto
 * - Fallbacks compatibles con frontend
 * - Logging avanzado y reintentos para forzar JSON en modos críticos
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const pricingData = require('./pricing.json');
const crypto = require('crypto');

// Helper: generate a short request id for logs
function genRequestId() {
    return crypto.randomBytes(6).toString('hex');
}

// Helper: sanitize text (remove BOM, normalize curly quotes)
function sanitizeTextForParsing(text) {
    if (!text || typeof text !== 'string') return text;
    // Remove BOM
    text = text.replace(/^\uFEFF/, '');
    // Replace curly quotes with straight quotes
    text = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    // Normalize non-breaking spaces
    text = text.replace(/\u00A0/g, ' ');
    // Trim
    return text.trim();
}

// Helper: try parse JSON safely
function tryParseJson(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (e) {
        return { ok: false, error: e };
    }
}

// Helper: attempt to extract ```json``` fenced block or first balanced {...} JSON object
function extractJsonStringFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const text = sanitizeTextForParsing(rawText);

    // 1) If whole text is valid JSON, return it
    const wholeTry = tryParseJson(text);
    if (wholeTry.ok) return JSON.stringify(wholeTry.value);

    // 2) Look for fenced ```json blocks (multiple possible)
    const fencedRegex = /```json\s*([\s\S]*?)\s*```/gi;
    let match;
    while ((match = fencedRegex.exec(text)) !== null) {
        const candidate = match[1].trim();
        const t = sanitizeTextForParsing(candidate);
        const parsed = tryParseJson(t);
        if (parsed.ok) return JSON.stringify(parsed.value);
    }

    // 3) Look for any triple-backtick block without json label
    const anyFencedRegex = /```([\s\S]*?)```/gi;
    while ((match = anyFencedRegex.exec(text)) !== null) {
        const candidate = match[1].trim();
        const t = sanitizeTextForParsing(candidate);
        const parsed = tryParseJson(t);
        if (parsed.ok) return JSON.stringify(parsed.value);
    }

    // 4) Fallback: find first '{' and attempt to find balanced JSON block (brace counting)
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;

    let i = firstBrace;
    let depth = 0;
    let inString = false;
    let stringChar = null;
    let escape = false;
    for (; i < text.length; i++) {
        const ch = text[i];

        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if ((ch === '"' || ch === "'")) {
            if (!inString) {
                inString = true;
                stringChar = ch;
            } else if (inString && ch === stringChar) {
                inString = false;
                stringChar = null;
            }
            continue;
        }
        if (inString) continue;

        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                const candidate = text.slice(firstBrace, i + 1);
                const cleaned = sanitizeTextForParsing(candidate);
                const parsed = tryParseJson(cleaned);
                if (parsed.ok) return JSON.stringify(parsed.value);
                // If fails, try to find next possible block recursively
                const nextStart = text.indexOf('{', firstBrace + 1);
                if (nextStart === -1) break;
                return extractJsonStringFromText(text.slice(nextStart));
            }
        }
    }

    return null;
}

// Create a standardized error JSON for modes expecting JSON so frontend can handle it gracefully
function builderErrorResponse(message) {
    return JSON.stringify({
        introduction: "Lo siento, hubo un error de conexión con el asistente.",
        services: [],
        closing: `Error: ${message}`,
        client_questions: ["¿Podrías reformular tu solicitud para ser más específico?"],
        sales_pitch: "El asistente no pudo generar una recomendación con la información actual."
    });
}

// Utility: sleep (ms)
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Attempt to call the model and enforce JSON for critical modes with retries
async function callModelWithJsonEnforcement(model, chatOptions, maxAttempts = 2, reqId = '') {
    const retryDelay = 600; // ms between retries
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptTag = `req=${reqId} attempt=${attempt}`;
        try {
            const result = await model.sendMessage(chatOptions.message);
            if (!result || !result.response || typeof result.response.text !== 'function') {
                console.warn(`${attemptTag} - Invalid response structure from model`, result);
                throw new Error('Invalid model response structure');
            }
            const raw = sanitizeTextForParsing(result.response.text());
            console.info(`${attemptTag} - Raw model output length=${raw.length}`);
            // If it's already valid JSON, return it
            const wholeTry = tryParseJson(raw);
            if (wholeTry.ok) {
                console.info(`${attemptTag} - Model returned valid JSON (whole)`);
                return { ok: true, text: JSON.stringify(wholeTry.value), raw };
            }
            // Try to extract JSON blocks
            const extracted = extractJsonStringFromText(raw);
            if (extracted) {
                const validated = tryParseJson(extracted);
                if (validated.ok) {
                    console.info(`${attemptTag} - Extracted valid JSON`);
                    return { ok: true, text: JSON.stringify(validated.value), raw };
                }
                console.warn(`${attemptTag} - Extracted JSON failed validation`, validated.error);
            } else {
                console.warn(`${attemptTag} - No JSON block found in response`);
            }
            // If we reach here, model didn't return usable JSON
            if (attempt < maxAttempts) {
                console.info(`${attemptTag} - Retrying after ${retryDelay}ms to enforce JSON`);
                // provide a short clarifying system message asking the model to return only JSON
                // Note: We intentionally do NOT include sensitive data in follow-ups
                await wait(retryDelay);
                // Re-send a stricter follow-up by appending to message with enforcement
                chatOptions.message = chatOptions.message + "\n\n[IMPORTANT] If your previous response included explanation or text, now return ONLY the JSON object requested, with no extra text, markdown or commentary. If you cannot comply, return an empty response.";
                continue;
            } else {
                // Final attempt failed
                return { ok: false, text: raw };
            }
        } catch (e) {
            console.error(`${attemptTag} - Error calling model:`, e);
            if (attempt < maxAttempts) {
                await wait(retryDelay);
                continue;
            }
            return { ok: false, error: e, text: '' };
        }
    }
    return { ok: false, text: '' };
}

// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    const requestId = genRequestId();
    const startTs = Date.now();
    console.info(`req=${requestId} - handler entry, method=${event.httpMethod} time=${new Date().toISOString()}`);

    if (event.httpMethod !== "POST") {
        console.warn(`req=${requestId} - method not allowed`);
        return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!pricingData) {
        console.error(`req=${requestId} - pricingData missing`);
        return { statusCode: 500, body: JSON.stringify({ error: true, message: 'Internal Server Error: Pricing configuration is not available.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        console.error(`req=${requestId} - invalid JSON body`, e);
        return { statusCode: 400, body: "Invalid JSON-formatted request body." };
    }

    const { userMessage, history: historyFromClient, mode, context, apiKey } = body;
    if (!userMessage || !mode || !apiKey) {
        console.warn(`req=${requestId} - incomplete request`);
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "Incomplete request." }) };
    }

    // Ensure apiKey is a string
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
        console.warn(`req=${requestId} - apiKey invalid`);
        return { statusCode: 400, body: JSON.stringify({ error: true, message: "API key missing or invalid." }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        let model;
        let generationConfig;
        let systemInstruction;
        let finalUserMessage = userMessage;

        // Default generation config
        generationConfig = {
            temperature: 0.2,
            topK: 1,
            topP: 1,
            maxOutputTokens: 2048,
        };

        // prepare lists used across modes (compact)
        const serviceList = Object.values(pricingData.allServices)
            .flatMap(cat => (cat.items || []).map(s => `ID: ${s.id} | Name: ${s.name}`)).join('\n');

        const planList = pricingData.monthlyPlans.map(p => `ID: ${p.id} | Name: ${p.name}`).join('\n');

        const customTaskList = (pricingData.allServices.customTasks?.items || [])
            .map(s => `ID: ${s.id} | Name: ${s.name} (Suggested bucket)`).join('\n');

        // Build systemInstruction + mode-specific tweaks
        switch (mode) {
            case 'builder': {
        model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const contextText = (context && context.selectedServicesContext && context.selectedServicesContext.length > 0)
            ? `CONTEXT: The reseller has already selected: ${context.selectedServicesContext.map(s => `"${s.name}"`).join(', ')}. Avoid suggesting these items again and base your recommendations on complementing this selection.`
            : '';
                systemInstruction = `
                    Act as a STRICT JSON API. Analyze the user's request for a web project and build the perfect solution using ONLY the provided catalog. You MUST proactively identify upsell and cross-sell opportunities. ${contextText}

                    --- AVAILABLE CATALOG ---
                    ${serviceList}
                    ${planList}
                    --- CUSTOM TASKS (Use these for requests not in the catalog) ---
                    ${customTaskList}

                    You MUST ALWAYS respond with ONE and ONLY ONE JSON object.
                    NO markdown, NO code blocks, NO explanations, NO greetings, NO commentary,
                    NO text before or after the JSON.

                    Your response MUST follow EXACTLY this structure:

                    {
                    "introduction": "",
                    "services": [],
                    "closing": "",
                    "client_questions": [],
                    "sales_pitch": ""
                    }

                    STRICT RULES:
                    1. ALWAYS include all fields exactly as shown.
                    2. NEVER remove, rename, reorder, or add fields.
                    3. "services" MUST be an array of objects: [{ "id": "string", "name": "string" }]
                    4. "client_questions" MUST be an array of strings.
                    5. All other fields MUST be strings.
                    6. If the user’s request is short or vague, you MUST infer missing details.
                    7. If information is missing, put questions ONLY inside "client_questions".
                    8. NEVER output markdown, triple backticks, emojis, comments, or text outside the JSON.

                    You MUST output ONLY the JSON object.
                    `;

                        break;
                    }
                default: {
                    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                    switch (mode) {
                        case 'analyze':
                            systemInstruction = `You are an expert business analyst. Your only task is to read the conversation provided by the reseller and extract a concise, clear list of 3 to 5 key requirements or needs of the end customer. Format your response as a bulleted list, using '-' for each point. Do not greet, do not say goodbye, just return the list.`;
                            break;
                        case 'objection':
                            systemInstruction = `You are Zen Coach, an expert sales coach. Your mission is to help the reseller overcome their clients' objections. Provide a structured, professional, and empathetic response, focusing on VALUE and BENEFITS, not technical features. Translate "cost" objections into conversations about "investment" and "return."`;
                            break;
                        case 'content-creator':
                            systemInstruction = `You are "Zen Content Strategist", an elite SEO and social media expert specialized in generating high-conversion content for web development services.`;
                            const { service: cc_service, cta, platform, tone } = (context || {});
                            finalUserMessage = `Service to promote: "${cc_service}". Platform: ${platform}. Tone: ${tone}. Custom CTA: "${cta || 'None provided'}".`;
                            break;
                        case 'image-prompt-creator':
                            systemInstruction = `You are a world-class Art Director and AI Prompt Engineer. Generate a single-paragraph Midjourney/DALL-E prompt in English for the given social media post.`;
                            const { postText } = (context || {});
                            finalUserMessage = `Generate the image prompt. The social media post to analyze is: "${postText || ''}"`;
                            break;
                        case 'lead-gen-plan':
                            systemInstruction = `You are a "Marketing & Sales Strategist" AI. Create a detailed, actionable 7-day plan as a single JSON object.`;
                            const { service: lgp_service, audience } = (context || {});
                            finalUserMessage = `Generate the plan. The service to promote is "${lgp_service || ''}". The target audience is "${audience || ''}".`;
                            break;
                        case 'outreach-generator':
                            systemInstruction = `You are a professional sales copywriter specializing in high-converting cold outreach for web development services.`;
                            const { businessName, painPointsDetails, marketingIntel } = (context || {});
                            finalUserMessage = `Generate the outreach email. Business name: "${businessName || ''}". Pain points: "${painPointsDetails || ''}". Marketing intel: "${marketingIntel || ''}".`;
                            break;
                        case 'entrenamiento':
                            // Build a compact catalog string for entrenamiento mode
                            let catalogString = '';
                            Object.values(pricingData.allServices).forEach(category => {
                                catalogString += `\nCATEGORY: ${category.name}\n`;
                                (category.items || []).forEach(item => {
                                    catalogString += `- Service: ${item.name}\n  - Description: ${item.description}\n  - Cost: $${item.price} USD\n`;
                                    if (item.pointCost) catalogString += `  - Point Cost for Monthly Plans: ${item.pointCost}\n`;
                                });
                            });
                            pricingData.monthlyPlans.forEach(plan => {
                                catalogString += `\nPLAN: ${plan.name}\n  - Description: ${plan.description}\n  - Monthly Cost: $${plan.price} USD\n  - Included Development Points: ${plan.points}\n`;
                            });
                            systemInstruction = `You are "SO->IN Product Expert", an specialized AI assistant. Your purpose is to train and empower affiliates by providing detailed, sales-oriented information about the services offered. Base your answers exclusively on the provided service catalog:

                            ${catalogString}
                            `;
                            break;
                        default:
                            systemInstruction = `You are a helpful assistant.`;
                    }
                }
            }

        // Build initial chat history for the model
        const chatHistory = [
            { role: "user", parts: [{ text: systemInstruction }] },
            { role: "model", parts: [{ text: "Understood. I will follow all directives and provide the response in the required format." }] },
            ...(historyFromClient || [])
        ];

        // Start chat
        const chat = model.startChat({
            generationConfig,
            history: chatHistory
        });

        // For modes that require strict JSON, use the enforcement helper
        let responseText = '';
        let responsePayload = '';

        if (mode === 'builder' || mode === 'lead-gen-plan') {
            // Prepare the message to send
            const messageToSend = finalUserMessage;
            console.info(`req=${requestId} - sending to model (mode=${mode}) - message length=${(messageToSend||'').length}`);

            // Use enforcement with 2 attempts
            const enforcementResult = await callModelWithJsonEnforcement(chat, { message: messageToSend }, 2, requestId);

            if (enforcementResult.ok) {
                responseText = enforcementResult.text;
                responsePayload = responseText;
            } else {
                console.warn(`req=${requestId} - enforcement failed; returning structured builder error. rawLength=${(enforcementResult.text||'').length}`);
                responsePayload = builderErrorResponse("la IA devolvió un JSON malformado o con contenido adicional.");
            }
        } else {
            // Non-strict modes: single call
            const result = await chat.sendMessage({ role: "user", parts: [{ text: finalUserMessage }] });
            if (!result || !result.response || typeof result.response.text !== 'function') {
                throw new Error("Respuesta inválida de la API de IA. La estructura del objeto no es la esperada.");
            }
            responseText = sanitizeTextForParsing(result.response.text());
            responsePayload = responseText;
        }

        // Prepare final history to return to frontend
        const finalHistoryForClient = [
            ...(historyFromClient || []),
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: [{ text: responsePayload }] }
        ];

        const durationMs = Date.now() - startTs;
        console.info(`req=${requestId} - handler success - mode=${mode} durationMs=${durationMs}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ response: responsePayload, history: finalHistoryForClient })
        };

    } catch (err) {
        const durationMs = Date.now() - startTs;
        console.error(`req=${requestId} - handler ERROR after ${durationMs}ms:`, err);
        const errorDetails = (err && err.message) ? err.message : String(err);
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
        } else if (errorDetails.includes('Respuesta inválida')) {
            userFriendlyMessage = "la IA no devolvió una respuesta válida. Inténtalo de nuevo.";
        } else if (errorDetails.includes('400 Bad Request') || errorDetails.includes('is not found for API version')) {
            userFriendlyMessage = "la solicitud fue mal formada. Revisa la configuración de la API.";
        } else if (errorDetails.includes('JSON malformado')) {
            userFriendlyMessage = "la IA devolvió una respuesta con un formato incorrecto que no se pudo procesar.";
        }

        const isBuilderLike = (body && (body.mode === 'builder' || body.mode === 'lead-gen-plan'));
        const errorBody = isBuilderLike
            ? builderErrorResponse(userFriendlyMessage)
            : `Hubo un problema con la IA. ${userFriendlyMessage}`;

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: true,
                message: userFriendlyMessage,
                response: errorBody,
                history: historyFromClient || []
            })
        };
    }
};
