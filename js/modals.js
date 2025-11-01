// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices, setTieredBuilderActive, formatPrice, setExtraPointsPurchased, setExtraPointsCost, setUsdToArsRate } from './state.js';
import { updateSelectedItems, handleAddTask } from './app.js';
import { rerenderAllPrices } from './ui.js';
import { updatePointSystemUI } from './points.js';

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
    
    // CORRECCIÓN: Se eliminó la línea que intentaba acceder a un elemento inexistente.
    // dom.pdfClientInfo.value = ''; 
    
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


export function showTieredBuilderHelp() {
    const helpTitle = "Estrategia de Venta por Niveles";
    const helpMessage = `
        <p class="mb-2">Esta es una técnica de venta poderosa para aumentar el valor de tus propuestas. La idea es presentarle al cliente 3 opciones en lugar de una:</p>
        <ul class="list-disc list-inside text-left space-y-1 text-sm text-slate-400">
            <li><b>Básico:</b> La solución esencial. Cubre la necesidad principal del cliente.</li>
            <li><b>Recomendado:</b> La solución ideal. Incluye lo básico más los servicios que realmente llevarán el proyecto al siguiente nivel.</li>
            <li><b>Completo:</b> La solución premium. Incluye todo lo anterior más los extras de alto valor (ej: seguridad avanzada, optimización, etc.).</li>
        </ul>
        <p class="mt-3 font-semibold text-cyan-300">¿Por qué funciona? Aprovecha la psicología de "anclaje de precios" y le da al cliente la sensación de control, aumentando la probabilidad de que elija la opción recomendada.</p>
    `;
    showNotification('info', helpTitle, helpMessage);
}


// --- NUEVO: ESTUDIO DE CONTENIDO ---
let isGenerating = false;

function populateContentStudioDropdowns() {
    const { allServices } = getState();
    const serviceList = Object.values(allServices).flatMap(cat => cat.items);

    const textSelect = document.getElementById('text-service-to-promote');
    const imageSelect = document.getElementById('image-service-to-promote');

    if (!textSelect || !imageSelect) return;

    // Guardar los valores seleccionados si existen
    const selectedText = textSelect.value;
    const selectedImage = imageSelect.value;

    textSelect.innerHTML = '';
    imageSelect.innerHTML = '';

    // Añadir la opción de promoción general
    const generalOption = `<option value="general">Promoción General (Todos los servicios)</option>`;
    textSelect.insertAdjacentHTML('beforeend', generalOption);
    imageSelect.insertAdjacentHTML('beforeend', generalOption);
    
    serviceList.forEach(service => {
        const option = document.createElement('option');
        option.value = service.name; // Usar el nombre como valor para el prompt
        option.textContent = service.name;
        textSelect.appendChild(option.cloneNode(true));
        imageSelect.appendChild(option.cloneNode(true));
    });

    // Restaurar selección previa
    textSelect.value = selectedText || 'general';
    imageSelect.value = selectedImage || 'general';
}

export function showContentStudioModal() {
    const modal = document.getElementById('contentStudioModal');
    if (!modal) return;
    
    populateContentStudioDropdowns();
    openModal(modal);

    if (!modal.dataset.listenersAttached) {
        const tabs = modal.querySelectorAll('.studio-tab');
        const contents = modal.querySelectorAll('.studio-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                contents.forEach(c => c.classList.remove('active'));
                document.getElementById(`${tab.dataset.tab}-content`).classList.add('active');
            });
        });
        
        document.getElementById('generate-text-btn').addEventListener('click', handleGenerateText);
        document.getElementById('generate-image-btn').addEventListener('click', handleGenerateImage);
        document.getElementById('copy-generated-text-btn').addEventListener('click', handleCopyText);

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
    
    resultContainer.classList.remove('hidden');
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
                userMessage: "Generate social media text based on context.", // Mensaje genérico, la lógica está en el backend
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

    } catch (error) {
        generatedTextP.textContent = `Error: ${error.message}`;
        console.error("Error al generar texto:", error);
    } finally {
        isGenerating = false;
        spinner.classList.add('hidden');
    }
}

async function handleGenerateImage() {
    if (isGenerating) return;
    isGenerating = true;
    
    const resultContainer = document.getElementById('image-result-container');
    const spinner = document.getElementById('image-spinner');
    const generatedImage = document.getElementById('generated-image');
    const downloadBtn = document.getElementById('download-image-btn');

    resultContainer.classList.remove('hidden');
    spinner.classList.remove('hidden');
    generatedImage.classList.add('hidden');
    downloadBtn.classList.add('hidden');

    const apiKey = getState().sessionApiKey;
    if (!apiKey) {
        showNotification('error', 'API Key Requerida', 'Por favor, configura tu API Key antes de usar el estudio de contenido.');
        isGenerating = false;
        spinner.classList.add('hidden');
        return;
    }

    const concept = document.getElementById('image-service-to-promote').value;
    const style = document.getElementById('image-style').value;
    const colors = document.getElementById('image-colors').value;

    try {
        const response = await fetch('/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: 'Generate an image based on the context.', // Placeholder message
                mode: 'image-creator',
                context: { style, concept, colors },
                apiKey
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error del servidor al generar la imagen.');
        }

        const data = await response.json();
        const imageUrl = `data:image/png;base64,${data.base64Image}`;
        generatedImage.src = imageUrl;
        downloadBtn.href = imageUrl;
        generatedImage.classList.remove('hidden');
        downloadBtn.classList.remove('hidden');
        
    } catch (error) {
        // Limpiar el contenedor antes de mostrar el error para evitar duplicados
        while (resultContainer.firstChild) {
            resultContainer.removeChild(resultContainer.firstChild);
        }
        const errorP = document.createElement('p');
        errorP.className = 'text-red-400';
        errorP.textContent = `Error: ${error.message}`;
        resultContainer.appendChild(spinner); // Re-add spinner just in case
        resultContainer.appendChild(generatedImage);
        resultContainer.appendChild(downloadBtn);
        resultContainer.appendChild(errorP);
        console.error("Error al generar imagen:", error);
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