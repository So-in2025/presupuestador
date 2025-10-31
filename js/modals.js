// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices, setTieredBuilderActive, formatPrice, setExtraPointsPurchased, setExtraPointsCost, setUsdToArsRate, setSessionApiKey } from './state.js';
import { updateSelectedItems, handleAddTask } from './app.js';
import { initializeTour, rerenderAllPrices } from './ui.js';
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
        document.querySelectorAll('#pdfOptionsModal button[id^="generate-"]').forEach(btn => btn.disabled = true);
        return showNotification('info', 'Vacío', 'No hay propuestas guardadas para exportar.');
    }
    document.querySelectorAll('#pdfOptionsModal button[id^="generate-"]').forEach(btn => btn.disabled = false);

    
    const brandInfo = localStorage.getItem('zenBrandInfo');
    if(brandInfo) {
        const { resellerInfo } = JSON.parse(brandInfo);
        if (resellerInfo && !dom.pdfResellerInfo.value) {
            dom.pdfResellerInfo.value = resellerInfo;
        }
    }
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


// --- API KEY MODAL ---
export function showApiKeyModal() {
    openModal(dom.apiKeyModal);
    dom.apiKeyInput.focus();
}

export function closeApiKeyModal() {
    closeModal(dom.apiKeyModal);
}

export function handleSaveApiKey() {
    const key = dom.apiKeyInput.value.trim();
    if (!key) {
        showNotification('error', 'Clave Requerida', 'Por favor, introduce una API Key.');
        return;
    }

    setSessionApiKey(key);
    
    const indicator = document.getElementById('ai-status-indicator');
    if(indicator) {
        indicator.classList.remove('bg-red-500');
        indicator.classList.add('bg-green-400', 'animate-pulse');
    }

    closeApiKeyModal();
    showNotification('success', 'API Key Guardada', 'Tu clave ha sido configurada para esta sesión. El asistente se activará y validará en tu primer chat.');
    
    initializeTour();
}

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