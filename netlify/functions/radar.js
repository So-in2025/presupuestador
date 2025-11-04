// /netlify/functions/radar.js
/**
 * Backend para Radar de Oportunidades v2.0 - Implementación Real (Simulada)
 * Esta función está ahora estructurada para reflejar un flujo de trabajo de producción
 * que llamaría a APIs externas. Devuelve un conjunto de datos más rico y realista.
 */

// --- DATOS SIMULADOS PARA GENERACIÓN DINÁMICA ---
const namePrefixes = ["Innovador", "Digital", "Global", "NextGen", "Pro", "Quantum", "Synergy", "Zenith"];
const nameSuffixes = ["Solutions", "Group", "Creative", "Tech", "Works", "Dynamics", "Labs", "Studio"];
const streetNames = ["Av. Principal", "Calle del Sol", "Plaza Mayor", "Paseo de la Luna", "Ruta 42", "Boulevard de los Sueños"];
const techStacks = [
    { name: 'WordPress', icon: 'wordpress' },
    { name: 'Shopify', icon: 'shopify' },
    { name: 'React', icon: 'react' },
    { name: 'Wix', icon: 'wix' },
    { name: 'HTML/CSS Básico', icon: 'html5' }
];

// --- FUNCIÓN PRINCIPAL DE LA API ---
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { businessType, location, filters } = JSON.parse(event.body);

        // ===================================================================
        // PASO 1: LLAMADA A GOOGLE PLACES API (SIMULADO)
        // En una implementación real, aquí se llamaría a Google Places para obtener
        // una lista de negocios con sus URLs de sitios web.
        // ===================================================================
        const numberOfResults = Math.floor(Math.random() * 4) + 5;
        const potentialLeads = Array.from({ length: numberOfResults }, (_, i) => {
            const prefix = namePrefixes[Math.floor(Math.random() * namePrefixes.length)];
            const suffix = nameSuffixes[Math.floor(Math.random() * nameSuffixes.length)];
            const useTypeInName = Math.random() > 0.5;
            const businessName = useTypeInName ? `${businessType} ${prefix} de ${location}` : `${prefix} ${businessType} ${suffix}`;
            return {
                id: Date.now() + i,
                name: businessName,
                address: `${streetNames[Math.floor(Math.random() * streetNames.length)]} ${Math.floor(Math.random() * 500) + 1}, ${location}`,
                website: `https://www.${businessName.toLowerCase().replace(/\s/g, '')}.com`,
            };
        });

        // Simular latencia de red para el análisis de cada sitio
        await new Promise(resolve => setTimeout(resolve, 2500));

        // ===================================================================
        // PASO 2: ANÁLISIS DE CADA SITIO (SIMULADO)
        // En producción, este bloque iteraría sobre `potentialLeads` y para cada uno:
        // 1. Llamaría a Google PageSpeed Insights API.
        // 2. Realizaría una verificación de SSL (fetch a https).
        // 3. Usaría una librería como Wappalyzer para detectar el stack.
        // ===================================================================
        const analyzedOpportunities = potentialLeads.map(lead => {
            // Simulación de datos de PageSpeed Insights y SSL
            const performanceScore = Math.floor(Math.random() * 70) + 30; // 30-100
            const mobileFriendly = Math.random() > 0.3; // 70% chance
            const hasSSL = Math.random() > 0.5; // 50% chance
            const seoScore = Math.floor(Math.random() * 60) + 40; // 40-100

            const painPoints = {
                slow: performanceScore < 50,
                mobile: !mobileFriendly,
                ssl: !hasSSL,
                seo: seoScore < 70,
            };

            // Algoritmo de puntuación de dolor mejorado
            let painScore = 0;
            if (painPoints.slow) painScore += (100 - performanceScore) / 2; // Más impacto si es más lento
            if (painPoints.mobile) painScore += 30;
            if (painPoints.ssl) painScore += 25;
            if (painPoints.seo) painScore += (90 - seoScore) / 3;
            
            painScore = Math.min(100, Math.round(painScore));
            if (painScore < 15) painScore = 15;

            return {
                ...lead,
                painScore,
                painPoints,
                // Datos enriquecidos (Fase 3 simulada)
                techStack: techStacks[Math.floor(Math.random() * techStacks.length)],
                hasAnalytics: Math.random() > 0.5,
                hasPixel: Math.random() > 0.7
            };
        });

        // Filtrar resultados basados en los checkboxes del frontend
        const filteredOpportunities = analyzedOpportunities.filter(opp => {
            return Object.keys(filters).every(key => {
                return !filters[key] || opp.painPoints[key];
            });
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ opportunities: filteredOpportunities })
        };

    } catch (err) {
        console.error("Error en la función radar:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: "Error interno del servidor al procesar la búsqueda." })
        };
    }
};