// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices, setTieredBuilderActive, formatPrice, setExtraPointsPurchased, setExtraPointsCost, setUsdToArsRate, saveTasks } from './state.js';
import { updateSelectedItems, handleAddTask, resetForm } from './app.js';
import { rerenderAllPrices } from './ui.js';
import { updatePointSystemUI } from './points.js';
import { generateActionPlanPdf } from './pdf.js';

// --- HELPERS DE ANIMACIÓN DE MODALES ---
const openModal = (modalElement) => {
    if (!modalElement) return;
    modalElement.classList.remove('hidden');
    // Forzar un reflow del navegador para que la transición se active
    // eslint-disable-next-line
    modalElement.offsetHeight; 
    setTimeout(() => {
        modalElement.classList.remove('opacity-0');
    }, 10); // Un pequeño delay asegura que la transición se aplique
};

const closeModal = (modalElement) => {
    if (!modalElement) return;
    modalElement.classList.add('opacity-0');
    setTimeout(() => {
        modalElement.classList.add('hidden');
    }, 300); // Coincide con la duración de la transición en CSS
};


export function showNotification(type, title, message) {
    dom.notificationTitle.textContent = title;
    dom.notificationMessage.innerHTML = message;
    const header = dom.notificationModal.querySelector('.modal-header');
    header.className = 'modal-header p-4 rounded-t-xl text-white font-bold flex justify-between items-center';
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-cyan-600' };
    header.classList.add(colors[type] || 'bg-cyan-600');
    openModal(dom.notificationModal);
}

export function closeNotificationModal() { closeModal(dom.notificationModal); }

export function showCustomServiceModal() {
    if (document.querySelector('input[name="selectionGroup"]:checked, input[name="monthlyPlanSelection"]:checked')) {
        return showNotification('error', 'Error', 'No puedes añadir ítems personalizados cuando un paquete o plan está seleccionado.');
    }
    dom.customServiceNameInput.value = '';
    dom.customServicePriceInput.value = '';
    openModal(dom.customServiceModal);
}

export function closeCustomServiceModal() { closeModal(dom.customServiceModal); }

export function showPdfOptionsModal() {
    const { tasks } = getState();
    if (tasks.length === 0) {
        return showNotification('info', 'Vacío', 'No hay propuestas guardadas para exportar.');
    }
    
    // CRITICAL UX CHECK: Asegurarse de que la marca esté configurada primero.
    const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    if (!brandInfo.logo || !brandInfo.resellerInfo || !brandInfo.terms) {
        showNotification(
            'error', 
            'Configuración Requerida', 
            'Por favor, configura tu marca (logo, datos y términos) en "⚙️ Configuración de Marca" antes de generar documentos.'
        );
        showBrandingModal(); // Guía al usuario directamente a la solución.
        return;
    }

    document.querySelectorAll('#pdfOptionsModal button[id^="generate-"]').forEach(btn => btn.disabled = false);
    
    openModal(dom.pdfOptionsModal);
}

export function closePdfOptionsModal() { closeModal(dom.pdfOptionsModal); }

export function addCustomServiceToSelection() {
    const name = dom.customServiceNameInput.value;
    const price = parseFloat(dom.customServicePriceInput.value);
    if (!name || isNaN(price) || price <= 0) {
        return showNotification('error', 'Datos incompletos', 'Por favor, introduce un nombre y un costo válido.');
    }
    const { customServices } = getState();
    const newCustomServices = [...customServices, { id: `custom-${Date.now()}`, name, price, type: 'custom', description: 'Servicio personalizado.' }];
    setCustomServices(newCustomServices);
    updateSelectedItems();
    closeCustomServiceModal();
}

export function removeCustomService(id) {
    const { customServices } = getState();
    const newCustomServices = customServices.filter(s => s.id !== id);
    setCustomServices(newCustomServices);
    updateSelectedItems();
}

export function showBrandingModal() {
    const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    document.getElementById('brandColorInput').value = brandInfo.color || '#22D3EE';
    document.getElementById('brandResellerInfo').value = brandInfo.resellerInfo || '';
    document.getElementById('brandTerms').value = brandInfo.terms || '';
    openModal(document.getElementById('brandingModal'));
}

export function closeBrandingModal() { closeModal(document.getElementById('brandingModal')); }

