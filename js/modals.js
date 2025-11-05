// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices, setTieredBuilderActive, formatPrice, setExtraPointsPurchased, setExtraPointsCost, setUsdToArsRate } from './state.js';
import { updateSelectedItems, handleAddTask, resetForm } from './app.js';
import { rerenderAllPrices } from './ui.js';
import { updatePointSystemUI } from './points.js';
import { generateActionPlanPdf } from './pdf.js';
import { toggleButtonLoading } from './ui-helpers.js';

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
    
    const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    if (!brandInfo.logo || !brandInfo.resellerInfo || !brandInfo.terms) {
        showNotification(
            'error', 
            'Configuración Requerida', 
            'Por favor, configura tu marca (logo, datos y términos) en "⚙️ Configuración de Marca" antes de generar documentos.'
        );
        showBrandingModal();
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

export function closeBrandingModal() {
    closeModal(document.getElementById('brandingModal'));
}


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

async function handleGenerateText(event) {
    const button = event.currentTarget;
    toggleButtonLoading(button, true, 'Generando...');

    const resultContainer = document.getElementById('text-result-container');
    const spinner = document.getElementById('text-spinner');
    const copyBtn = document.getElementById('copy-generated-text-btn');
    const generatedTextP = document.getElementById('generated-text');
    const imagePromptSection = document.getElementById('image-prompt-section');
    
    resultContainer.classList.remove('hidden');
    imagePromptSection.classList.add('hidden');
    spinner.classList.remove('hidden');
    generatedTextP.textContent = '';
    copyBtn.classList.add('hidden');

    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key.');
        toggleButtonLoading(button, false);
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
        imagePromptSection.classList.remove('hidden');

    } catch (error) {
        generatedTextP.textContent = `Error: ${error.message}`;
    } finally {
        toggleButtonLoading(button, false);
        spinner.classList.add('hidden');
    }
}

async function handleGenerateImagePrompt(event) {
    const button = event.currentTarget;
    toggleButtonLoading(button, true, 'Creando prompt...');

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
        toggleButtonLoading(button, false);
        spinner.classList.add('hidden');
        return;
    }
    
    const postText = document.getElementById('generated-text').textContent;
    if (!postText) {
        showNotification('info', 'Texto Requerido', 'Primero debes generar un texto.');
        toggleButtonLoading(button, false);
        spinner.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
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
    } finally {
        toggleButtonLoading(button, false);
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


// --- PLAN DE CAPTACIÓN DE CLIENTES ---
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

async function handleGenerateLeadGenPlan(event) {
    const button = event.currentTarget;
    toggleButtonLoading(button, true, 'Generando...');
    
    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key.');
        toggleButtonLoading(button, false);
        return;
    }

    const service = document.getElementById('lead-gen-plan-service-select').value;
    const audience = document.getElementById('lead-gen-plan-audience').value;

    if (!audience) {
        showNotification('error', 'Público Requerido', 'Por favor, describe a tu público objetivo.');
        toggleButtonLoading(button, false);
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
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
    } finally {
        toggleButtonLoading(button, false);
        closeLeadGenPlanModal();
    }
}

// --- CANALES DE VENTA ---
export function showSalesChannelsModal() { openModal(document.getElementById('salesChannelsModal')); }
export function closeSalesChannelsModal() { closeModal(document.getElementById('salesChannelsModal')); }

// --- RADAR DE OPORTUNIDADES ---
let currentOpportunities = [];

function getSelectedPainPointFilters() {
    const filters = {};
    document.querySelectorAll('#opportunityRadarModal input[type="checkbox"][data-filter]').forEach(cb => {
        filters[cb.dataset.filter] = cb.checked;
    });
    return filters;
}

