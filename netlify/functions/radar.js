// /netlify/functions/radar.js
/**
 * Backend para Radar de Oportunidades v5.1 - Stricter Prompts
 * Uses Gemini to find real businesses AND perform a technical analysis for each.
 * Reverted to use the stable @google/generative-ai SDK.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- GEMINI API HELPERS ---

const getRealBusinessesFromAI = async (businessType, location, apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    const prompt = `Your task is to act as a data API. You will receive a business type and a location. You must find 3 to 4 real businesses matching these criteria. Your entire response MUST be a single, valid JSON array. Do not include any text, explanations, or markdown fences like \`\`\`json. The JSON array must contain objects, and each object must have exactly these three string properties: "name", "address", and "website".

Example of a perfect response for businessType="cafes" and location="Paris, France":
[
  {"name": "Café de Flore", "address": "172 Boulevard Saint-Germain, 75006 Paris, France", "website": "https://cafedeflore.fr/"},
  {"name": "Les Deux Magots", "address": "6 Place Saint-Germain des Prés, 75006 Paris, France", "website": "https://www.lesdeuxmagots.fr/"}
]

Now, process this request:
Business Type: "${businessType}"
Location: "${location}"`;

    try {
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const businesses = JSON.parse(jsonText);
        return Array.isArray(businesses) ? businesses : [];
    } catch (error) {
        console.error("Gemini API call failed (getRealBusinessesFromAI):", error.message);
        throw new Error(`La IA no pudo encontrar negocios. Razón: ${error.message}`);
    }
};

const getTechnicalAnalysisForBusiness = async (business, apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const prompt = `
    You are an expert web analysis API. You will receive a business name and website. Your task is to provide a realistic estimation of its technical and marketing readiness.
    Your entire response MUST be a single, valid JSON object. Do not add any text, explanations, or markdown fences like \`\`\`json.
    The JSON object must have exactly these properties and value types:
    - "performanceScore": an integer between 20 and 95.
    - "mobileScore": an integer between 30 and 100.
    - "seoScore": an integer between 40 and 90.
    - "hasSSL": a boolean (true or false).
    - "techStack": a string (e.g., "WordPress", "Shopify", "React", "Wix", "HTML/CSS Básico").
    - "hasAnalytics": a boolean (true or false).
    - "hasPixel": a boolean (true or false).

    Example of a perfect response:
    {
      "performanceScore": 45,
      "mobileScore": 92,
      "seoScore": 78,
      "hasSSL": true,
      "techStack": "WordPress",
      "hasAnalytics": true,
      "hasPixel": false
    }

    Now, analyze this business:
    Business Name: "${business.name}"
    Website URL: "${business.website}"`;
    
    try {
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonText);
        if (typeof analysis.performanceScore !== 'number' || typeof analysis.hasSSL !== 'boolean') {
             throw new Error("Invalid JSON structure from analysis AI.");
        }
        return analysis;
    } catch (error) {
        console.error(`Failed to get technical analysis for ${business.name}:`, error);
        return {
            performanceScore: 30, mobileScore: 40, seoScore: 50,
            hasSSL: false, techStack: "Unknown", hasAnalytics: false, hasPixel: false, error: true
        };
    }
};


// --- MAIN API HANDLER ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { businessType, location, filters, apiKey } = JSON.parse(event.body);
        if (!apiKey) {
             return { statusCode: 401, body: JSON.stringify({ error: true, message: "API Key is required." }) };
        }

        const potentialLeads = await getRealBusinessesFromAI(businessType, location, apiKey);
        
        if (!potentialLeads || potentialLeads.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ opportunities: [] }) };
        }

        const analysisPromises = potentialLeads.map(lead => getTechnicalAnalysisForBusiness(lead, apiKey));
        const technicalAnalyses = await Promise.all(analysisPromises);
        
        const analyzedOpportunities = potentialLeads.map((lead, index) => {
            const analysis = technicalAnalyses[index];
            const { performanceScore, mobileScore, seoScore, hasSSL } = analysis;

            const painPoints = {
                slow: performanceScore < 50,
                mobile: mobileScore < 90,
                ssl: !hasSSL,
                seo: seoScore < 80,
            };
            
            let painScore = [
                painPoints.slow ? (50 - performanceScore) * 1.5 : 0,
                painPoints.mobile ? (90 - mobileScore) * 0.5 : 0,
                painPoints.ssl ? 30 : 0,
                painPoints.seo ? (80 - seoScore) * 0.4 : 0
            ].reduce((a, b) => a + b, 0);
            
            painScore = Math.min(98, Math.round(painScore));
            if (painScore < 20) painScore = 20 + Math.floor(Math.random() * 10);

            return {
                ...lead, id: Date.now() + index, painScore, painPoints, ...analysis
            };
        });

        const filteredOpportunities = analyzedOpportunities.filter(opp => {
             if (opp.error) return false;
            return Object.keys(filters).every(key => !filters[key] || opp.painPoints[key]);
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ opportunities: filteredOpportunities })
        };

    } catch (err) {
        console.error("Error in radar function:", err.message || err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: `Ocurrió un error interno en el servidor. Revisa los logs de la función. Detalle: ${err.message}` })
        };
    }
};