export function showTieredBuilderModal(taskToEdit = null) {
    const { allServices } = getState();
    const container = document.getElementById('tiered-builder-columns');
    container.innerHTML = '';

    const standardServices = Object.values(allServices)
        .filter(cat => !cat.isExclusive)
        .flatMap(cat => cat.items);

    const tiers = taskToEdit ? taskToEdit.tiers : [
        { name: 'Básico', services: [] },
        { name: 'Recomendado', services: [] },
        { name: 'Completo', services: [] },
    ];

    tiers.forEach((tier, index) => {
        const column = document.createElement('div');
        column.className = 'border border-slate-700 rounded-lg p-4 bg-slate-800/50 flex flex-col';
        column.innerHTML = `
            <input type="text" value="${tier.name}" class="styled-input text-lg font-bold text-center mb-4 accent-color" placeholder="Nombre del Nivel ${index + 1}">
            <div class="space-y-2 overflow-y-auto flex-grow pr-2">
                ${standardServices.map(svc => {
                    const isChecked = tier.services.some(s => s.id === svc.id);
                    return `
                        <div class="flex items-center justify-between p-2 bg-slate-800 rounded-md">
                            <label for="tier-${index}-svc-${svc.id}" class="text-sm text-slate-300 cursor-pointer">${svc.name}</label>
                            <input type="checkbox" id="tier-${index}-svc-${svc.id}" 
                                   class="custom-checkbox" 
                                   data-service-id="${svc.id}" 
                                   data-price="${svc.price}"
                                   data-name="${svc.name}"
                                   ${isChecked ? 'checked' : ''}>
                        </div>`;
                }).join('')}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-700 text-right">
                <p class="text-lg font-bold text-white">Costo: <span class="tier-total-cost">${formatPrice(0)}</span></p>
            </div>
        `;
        container.appendChild(column);
    });

    setTieredBuilderActive(true);
    updateTieredTotals();
    container.addEventListener('change', updateTieredTotals);
    openModal(document.getElementById('tieredBuilderModal'));
}

function updateTieredTotals() {
    const columns = document.querySelectorAll('#tiered-builder-columns > div');
    columns.forEach(column => {
        let total = 0;
        column.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            total += parseFloat(cb.dataset.price);
        });
        column.querySelector('.tier-total-cost').innerHTML = formatPrice(total);
    });
}

export function closeTieredBuilderModal() {
    setTieredBuilderActive(false);
    closeModal(document.getElementById('tieredBuilderModal'));
    document.getElementById('tiered-builder-columns').removeEventListener('change', updateTieredTotals);
}

export function addTieredProposal() {
    const columns = document.querySelectorAll('#tiered-builder-columns > div');
    const tiers = [];
    columns.forEach(column => {
        const name = column.querySelector('input[type="text"]').value || 'Nivel sin nombre';
        const services = [];
        let totalDev = 0;
        column.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const price = parseFloat(cb.dataset.price);
            services.push({
                id: cb.dataset.serviceId,
                name: cb.dataset.name,
                price: price,
            });
            totalDev += price;
        });
        tiers.push({ name, services, totalDev });
    });

    if (tiers.every(t => t.services.length === 0)) {
        return showNotification('error', 'Error', 'Debes seleccionar al menos un servicio en uno de los niveles.');
    }
    
    const taskData = {
        clientName: document.getElementById('clientName').value || 'Sin Cliente',
        webName: document.getElementById('webName').value || 'Propuesta por Niveles',
        margin: parseFloat(dom.marginPercentageInput.value) / 100 || 0,
        isTiered: true,
        tiers: tiers,
        type: 'puntual'
    };
    
    handleAddTask(taskData);
    closeTieredBuilderModal();
}

export function showExtraPointsModal() {
    document.getElementById('extraPointsAmount').value = '';
    document.getElementById('extraPointsCostFeedback').textContent = '';
    openModal(document.getElementById('extraPointsModal'));
}

export function closeExtraPointsModal() {
    closeModal(document.getElementById('extraPointsModal'));
}

export function addExtraPoints() {
    const amountInput = document.getElementById('extraPointsAmount');
    const amount = parseInt(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        return showNotification('error', 'Cantidad Inválida', 'Por favor, introduce un número de puntos válido.');
    }
    const { pointPrice, extraPointsPurchased } = getState();
    const newTotalPoints = extraPointsPurchased + amount;
    const newTotalCost = newTotalPoints * pointPrice;

    setExtraPointsPurchased(newTotalPoints);
    setExtraPointsCost(newTotalCost);
    
    updatePointSystemUI();
    updateSelectedItems();
    closeExtraPointsModal();
    showNotification('success', 'Puntos Añadidos', `${amount} puntos extra han sido añadidos al presupuesto del plan.`);
}

document.getElementById('extraPointsAmount')?.addEventListener('input', (e) => {
    const amount = parseInt(e.target.value) || 0;
    const { pointPrice } = getState();
    const cost = amount * pointPrice;
    document.getElementById('extraPointsCostFeedback').textContent = amount > 0 ? `Costo Adicional: ${formatPrice(cost)}` : '';
});