async function handleStartScan(event) {
    const button = event.currentTarget;
    toggleButtonLoading(button, true, 'Escaneando...');

    const resultsContainer = document.getElementById('radar-results');
    resultsContainer.innerHTML = '<p class="text-center text-slate-400">Buscando clientes potenciales...</p>';
    
    const dossierView = document.getElementById('radar-dossier-view');
    dossierView.innerHTML = `<div class="flex flex-col items-center justify-center text-center h-full"><svg class="spinner h-12 w-12 text-orange-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><h4 class="text-xl font-bold text-slate-300">Analizando la Web...</h4><p class="text-slate-400 mt-1">La IA está evaluando cada sitio. Esto puede tardar un momento.</p></div>`;

    const businessType = document.getElementById('radar-business-type').value;
    const location = document.getElementById('radar-location').value;
    const filters = getSelectedPainPointFilters();
    const apiKey = getState().sessionApiKey;

    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key para usar el Radar.');
        toggleButtonLoading(button, false);
        return;
    }

    if (!businessType || !location) {
        showNotification('error', 'Datos Requeridos', 'Por favor, especifica el tipo de negocio y la ubicación.');
        toggleButtonLoading(button, false);
        resultsContainer.innerHTML = '';
        dossierView.innerHTML = `<div class="flex flex-col items-center justify-center text-center h-full"><svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg><h4 class="text-xl font-bold text-slate-300">Selecciona una Oportunidad</h4><p class="text-slate-400 mt-1">Elige un resultado del escaneo para ver el dossier de inteligencia.</p></div>`;
        return;
    }
    
    try {
        const response = await fetch('/.netlify/functions/radar', {
            method: 'POST',
            body: JSON.stringify({ businessType, location, filters, apiKey })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `El servidor respondió con un error: ${response.status}`);
        }

        const data = await response.json();
        currentOpportunities = data.opportunities;
        renderRadarResults(currentOpportunities);
        dossierView.innerHTML = `<div class="flex flex-col items-center justify-center text-center h-full"><svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" /></svg><h4 class="text-xl font-bold text-slate-300">Selecciona una Oportunidad</h4><p class="text-slate-400 mt-1">Elige un resultado del escaneo para ver el dossier de inteligencia.</p></div>`;

    } catch (error) {
        showNotification('error', 'Error de Escaneo', `No se pudo completar el escaneo: ${error.message}`);
        resultsContainer.innerHTML = `<p class="text-center text-red-400">Error al escanear. Inténtalo de nuevo.</p>`;
    } finally {
        toggleButtonLoading(button, false);
    }
}


function renderRadarResults(opportunities) {
    const resultsContainer = document.getElementById('radar-results');
    if (!opportunities || opportunities.length === 0) {
        resultsContainer.innerHTML = '<p class="text-center text-slate-400">No se encontraron oportunidades con esos criterios.</p>';
        return;
    }
    
    resultsContainer.innerHTML = opportunities.map(opp => `
        <div class="card-bg p-3 rounded-lg border border-slate-700 hover:border-orange-500 cursor-pointer transition" data-action="view-dossier" data-id="${opp.id}">
            <h5 class="font-bold text-white">${opp.name}</h5>
            <p class="text-xs text-slate-400 mb-2">${opp.address}</p>
        </div>`
    ).join('');
}

