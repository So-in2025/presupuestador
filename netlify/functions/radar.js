// /netlify/functions/radar.js
/**
 * Backend para Radar de Oportunidades v12 - CJS Compatibility Fix
 * Uses Gemini 2.5 Flash with `GoogleGenerativeAI` class to ensure compatibility
 * with Netlify's CommonJS environment, fixing the constructor error.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- GEMINI API HELPERS ---

const getRealBusinessesFromAI = async (businessType, location, apiKey) => {
    const ai = new GoogleGenerativeAI({apiKey: apiKey});
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Your task is to act as a data API. You will receive a business type and a location. You must find 3 to 4 real businesses matching these criteria. You MUST return ONLY a valid JSON object with a single key "businesses" which is an array of objects. Each object MUST have "name" and "address" keys. Example: {"businesses": [{"name": "Example Cafe", "address": "123 Main St, Anytown"}]}. Do not add any other text or explanations. Business Type: "${businessType}", Location: "${location}".`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = result.response;
        // The response is guaranteed to be JSON, so direct parsing is safe.
        return JSON.parse(response.text()).businesses;
    } catch (error) {
        console.error("Error fetching businesses from AI:", error);
        throw new Error("La IA no pudo encontrar negocios. Intenta ser más específico.");
    }
};

const getTechnicalAnalysisFromAI = async (businessName, businessAddress, filters, apiKey) => {
    const ai = new GoogleGenerativeAI({apiKey: apiKey});
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a "Technical Web Analyst" API. Analyze the business: "${businessName}" at "${businessAddress}". Perform a simulated but realistic analysis based on its likely web presence. You MUST return ONLY a valid JSON object with the following structure:
    {
      "performanceScore": <integer 0-100>,
      "seoScore": <integer 0-100>,
      "mobileScore": <integer 0-100>,
      "painPoints": { "slow": <boolean>, "mobile": <boolean>, "ssl": <boolean>, "seo": <boolean> },
      "techStack": "<string, e.g., 'WordPress, Elementor'>",
      "hasAnalytics": <boolean>,
      "hasPixel": <boolean>
    }
    The "painPoints" booleans should reflect common issues, influenced by the scores. If a score is low, its corresponding pain point should likely be true. You MUST respect the user's filter preferences: ${JSON.stringify(filters)}. If a filter is true, you MUST return the corresponding pain point as true.`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = result.response;
        return JSON.parse(response.text());
    } catch (error) {
        console.error(`Error analyzing ${businessName}:`, error);
        // Return a default error object to avoid crashing the whole process
        return {
            performanceScore: 30, seoScore: 30, mobileScore: 30,
            painPoints: { slow: true, mobile: true, ssl: true, seo: true },
            techStack: "Desconocido", hasAnalytics: false, hasPixel: false
        };
    }
};

// --- NETLIFY SERVERLESS FUNCTION HANDLER ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ message: "Cuerpo de solicitud JSON inválido." }) };
    }

    const { businessType, location, filters, apiKey } = body;
    if (!businessType || !location || !filters || !apiKey) {
        return { statusCode: 400, body: JSON.stringify({ message: "Faltan parámetros: businessType, location, filters, y apiKey son requeridos." }) };
    }

    try {
        const businesses = await getRealBusinessesFromAI(businessType, location, apiKey);
        if (!businesses || businesses.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ opportunities: [] }) };
        }

        const analysisPromises = businesses.map(business =>
            getTechnicalAnalysisFromAI(business.name, business.address, filters, apiKey)
        );

        const analyses = await Promise.all(analysisPromises);

        const opportunities = businesses.map((business, index) => {
            const analysis = analyses[index];
            const painScore = Object.values(analysis.painPoints).reduce((score, hasPain) => score + (hasPain ? 25 : 0), 0);
            return {
                id: `opp-${Date.now()}-${index}`,
                name: business.name,
                address: business.address,
                ...analysis,
                painScore: painScore
            };
        });

        const filteredOpportunities = opportunities.filter(opp => {
            return Object.entries(filters).every(([key, value]) => {
                return !value || (value && opp.painPoints[key]);
            });
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ opportunities: filteredOpportunities.sort((a,b) => b.painScore - a.painScore) })
        };

    } catch (err) {
        console.error("Error en la función Radar:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: err.message || "Ocurrió un error interno en el servidor." })
        };
    }
};