// --- TIPO DE CAMBIO MANUAL MODAL ---
export function showExchangeRateModal() {
    const { usdToArsRate } = getState();
    const input = document.getElementById('exchangeRateInput');
    if (usdToArsRate) {
        input.value = usdToArsRate;
    } else {
        input.value = '';
    }
    openModal(document.getElementById('exchangeRateModal'));
    input.focus();
}

export function closeExchangeRateModal() {
    closeModal(document.getElementById('exchangeRateModal'));
}

export function handleSaveExchangeRate() {
    const input = document.getElementById('exchangeRateInput');
    const rate = parseFloat(input.value);

    if (isNaN(rate) || rate <= 0) {
        showNotification('error', 'Valor Inválido', 'Por favor, introduce un número positivo para el tipo de cambio.');
        return;
    }

    setUsdToArsRate(rate);
    localStorage.setItem('zenUsdToArsRate', rate.toString());
    
    document.getElementById('currency-toggle-btn').disabled = false;
    
    rerenderAllPrices();
    closeExchangeRateModal();
    showNotification('success', 'Tipo de Cambio Guardado', `La cotización 1 USD = ${rate} ARS ha sido guardada.`);
}


// --- ESTUDIO DE CONTENIDO ---
let isGenerating = false;

function populateServiceDropdowns(selectElementId) {
    const { allServices } = getState();
    const serviceList = Object.values(allServices).flatMap(cat => cat.items);
    const select = document.getElementById(selectElementId);
    if (!select) return;

    const selectedValue = select.value;
    select.innerHTML = '';
    
    const generalOption = `<option value="general">Promoción General</option>`;
    select.insertAdjacentHTML('beforeend', generalOption);

    serviceList.forEach(service => {
        if (service.price > 0) { // No incluir "A cotizar"
             const option = `<option value="${service.name}">${service.name}</option>`;
             select.insertAdjacentHTML('beforeend', option);
        }
    });
    
    select.value = selectedValue || 'general';
}

export function showContentStudioModal() {
    const modal = document.getElementById('contentStudioModal');
    if (!modal) return;
    
    populateServiceDropdowns('text-service-to-promote');
    
    // Ocultar resultados anteriores al abrir
    document.getElementById('text-result-container').classList.add('hidden');
    document.getElementById('image-prompt-section').classList.add('hidden');

    openModal(modal);

    if (!modal.dataset.listenersAttached) {
        document.getElementById('generate-text-btn').addEventListener('click', handleGenerateText);
        document.getElementById('copy-generated-text-btn').addEventListener('click', handleCopyText);
        document.getElementById('generate-image-prompt-btn').addEventListener('click', handleGenerateImagePrompt);
        document.getElementById('copy-generated-image-prompt-btn').addEventListener('click', handleCopyImagePrompt);
        modal.dataset.listenersAttached = 'true';
    }
}

export function closeContentStudioModal() {
    closeModal(document.getElementById('contentStudioModal'));
}

async function handleGenerateText() {
    if (isGenerating) return;
    isGenerating = true;

    const resultContainer = document.getElementById('text-result-container');
    const spinner = document.getElementById('text-spinner');
    const copyBtn = document.getElementById('copy-generated-text-btn');
    const generatedTextP = document.getElementById('generated-text');
    const imagePromptSection = document.getElementById('image-prompt-section');
    
    resultContainer.classList.remove('hidden');
    imagePromptSection.classList.add('hidden'); // Ocultar prompt de imagen al generar nuevo texto
    spinner.classList.remove('hidden');
    generatedTextP.textContent = '';
    copyBtn.classList.add('hidden');

    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key antes de usar el estudio de contenido.');
        isGenerating = false;
        spinner.classList.add('hidden');
        return;
    }
    
    const service = document.getElementById('text-service-to-promote').value;
    const cta = document.getElementById('text-cta').value;
    const platform = document.getElementById('text-platform').value;
    const tone = document.getElementById('text-tone').value;

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: "Generate social media text based on context.",
                mode: 'content-creator',
                context: { service, cta, platform, tone },
                apiKey
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error del servidor al generar texto.');
        }

        const data = await response.json();
        generatedTextP.textContent = data.response;
        copyBtn.textContent = 'Copiar';
        copyBtn.classList.remove('hidden');
        imagePromptSection.classList.remove('hidden'); // Mostrar el botón para generar prompt

    } catch (error) {
        generatedTextP.textContent = `Error: ${error.message}`;
        console.error("Error al generar texto:", error);
    } finally {
        isGenerating = false;
        spinner.classList.add('hidden');
    }
}