function renderDossierView(opportunity) {
    const dossierView = document.getElementById('radar-dossier-view');
    const { performanceScore, seoScore, mobileScore, techStack, hasAnalytics, hasPixel } = opportunity;
    const { tasks } = getState();
    const isInPipeline = tasks.some(task => task.isProspect && task.radarData && task.radarData.id === opportunity.id);

    const getScoreClass = (score) => score < 50 ? 'score-red' : score < 90 ? 'score-yellow' : 'score-green';

    dossierView.innerHTML = `
        <div class="w-full h-full flex flex-col">
            <h4 class="text-xl font-bold text-orange-400 mb-1">${opportunity.name}</h4>
            <p class="text-xs text-slate-400 mb-4">${opportunity.address}</p>
            <div class="flex-grow space-y-4 overflow-y-auto p-1 text-left">
                <div class="card-bg p-3 rounded-lg border border-slate-700">
                    <h5 class="font-semibold text-slate-200 mb-3 text-center">Diagnóstico Técnico</h5>
                    <div class="grid grid-cols-3 gap-2">
                        <div class="dossier-metric"><span class="dossier-score ${getScoreClass(performanceScore)}">${performanceScore}</span><span class="text-xs text-slate-400 mt-1">Rendimiento</span></div>
                        <div class="dossier-metric"><span class="dossier-score ${getScoreClass(seoScore)}">${seoScore}</span><span class="text-xs text-slate-400 mt-1">SEO</span></div>
                        <div class="dossier-metric"><span class="dossier-score ${getScoreClass(mobileScore)}">${mobileScore}</span><span class="text-xs text-slate-400 mt-1">Móvil</span></div>
                    </div>
                </div>
                <div class="card-bg p-3 rounded-lg border border-slate-700">
                     <h5 class="font-semibold text-slate-200 mb-3">Inteligencia de Marketing</h5>
                     <div class="space-y-2">
                        <div class="marketing-intel-item ${hasAnalytics ? 'intel-detected' : 'intel-not-detected'}">
                            <p class="font-bold text-sm">${hasAnalytics ? 'Google Analytics ✔️' : 'Sin Google Analytics ❌'}</p>
                        </div>
                        <div class="marketing-intel-item ${hasPixel ? 'intel-detected' : 'intel-not-detected'}">
                            <p class="font-bold text-sm">${hasPixel ? 'Píxel de Meta ✔️' : 'Sin Píxel de Meta ❌'}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex-shrink-0 pt-4 mt-auto w-full space-y-2">
                <button class="w-full bg-slate-600 text-white font-bold py-2 rounded-lg transition btn-press-feedback ${isInPipeline ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-500'}" data-action="add-prospect" data-id="${opportunity.id}" ${isInPipeline ? 'disabled' : ''}>${isInPipeline ? 'En Pipeline ✔️' : 'Añadir al Pipeline'}</button>
                <button class="w-full accent-bg font-bold py-2 rounded-lg transition btn-press-feedback" data-action="create-proposal-from-radar" data-id="${opportunity.id}">Crear Propuesta con IA</button>
            </div>
        </div>`;
}

function handleAddProspectToPipeline(opportunityId) {
    const opportunity = currentOpportunities.find(o => o.id == opportunityId);
    if (!opportunity) return;
    const prospectData = {
        clientName: '', clientCompany: opportunity.name, clientEmail: '',
        webName: `Prospecto: ${opportunity.name}`, isProspect: true, radarData: opportunity
    };
    handleAddTask(prospectData);
    showNotification('success', 'Prospecto Añadido', `"${opportunity.name}" ha sido añadido a tu pipeline.`);
    renderDossierView(opportunity);
}

function handleCreateProposalFromRadar(opportunityId) {
    const opportunity = currentOpportunities.find(o => o.id == opportunityId);
    if (!opportunity) return;
    
    if (!getState().tasks.some(t => t.isProspect && t.radarData && t.radarData.id === opportunity.id)) {
        handleAddProspectToPipeline(opportunityId);
    }
    
    resetForm();
    dom.clientCompanyInput.value = opportunity.name;
    dom.webNameInput.value = `Nuevo Sitio Web para ${opportunity.name}`;

    let painPoints = Object.entries(opportunity.painPoints).filter(([, v]) => v).map(([k]) => k).join(', ');
    
    const chatInput = document.getElementById('chat-input');
    chatInput.value = `Cliente con sitio en ${opportunity.techStack}. Problemas: ${painPoints}. Sugiere servicios para solucionarlos.`;
    
    closeOpportunityRadarModal();
    
    setTimeout(() => {
        document.getElementById('chat-send-btn').click();
        showNotification('info', 'Asistente Activado', `La IA está creando una propuesta para ${opportunity.name}.`);
    }, 500);
}

export function showOpportunityRadarModal() {
    const modal = document.getElementById('opportunityRadarModal');
    if (!modal) return;
    openModal(modal);
    
    if (!modal.dataset.listenersAttached) {
        document.getElementById('close-opportunity-radar-modal-btn').addEventListener('click', closeOpportunityRadarModal);
        document.getElementById('radar-start-scan-btn').addEventListener('click', handleStartScan);
        
        document.getElementById('radar-main-content').addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const { action, id } = target.dataset;
            if (action === 'view-dossier') renderDossierView(currentOpportunities.find(o => o.id == id));
            else if (action === 'add-prospect') handleAddProspectToPipeline(id);
            else if (action === 'create-proposal-from-radar') handleCreateProposalFromRadar(id);
        });
        modal.dataset.listenersAttached = 'true';
    }
}

export function closeOpportunityRadarModal() {
    closeModal(document.getElementById('opportunityRadarModal'));
}
