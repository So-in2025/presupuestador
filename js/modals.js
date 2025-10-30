// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices, setTieredBuilderActive } from './state.js';
import { updateSelectedItems, handleAddTask } from './app.js';
import { createServiceItemHTML, initializeTour } from './ui.js';
import { setSessionApiKey } from './main.js';
import { GoogleGenerativeAI } from 'https://esm.run/@google/generative-ai';


export function showNotification(type, title, message) {
    dom.notificationTitle.textContent = title;
    dom.notificationMessage.innerHTML = message; // Cambiado a innerHTML
    const header = dom.notificationModal.querySelector('.modal-header');
    header.className = 'modal-header p-4 rounded-t-xl text-white font-bold flex justify-between items-center';
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-cyan-600' };
    header.classList.add(colors[type] || 'bg-cyan-600');
    dom.notificationModal.classList.remove('hidden');
}

export function closeNotificationModal() { dom.notificationModal.classList.add('hidden'); }

export function showCustomServiceModal() {
    if (document.querySelector('input[name="selectionGroup"]:checked, input[name="monthlyPlanSelection"]:checked')) {
        return showNotification('error', 'Error', 'No puedes añadir ítems personalizados cuando un paquete o plan está seleccionado.');
    }
    dom.customServiceNameInput.value = '';
    dom.customServicePriceInput.value = '';
    dom.customServiceModal.classList.remove('hidden');
}

export function closeCustomServiceModal() { dom.customServiceModal.classList.add('hidden'); }

export function showPdfOptionsModal() {
    const { tasks } = getState();
    if (tasks.length === 0) {
        // Habilitar botones de PDF si hay al menos una tarea
        document.querySelectorAll('#pdfOptionsModal button[onclick^="generatePdf"]').forEach(btn => btn.disabled = true);
        return showNotification('info', 'Vacío', 'No hay propuestas guardadas para exportar.');
    }
    document.querySelectorAll('#pdfOptionsModal button[onclick^="generatePdf"]').forEach(btn => btn.disabled = false);

    
    const brandInfo = localStorage.getItem('zenBrandInfo');
    if(brandInfo) {
        const { resellerInfo } = JSON.parse(brandInfo);
        if (resellerInfo && !dom.pdfResellerInfo.value) {
            dom.pdfResellerInfo.value = resellerInfo;
        }
    }
    dom.pdfOptionsModal.classList.remove('hidden');
}

export function closePdfOptionsModal() { dom.pdfOptionsModal.classList.add('hidden'); }

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
    document.getElementById('brandingModal').classList.remove('hidden');
}

export function closeBrandingModal() { document.getElementById('brandingModal').classList.add('hidden'); }

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
                <p class="text-lg font-bold text-white">Costo: $<span class="tier-total-cost">0.00</span> USD</p>
            </div>
        `;
        container.appendChild(column);
    });

    setTieredBuilderActive(true);
    updateTieredTotals();
    container.addEventListener('change', updateTieredTotals);
    document.getElementById('tieredBuilderModal').classList.remove('hidden');
}

function updateTieredTotals() {
    const columns = document.querySelectorAll('#tiered-builder-columns > div');
    columns.forEach(column => {
        let total = 0;
        column.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            total += parseFloat(cb.dataset.price);
        });
        column.querySelector('.tier-total-cost').textContent = total.toFixed(2);
    });
}

export function closeTieredBuilderModal() {
    setTieredBuilderActive(false);
    document.getElementById('tieredBuilderModal').classList.add('hidden');
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

// --- NUEVO: API KEY MODAL ---
export function showApiKeyModal() {
    dom.apiKeyModal.classList.remove('hidden');
    dom.apiKeyInput.focus();
}

export function closeApiKeyModal() {
    dom.apiKeyModal.classList.add('hidden');
}

export async function handleSaveApiKey(button) {
    const key = dom.apiKeyInput.value.trim();
    if (!key) {
        showNotification('error', 'Clave Requerida', 'Por favor, introduce una API Key válida.');
        return;
    }

    const spinner = button.querySelector('.spinner');
    const btnText = button.querySelector('.btn-text');
    
    spinner.classList.remove('hidden');
    btnText.textContent = 'Validando...';
    button.disabled = true;

    try {
        // Prueba de validación real contra la API
        const genAI = new GoogleGenerativeAI(key);
        await genAI.getGenerativeModel({ model: "gemini-2.5-flash" }).generateContent("test");

        setSessionApiKey(key);
        closeApiKeyModal();
        showNotification('success', 'API Key Válida', 'Tu clave ha sido configurada para esta sesión. El asistente IA está activo.');
        
        // CORRECCIÓN: Iniciar el tour DESPUÉS de que la app esté lista.
        initializeTour();

    } catch (error) {
        console.error("Error de validación de API Key:", error);
        showNotification('error', 'Clave Inválida', 'La API Key proporcionada no es válida o no tiene acceso a la API de Gemini. Por favor, verifica tu clave en Google AI Studio.');
    } finally {
        spinner.classList.add('hidden');
        btnText.textContent = 'Guardar y Activar';
        button.disabled = false;
    }
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

// Asociar funciones al scope global para que los `onclick` funcionen.
window.closeNotificationModal = closeNotificationModal;
window.closeCustomServiceModal = closeCustomServiceModal;
window.addCustomServiceToSelection = addCustomServiceToSelection;
window.closePdfOptionsModal = closePdfOptionsModal;
window.showCustomServiceModal = showCustomServiceModal;
window.showPdfOptionsModal = showPdfOptionsModal;
window.showBrandingModal = showBrandingModal;
window.closeBrandingModal = closeBrandingModal;
window.showTieredBuilderModal = showTieredBuilderModal;
window.closeTieredBuilderModal = closeTieredBuilderModal;
window.addTieredProposal = addTieredProposal;
window.showApiKeyModal = showApiKeyModal;
window.handleSaveApiKey = handleSaveApiKey;
window.showTieredBuilderHelp = showTieredBuilderHelp;