async function handleGenerateImagePrompt() {
    if (isGenerating) return;
    isGenerating = true;

    const resultContainer = document.getElementById('image-prompt-result-container');
    const spinner = document.getElementById('image-prompt-spinner');
    const copyBtn = document.getElementById('copy-generated-image-prompt-btn');
    const generatedPromptP = document.getElementById('generated-image-prompt');
    
    resultContainer.classList.remove('hidden');
    spinner.classList.remove('hidden');
    generatedPromptP.textContent = '';
    copyBtn.classList.add('hidden');

    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key.');
        isGenerating = false;
        spinner.classList.add('hidden');
        return;
    }
    
    const postText = document.getElementById('generated-text').textContent;
    if (!postText) {
        showNotification('info', 'Texto Requerido', 'Primero debes generar un texto para crear un prompt de imagen relevante.');
        isGenerating = false;
        spinner.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: "Generate an image prompt based on the provided text.",
                mode: 'image-prompt-creator',
                context: { postText },
                apiKey
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error del servidor al generar el prompt.');
        }

        const data = await response.json();
        generatedPromptP.textContent = data.response;
        copyBtn.textContent = 'Copiar Prompt';
        copyBtn.classList.remove('hidden');

    } catch (error) {
        generatedPromptP.textContent = `Error: ${error.message}`;
        console.error("Error al generar prompt de imagen:", error);
    } finally {
        isGenerating = false;
        spinner.classList.add('hidden');
    }
}

function handleCopyText() {
    const text = document.getElementById('generated-text').textContent;
    const button = document.getElementById('copy-generated-text-btn');
    navigator.clipboard.writeText(text).then(() => {
        button.textContent = '¡Copiado!';
    });
}

function handleCopyImagePrompt() {
    const text = document.getElementById('generated-image-prompt').textContent;
    const button = document.getElementById('copy-generated-image-prompt-btn');
    navigator.clipboard.writeText(text).then(() => {
        button.textContent = '¡Copiado!';
    });
}


// --- NUEVO: PLAN DE CAPTACIÓN DE CLIENTES ---
export function showLeadGenPlanModal() {
    const modal = document.getElementById('leadGenPlanModal');
    if (!modal) return;
    
    populateServiceDropdowns('lead-gen-plan-service-select');
    document.getElementById('lead-gen-plan-audience').value = '';
    
    openModal(modal);

    if (!modal.dataset.listenersAttached) {
        document.getElementById('close-lead-gen-plan-modal-btn').addEventListener('click', closeLeadGenPlanModal);
        document.getElementById('generate-lead-gen-plan-pdf-btn').addEventListener('click', handleGenerateLeadGenPlan);
        modal.dataset.listenersAttached = 'true';
    }
}

export function closeLeadGenPlanModal() {
    closeModal(document.getElementById('leadGenPlanModal'));
}

async function handleGenerateLeadGenPlan() {
    const button = document.getElementById('generate-lead-gen-plan-pdf-btn');
    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    const originalText = btnText.textContent;
    
    if (isGenerating) return;
    isGenerating = true;
    
    spinner.classList.remove('hidden');
    btnText.textContent = 'Generando...';
    button.disabled = true;

    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key antes de usar esta función.');
        isGenerating = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
        return;
    }

    const service = document.getElementById('lead-gen-plan-service-select').value;
    const audience = document.getElementById('lead-gen-plan-audience').value;

    if (!audience) {
        showNotification('error', 'Público Requerido', 'Por favor, describe a tu público objetivo para crear un plan relevante.');
        isGenerating = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: 'Generate lead gen plan.',
                mode: 'lead-gen-plan',
                context: { service, audience },
                apiKey
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error del servidor al generar el plan.');
        }

        const data = await response.json();
        const planData = JSON.parse(data.response);
        
        await generateActionPlanPdf(planData);

    } catch (error) {
        showNotification('error', 'Error de Generación', `No se pudo generar el plan: ${error.message}`);
        console.error("Error al generar plan de captación:", error);
    } finally {
        isGenerating = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
        closeLeadGenPlanModal();
    }
}

// --- NUEVO: CANALES DE VENTA ---
export function showSalesChannelsModal() {
    const modal = document.getElementById('salesChannelsModal');
    if (modal) {
        openModal(modal);
    }
}

export function closeSalesChannelsModal() {
    const modal = document.getElementById('salesChannelsModal');
    if (modal) {
        closeModal(modal);
    }
}

// --- NUEVO: RADAR DE OPORTUNIDADES ---
let isScanning = false;
let currentOpportunities = [];

function getSelectedPainPointFilters() {
    const filters = {};
    document.querySelectorAll('#opportunityRadarModal input[type="checkbox"][data-filter]').forEach(cb => {
        filters[cb.dataset.filter] = cb.checked;
    });
    return filters;
}

