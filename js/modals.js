// js/modals.js

import * as dom from './dom.js';
import { getState, setCustomServices } from './state.js';
import { updateSelectedItems } from './app.js';

export function showNotification(type, title, message) {
    dom.notificationTitle.textContent = title;
    dom.notificationMessage.innerHTML = message;
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
    if (tasks.length === 0) return showNotification('info', 'Vacío', 'No hay tareas guardadas para exportar.');
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

// Asociar funciones a los botones de los modales en el scope global
// para que los `onclick` del HTML funcionen.
window.closeNotificationModal = closeNotificationModal;
window.closeCustomServiceModal = closeCustomServiceModal;
window.addCustomServiceToSelection = addCustomServiceToSelection;
window.closePdfOptionsModal = closePdfOptionsModal;
window.showCustomServiceModal = showCustomServiceModal;
window.showPdfOptionsModal = showPdfOptionsModal;