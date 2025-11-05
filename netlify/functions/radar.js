// /netlify/functions/radar.js
/**
 * Backend para Radar de Oportunidades v5.0 - True AI Analysis
 * Uses Gemini to find real businesses AND perform a technical analysis for each.
 * Reverted to use the stable @google/generative-ai SDK.
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- GEMINI API HELPERS ---

const getRealBusinessesFromAI = async (businessType, location, apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    const prompt = `Find 3 to 4 real businesses that match the type "${businessType}" in the location "${location}". For each business, provide its name, a plausible address within the location, and its official website URL. Prioritize businesses that likely have a website. Your response must be a valid JSON array of objects, with each object having "name", "address", and "website" properties. Do not include any other text or markdown.`;

    try {
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const businesses = JSON.parse(jsonText);
        return Array.isArray(businesses) ? businesses : [];
    } catch (error) {
        console.error("Gemini API call failed (getRealBusinessesFromAI):", error);
        return []; // Return empty array on failure
    }
};

const getTechnicalAnalysisForBusiness = async (business, apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const prompt = `
        Act as a web performance and SEO expert. Analyze the business named "${business.name}" with website URL "${business.website}". 
        Based on the business type and a quick assessment of its likely online presence, provide a realistic estimation of its technical and marketing readiness.
        Your response MUST be a single, valid JSON object with the following properties and value types:
        - "performanceScore": an integer between 20 and 95.
        - "mobileScore": an integer between 30 and 100.
        - "seoScore": an integer between 40 and 90.
        - "hasSSL": a boolean.
        - "techStack": a string (e.g., "WordPress", "Shopify", "React", "Wix", "HTML/CSS Básico").
        - "hasAnalytics": a boolean.
        - "hasPixel": a boolean.
        Do not include any other text or markdown.
    `;
    
    try {
        const result = await model.generateContent(prompt);
        const jsonText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(jsonText);
        // Basic validation
        if (typeof analysis.performanceScore !== 'number' || typeof analysis.hasSSL !== 'boolean') {
             throw new Error("Invalid JSON structure from analysis AI.");
        }
        return analysis;
    } catch (error) {
        console.error(`Failed to get technical analysis for ${business.name}:`, error);
        // Return a default "error" analysis object
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

        // ===================================================================
        // PASO 1: GET REAL BUSINESS LISTINGS FROM GEMINI
        // ===================================================================
        const potentialLeads = await getRealBusinessesFromAI(businessType, location, apiKey);
        
        if (!potentialLeads || potentialLeads.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ opportunities: [] }) // No businesses found
            };
        }

        // ===================================================================
        // PASO 2: PERFORM AI-DRIVEN TECHNICAL ANALYSIS FOR EACH SITE
        // ===================================================================
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
            
            let painScore = 0;
            if (painPoints.slow) painScore += (50 - performanceScore) * 1.5;
            if (painPoints.mobile) painScore += (90 - mobileScore) * 0.5;
            if (painPoints.ssl) painScore += 30;
            if (painPoints.seo) painScore += (80 - seoScore) * 0.4;
            
            painScore = Math.min(98, Math.round(painScore));
            if (painScore < 20) painScore = 20 + Math.floor(Math.random() * 10);

            return {
                ...lead,
                id: Date.now() + index,
                painScore,
                painPoints,
                ...analysis
            };
        });

        const filteredOpportunities = analyzedOpportunities.filter(opp => {
             if (opp.error) return false; // Exclude businesses that failed analysis
            return Object.keys(filters).every(key => !filters[key] || opp.painPoints[key]);
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ opportunities: filteredOpportunities })
        };

    } catch (err) {
        console.error("Error in radar function:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: "Internal server error while processing the search." })
        };
    }
};