async function handleStartScan() {
    if (isScanning) return;
    isScanning = true;

    const button = document.getElementById('radar-start-scan-btn');
    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    const originalText = btnText.textContent;
    
    spinner.classList.remove('hidden');
    btnText.textContent = 'Escaneando...';
    button.disabled = true;

    const resultsContainer = document.getElementById('radar-results');
    resultsContainer.innerHTML = '<p class="text-center text-slate-400">Buscando clientes potenciales...</p>';
    
    const dossierView = document.getElementById('radar-dossier-view');
    dossierView.innerHTML = `
        <div class="lg:col-span-2 card-bg bg-slate-900/50 p-6 rounded-lg flex flex-col items-center justify-center text-center">
            <svg class="spinner h-12 w-12 text-orange-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <h4 class="text-xl font-bold text-slate-300">Analizando la Web...</h4>
            <p class="text-slate-400 mt-1">Esto puede tardar un momento mientras la IA evalúa cada sitio.</p>
        </div>`;


    const businessType = document.getElementById('radar-business-type').value;
    const location = document.getElementById('radar-location').value;
    const filters = getSelectedPainPointFilters();
    const apiKey = getState().sessionApiKey;

    if (!businessType || !location) {
        showNotification('error', 'Datos Requeridos', 'Por favor, especifica el tipo de negocio y la ubicación.');
        isScanning = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
        resultsContainer.innerHTML = '';
        dossierView.innerHTML = `
            <div class="lg:col-span-2 card-bg bg-slate-900/50 p-6 rounded-lg flex flex-col items-center justify-center text-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
                </svg>
                <h4 class="text-xl font-bold text-slate-300">Selecciona una Oportunidad</h4>
                <p class="text-slate-400 mt-1">Elige un resultado del escaneo para ver el dossier de inteligencia y el asistente de contacto.</p>
            </div>`;
        return;
    }
    
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key para usar el Radar de Oportunidades.');
        isScanning = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/radar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessType, location, filters, apiKey })
        });
        
        if (!response.ok) {
            throw new Error(`El servidor respondió con un error: ${response.status}`);
        }

        const data = await response.json();
        currentOpportunities = data.opportunities;
        renderRadarResults(currentOpportunities);

        dossierView.innerHTML = `
            <div class="lg:col-span-2 card-bg bg-slate-900/50 p-6 rounded-lg flex flex-col items-center justify-center text-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
                </svg>
                <h4 class="text-xl font-bold text-slate-300">Selecciona una Oportunidad</h4>
                <p class="text-slate-400 mt-1">Elige un resultado del escaneo para ver el dossier de inteligencia y el asistente de contacto.</p>
            </div>`;

    } catch (error) {
        showNotification('error', 'Error de Escaneo', `No se pudo completar el escaneo: ${error.message}`);
        resultsContainer.innerHTML = `<p class="text-center text-red-400">Error al escanear. Inténtalo de nuevo.</p>`;
    } finally {
        isScanning = false;
        spinner.classList.add('hidden');
        btnText.textContent = originalText;
        button.disabled = false;
    }
}


function renderRadarResults(opportunities) {
    const resultsContainer = document.getElementById('radar-results');
    if (!opportunities || opportunities.length === 0) {
        resultsContainer.innerHTML = '<p class="text-center text-slate-400">No se encontraron oportunidades con esos criterios.</p>';
        return;
    }
    
    resultsContainer.innerHTML = opportunities.map(opp => {
        const painTags = Object.entries(opp.painPoints)
            .filter(([, value]) => value)
            .map(([key]) => {
                const tagMap = { slow: 'LENTO', mobile: 'NO MÓVIL', ssl: 'INSEGURO', seo: 'SEO POBRE' };
                return `<span class="text-xs font-bold bg-red-800 text-red-200 px-2 py-0.5 rounded-full">${tagMap[key]}</span>`;
            }).join(' ');

        return `
            <div class="card-bg p-3 rounded-lg border border-slate-700 hover:border-orange-500 cursor-pointer transition" data-action="view-dossier" data-id="${opp.id}">
                <h5 class="font-bold text-white">${opp.name}</h5>
                <p class="text-xs text-slate-400 mb-2">${opp.address}</p>
                <div class="w-full bg-slate-700 rounded-full h-2.5">
                    <div class="radar-pain-score-bar h-2.5 rounded-full" style="width: ${opp.painScore}%"></div>
                </div>
                <div class="flex flex-wrap gap-1 mt-2">${painTags}</div>
            </div>`;
    }).join('');
}

function getTechStackIcon(techName) {
    const icons = {
        'WordPress': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.94 13.94c-.36.36-1.02.5-1.59.5-1.12 0-2.34-.69-2.34-2.22v-3.33h-1.67v3.33c0 1.95 1.58 2.92 3.22 2.92.79 0 1.49-.22 2.03-.69l.35-.35v-1.16zm-5.06-4.59c.72 0 1.25-.56 1.25-1.22 0-.69-.53-1.25-1.25-1.25s-1.25.56-1.25 1.25c0 .66.53 1.22 1.25 1.22zm-3.69 4.59c-.36.36-1.02.5-1.59.5-1.12 0-2.34-.69-2.34-2.22v-3.33H5v3.33c0 1.95 1.58 2.92 3.22 2.92.79 0 1.49-.22 2.03-.69l.35-.35v-1.16z"/></svg>`,
        'Shopify': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.88 7.28c-.4-.25-.92-.25-1.32 0L12 10.59l-5.56-3.3c-.4-.25-.92-.25-1.32 0-.4.25-.63.73-.63 1.22v6.25c0 .49.23.97.63 1.22.2.13.43.19.66.19s.46-.06.66-.19L12 13.41l5.56 3.3c.2.13.43.19.66.19s.46-.06.66-.19c.4-.25.63-.73.63-1.22V8.5c0-.49-.23-.97-.63-1.22zM12 12.16L6.84 9.11 12 5.84l5.16 3.27L12 12.16z"/></svg>`,
        'React': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2.88-5.33l-1.76-1.02c-.17-.1-.28-.29-.28-.5v-2.1c0-.35.37-.58.68-.43l1.8.78c.2.09.32.29.32.51v1.76zm6.06-2.58l-1.8-.78c-.31-.14-.68.08-.68.43v2.1c0 .21.11.4.28.5l1.76 1.02c.31.18.68-.05.68-.4V9.41c0-.36-.37-.6-.68-.42zm-2.9-4.13c-.31.18-.68-.05-.68-.4v-1.76l-1.76-1.02c-.17-.1-.28-.29-.28-.5V3.7c0-.35.37-.58.68-.43l1.8.78c.2.09.32.29.32.51v2.11z"/></svg>`,
        'Wix': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 2h-15C3.12 2 2 3.12 2 4.5v15C2 20.88 3.12 22 4.5 22h15c1.38 0 2.5-1.12 2.5-2.5v-15C22 3.12 20.88 2 19.5 2zm-12.2 14.65l1.35-4.1-1.35-4.1h2.25l.55 2.15.5-2.15h2.2l.5 2.15.55-2.15h2.2l-1.35 4.1 1.35 4.1h-2.25l-.55-2.15-.5 2.15h-2.2l-.5-2.15-.55 2.15H7.3z"/></svg>`,
        'HTML/CSS Básico': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9v-2h2v2zm0-4H9V6h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V6h2v2z"/></svg>`
    };
    return icons[techName] || icons['HTML/CSS Básico'];
}

function renderDossierView(opportunity) {
    const dossierView = document.getElementById('radar-dossier-view');
    const { performanceScore, seoScore, mobileScore, painPoints, techStack, hasAnalytics, hasPixel } = opportunity;
    
    const { tasks } = getState();
    const isInPipeline = tasks.some(task => task.isProspect && task.radarData && task.radarData.id === opportunity.id);

    const getScoreClass = (score) => {
        if (score < 50) return 'score-red';
        if (score < 90) return 'score-yellow';
        return 'score-green';
    };

    const actionButtonsHTML = `
        <div class="flex-shrink-0 pt-4 mt-auto w-full space-y-2">
            <button class="w-full bg-slate-600 text-white font-bold py-2 rounded-lg transition btn-press-feedback ${isInPipeline ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-500'}" 
                    data-action="add-prospect" data-id="${opportunity.id}" ${isInPipeline ? 'disabled' : ''}>
                ${isInPipeline ? 'En Pipeline ✔️' : 'Añadir al Pipeline'}
            </button>
            <button class="w-full accent-bg font-bold py-2 rounded-lg transition btn-press-feedback" 
                    data-action="create-proposal-from-radar" data-id="${opportunity.id}">
                Crear Propuesta con IA
            </button>
        </div>`;

    dossierView.innerHTML = `
        <div class="w-full h-full flex flex-col">
            <h4 class="text-xl font-bold text-orange-400 mb-1">${opportunity.name}</h4>
            <p class="text-xs text-slate-400 mb-4">${opportunity.address}</p>
            
            <div class="flex-grow space-y-4 overflow-y-auto p-1 text-left">
                <!-- VITALES WEB -->
                <div class="card-bg p-3 rounded-lg border border-slate-700">
                    <h5 class="font-semibold text-slate-200 mb-3 text-center">Diagnóstico Técnico</h5>
                    <div class="grid grid-cols-3 gap-2">
                        <div class="dossier-metric">
                            <span class="dossier-score ${getScoreClass(performanceScore)}">${performanceScore}</span>
                            <span class="text-xs text-slate-400 mt-1">Rendimiento</span>
                        </div>
                        <div class="dossier-metric">
                            <span class="dossier-score ${getScoreClass(seoScore)}">${seoScore}</span>
                            <span class="text-xs text-slate-400 mt-1">SEO</span>
                        </div>
                         <div class="dossier-metric">
                            <span class="dossier-score ${getScoreClass(mobileScore)}">${mobileScore}</span>
                            <span class="text-xs text-slate-400 mt-1">Móvil</span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <span class="font-semibold text-slate-200 text-sm">Stack:</span>
                        <div class="tech-stack-item mt-1">
                            ${getTechStackIcon(techStack.name)}
                            <span>${techStack.name}</span>
                        </div>
                    </div>
                </div>

                <!-- INTELIGENCIA DE MARKETING -->
                <div class="card-bg p-3 rounded-lg border border-slate-700">
                    <h5 class="font-semibold text-slate-200 mb-3">Inteligencia de Marketing</h5>
                    <div class="space-y-2">
                        <div class="marketing-intel-item ${hasAnalytics ? 'intel-detected' : 'intel-not-detected'}">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9v-2h2v2zm0-4H9V6h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V6h2v2z"/></svg>
                             <div>
                                <p class="font-bold text-sm">${hasAnalytics ? 'Google Analytics Detectado' : 'Google Analytics No Detectado'}</p>
                                <p class="text-xs ${hasAnalytics ? 'text-green-300' : 'text-red-300'}">${hasAnalytics ? 'Mide activamente su tráfico.' : 'Oportunidad: No mide su tráfico.'}</p>
                             </div>
                        </div>
                        <div class="marketing-intel-item ${hasPixel ? 'intel-detected' : 'intel-not-detected'}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
                             <div>
                                <p class="font-bold text-sm">${hasPixel ? 'Píxel de Meta Detectado' : 'Píxel de Meta No Detectado'}</p>
                                <p class="text-xs ${hasPixel ? 'text-green-300' : 'text-red-300'}">${hasPixel ? 'Puede hacer retargeting.' : 'Oportunidad: No puede hacer retargeting.'}</p>
                             </div>
                        </div>
                    </div>
                </div>
                
                <!-- ASISTENTE DE CONTACTO -->
                 <div>
                     <h5 class="font-semibold text-slate-200 mb-2">Asistente de Contacto IA</h5>
                     <div id="outreach-assistant-container" class="mt-1 p-3 bg-slate-800 rounded-lg relative">
                        <div id="outreach-spinner" class="absolute inset-0 flex items-center justify-center hidden">
                            <svg class="spinner h-8 w-8 text-orange-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                        <p id="generated-outreach-text" class="text-slate-200 text-sm whitespace-pre-wrap"></p>
                        <button id="copy-outreach-btn" class="hidden absolute top-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">Copiar</button>
                    </div>
                </div>
            </div>
            ${actionButtonsHTML}
        </div>
    `;
    generateOutreachEmail(opportunity);
}

async function generateOutreachEmail(opportunity) {
    const container = document.getElementById('outreach-assistant-container');
    const spinner = document.getElementById('outreach-spinner');
    const copyBtn = document.getElementById('copy-outreach-btn');
    const textField = document.getElementById('generated-outreach-text');

    spinner.classList.remove('hidden');
    textField.textContent = '';
    copyBtn.classList.add('hidden');
    
    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        textField.textContent = 'Error: API Key no configurada.';
        spinner.classList.add('hidden');
        return;
    }
    
    const painPointsDetails = Object.entries(opportunity.painPoints)
        .filter(([, value]) => value)
        .map(([key]) => {
            const textMap = {
                slow: `Puntuación de Rendimiento: ${opportunity.performanceScore}/100 (Lento)`,
                mobile: `Puntuación Móvil: ${opportunity.mobileScore}/100 (No optimizado)`,
                ssl: 'Falta de Certificado SSL',
                seo: `Puntuación SEO: ${opportunity.seoScore}/100 (Potencial de mejora)`
            };
            return textMap[key];
        }).join(', ');
        
    const marketingIntel = [];
    if (!opportunity.hasAnalytics) marketingIntel.push('No tiene Google Analytics instalado');
    if (!opportunity.hasPixel) marketingIntel.push('No tiene Píxel de Meta instalado');

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: "Generate outreach email.",
                mode: 'outreach-generator',
                context: { 
                    businessName: opportunity.name, 
                    painPointsDetails,
                    marketingIntel: marketingIntel.join(', ') || 'N/A'
                },
                apiKey
            })
        });
        if (!response.ok) throw new Error('Failed to generate outreach email.');
        const data = await response.json();
        textField.textContent = data.response;
        copyBtn.textContent = 'Copiar';
        copyBtn.classList.remove('hidden');
    } catch (e) {
        textField.textContent = 'Error al generar el borrador del email.';
    } finally {
        spinner.classList.add('hidden');
    }
}

function handleAddProspectToPipeline(opportunityId) {
    const opportunity = currentOpportunities.find(o => o.id == opportunityId);
    if (!opportunity) return;
    
    const prospectData = {
        clientName: '',
        clientCompany: opportunity.name,
        clientEmail: '',
        webName: `Prospecto: ${opportunity.name}`,
        isProspect: true,
        radarData: opportunity // Guardar toda la inteligencia
    };
    
    handleAddTask(prospectData);
    showNotification('success', 'Prospecto Añadido', `"${opportunity.name}" ha sido añadido a tu pipeline.`);
    
    // Re-render dossier para actualizar el estado del botón
    renderDossierView(opportunity);
}


function handleCreateProposalFromRadar(opportunityId) {
    const opportunity = currentOpportunities.find(o => o.id == opportunityId);
    if (!opportunity) return;
    
    // 1. Añadir al pipeline si no está ya
    const { tasks } = getState();
    const isInPipeline = tasks.some(task => task.isProspect && task.radarData && task.radarData.id === opportunity.id);
    if (!isInPipeline) {
        handleAddProspectToPipeline(opportunityId);
    }
    
    // 2. Resetear formulario y pre-rellenar
    resetForm();
    dom.clientCompanyInput.value = opportunity.name;
    dom.webNameInput.value = `Nuevo Sitio Web para ${opportunity.name}`;

    let painPointsDescription = Object.entries(opportunity.painPoints)
        .filter(([, value]) => value)
        .map(([key]) => {
             const textMap = {
                slow: `El sitio web es lento (Rendimiento: ${opportunity.performanceScore}/100).`,
                mobile: `El sitio no funciona bien en móviles (Puntuación Móvil: ${opportunity.mobileScore}/100).`,
                ssl: 'Falta un certificado de seguridad SSL.',
                seo: `Tiene un SEO básico deficiente (Puntuación SEO: ${opportunity.seoScore}/100).`
            };
            return textMap[key];
        }).join(' ');

    if (!opportunity.hasAnalytics) painPointsDescription += " Además, no tiene Google Analytics instalado.";
    if (!opportunity.hasPixel) painPointsDescription += " Tampoco tiene el Píxel de Meta para retargeting.";
    
    // 3. Activar la IA
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    chatInput.value = `Cliente con sitio en ${opportunity.techStack.name}. Problemas detectados: ${painPointsDescription.trim()} Sugiere los servicios necesarios para solucionarlos.`;
    
    closeOpportunityRadarModal();
    
    setTimeout(() => {
        sendBtn.click();
        showNotification('info', 'Asistente Activado', `La IA está creando una propuesta para ${opportunity.name} basada en los problemas detectados.`);
    }, 500);
}


export function showOpportunityRadarModal() {
    const modal = document.getElementById('opportunityRadarModal');
    if (!modal) return;
    openModal(modal);
    
    if (!modal.dataset.listenersAttached) {
        document.getElementById('close-opportunity-radar-modal-btn').addEventListener('click', closeOpportunityRadarModal);
        document.getElementById('radar-start-scan-btn').addEventListener('click', handleStartScan);
        
        const mainContent = document.getElementById('radar-main-content');
        mainContent.addEventListener('click', (e) => {
            const actionTarget = e.target.closest('[data-action]');
            if (!actionTarget) return;

            const { action, id } = actionTarget.dataset;
            
            switch (action) {
                case 'view-dossier': {
                    const opp = currentOpportunities.find(o => o.id == id);
                    if (opp) renderDossierView(opp);
                    break;
                }
                case 'add-prospect':
                    handleAddProspectToPipeline(id);
                    break;
                case 'create-proposal-from-radar':
                    handleCreateProposalFromRadar(id);
                    break;
                case 'copy-outreach': {
                    const text = document.getElementById('generated-outreach-text').textContent;
                    navigator.clipboard.writeText(text);
                    actionTarget.textContent = '¡Copiado!';
                    break;
                }
            }
        });

        modal.dataset.listenersAttached = 'true';
    }
}

export function closeOpportunityRadarModal() {
    closeModal(document.getElementById('opportunityRadarModal'));
}