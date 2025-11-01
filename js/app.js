// js/app.js

import * as dom from './dom.js';
import * as state from './state.js';
import { saveTasks, saveLocalServices } from './data.js';
import { showNotification } from './modals.js';
import { handlePlanSelection, updatePointSystemUI } from './points.js';

export function updateSummary() {
    let totalDevCost = 0;
    const { selectedServices, extraPointsCost } = state.getState();
    const margin = parseFloat(dom.marginPercentageInput.value) / 100 || 0;
    let feedback = '';

    if (state.getState().isTieredBuilderActive) {
        dom.totalDevPriceSpan.textContent = 'N/A';
        dom.totalClientPriceSpan.textContent = 'N/A';
        dom.marginFeedback.textContent = 'Los precios se calculan por nivel en el constructor.';
        return;
    }
    
    const exclusiveSelection = selectedServices.find(s => s.type === 'package' || s.type === 'plan');
    const standardItems = selectedServices.filter(s => s.type === 'standard' || s.type === 'custom');
    
    if (exclusiveSelection) {
        totalDevCost = exclusiveSelection.price;
        if (exclusiveSelection.type === 'plan') {
            totalDevCost += extraPointsCost;
            const pointsFeedback = extraPointsCost > 0 ? ` + ${state.formatPrice(extraPointsCost)} en puntos extra` : '';
            feedback = `Costo del plan: ${state.formatPrice(exclusiveSelection.price)}${pointsFeedback}`;
        } else {
            feedback = `Costo fijo de paquete: ${state.formatPrice(totalDevCost)}`;
        }
    } else {
        totalDevCost = standardItems.reduce((sum, item) => sum + item.price, 0);
        feedback = `Total de ${standardItems.length} ítems individuales.`;
    }
    
    const totalClientPrice = margin < 1 ? totalDevCost / (1 - margin) : totalDevCost * (1 + margin);
    dom.totalDevPriceSpan.innerHTML = state.formatPrice(totalDevCost);
    dom.totalClientPriceSpan.innerHTML = state.formatPrice(totalClientPrice);
    dom.marginFeedback.textContent = feedback;
    dom.addTaskButton.textContent = state.getState().editingIndex !== -1 ? 'Guardar Cambios' : 'Guardar Propuesta';
}

export function updateSelectedItems() {
    const { customServices } = state.getState();
    let currentSelected = [];
    const packageChecked = document.querySelector('input[name="selectionGroup"]:checked');
    const planChecked = document.querySelector('input[name="monthlyPlanSelection"]:checked');

    if (packageChecked) {
        currentSelected.push({ name: packageChecked.dataset.name, price: parseFloat(packageChecked.dataset.price), id: packageChecked.value, type: 'package' });
    } else if (planChecked) {
        const { selectedPlanServices } = state.getState();
        currentSelected.push({ name: planChecked.dataset.name, price: parseFloat(planChecked.dataset.price), id: planChecked.value, type: 'plan' });
        currentSelected.push(...selectedPlanServices);
    } else {
        document.querySelectorAll('input[data-type="standard"]:checked').forEach(el => {
            currentSelected.push({ name: el.dataset.name, price: parseFloat(el.dataset.price), id: el.value, type: 'standard' });
        });
    }
    
    currentSelected.push(...customServices);
    state.setSelectedServices(currentSelected);
    
    const exclusiveSelection = currentSelected.find(s => s.type === 'package' || s.type === 'plan');
    document.querySelectorAll('.item-card:has([data-type="standard"])').forEach(card => card.classList.toggle('item-disabled', !!exclusiveSelection));
    document.getElementById('add-custom-service-modal-btn').disabled = !!exclusiveSelection;

    dom.clearSelectionsBtn.classList.toggle('hidden', currentSelected.length === 0);
    
    if (exclusiveSelection) {
        dom.modeIndicator.className = 'mb-4 p-3 rounded-lg border border-green-500 bg-green-900/20 text-green-300 font-bold text-center';
        dom.modeIndicator.textContent = `Modo Activo: ${exclusiveSelection.type === 'package' ? 'Paquete' : 'Plan Mensual'} (Exclusivo)`;
    } else {
        dom.modeIndicator.className = 'mb-4 p-3 rounded-lg border border-yellow-500 bg-yellow-900/20 text-yellow-300 font-bold text-center';
        dom.modeIndicator.textContent = 'Modo Activo: Individual (Selección libre)';
    }
    
    dom.selectedItemsDiv.innerHTML = currentSelected.length === 0 ? '<p class="text-slate-400">Selecciona ítems, un paquete o un plan.</p>' : currentSelected.map(item => {
        const prefix = item.type === 'package' ? '📦 ' : item.type === 'plan' ? '📅 ' : item.type === 'custom' ? '⭐ ' : '• ';
        const color = (item.type === 'package' || item.type === 'plan' || item.type === 'custom') ? 'text-cyan-300 font-bold' : 'text-slate-200';
        const removeButton = item.type === 'custom' ? `<button data-action="remove-custom" data-id="${item.id}" class="text-red-500 hover:text-red-400 ml-2 font-mono">[x]</button>` : '';
        const pointText = item.pointCost ? ` (${item.pointCost} Pts)` : '';
        return `<div class="${color} flex justify-between items-center">${prefix}${item.name}${pointText}${removeButton}</div>`;
    }).join('');

    updateSummary();
}

export function clearAllSelections() {
    document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach(el => el.checked = false);
    state.setCustomServices([]);
    
    state.setSelectedPlanId(null);
    state.setSelectedPlanServices([]);
    state.setTotalPlanPoints(0);
    state.setUsedPlanPoints(0);
    state.setExtraPointsPurchased(0);
    state.setExtraPointsCost(0);
    updatePointSystemUI();
    
    updateSelectedItems();
}

export function toggleSelectionMode(mode) {
    const isMonthly = mode === 'mensual';
    dom.monthlyPlansContainer.classList.toggle('hidden', !isMonthly);
    dom.servicesSelectionDiv.classList.toggle('hidden', isMonthly);
    dom.monthlyServicesContainer.classList.toggle('hidden', !isMonthly);
    
    if (document.querySelector('input:checked')) {
        clearAllSelections();
    }
}

export function handleAddTask(taskData = null) {
    const isTiered = taskData && taskData.isTiered;
    const { selectedServices, editingIndex } = state.getState();
    
    if (!isTiered && selectedServices.length === 0) {
        return showNotification('error', 'Error', 'Debes seleccionar al menos un servicio.');
    }

    let newTask;
    if (isTiered) {
        newTask = {
            ...taskData,
            status: 'Propuesta Guardada',
            dateUpdated: new Date().toISOString()
        };
    } else {
        const packageSelection = selectedServices.find(s => s.type === 'package');
        const planSelection = selectedServices.find(s => s.type === 'plan');
        const individualItems = selectedServices.filter(s => s.type === 'standard' || s.type === 'custom');
        const { selectedPlanId, selectedPlanServices, usedPlanPoints, totalPlanPoints, extraPointsPurchased, extraPointsCost } = state.getState();
        
        let totalDevCost = 0;
        if (packageSelection) {
            totalDevCost = packageSelection.price;
        } else if (planSelection) {
            totalDevCost = planSelection.price + extraPointsCost;
        } else {
            totalDevCost = individualItems.reduce((sum, item) => sum + item.price, 0);
        }
        const margin = parseFloat(dom.marginPercentageInput.value) / 100 || 0;
        const totalClientPrice = margin < 1 ? totalDevCost / (1 - margin) : totalDevCost * (1 + margin);
        const isUrgent = document.getElementById('isUrgentCheckbox').checked;


        newTask = {
            clientName: document.getElementById('clientName').value || 'Sin Cliente',
            webName: document.getElementById('webName').value || 'Sin Web',
            margin: margin,
            totalDev: totalDevCost,
            totalClient: totalClientPrice,
            package: packageSelection || null,
            plan: planSelection ? { 
                id: selectedPlanId, 
                selectedServiceIds: selectedPlanServices.map(s => s.id),
                pointsUsed: usedPlanPoints,
                totalPointsInBudget: totalPlanPoints,
                remainingPoints: (totalPlanPoints + extraPointsPurchased) - usedPlanPoints,
                extraPointsPurchased: extraPointsPurchased,
                extraPointsCost: extraPointsCost
            } : null,
            services: individualItems,
            type: dom.serviceTypeSelect.value,
            isTiered: false,
            isUrgent: isUrgent,
            status: 'Propuesta Guardada',
            dateUpdated: new Date().toISOString()
        };
    }

    let { tasks } = state.getState();
    if (editingIndex !== -1) {
        // Al editar, mantener el status original si no se provee uno nuevo, y actualizar la fecha.
        const originalTask = tasks[editingIndex];
        tasks[editingIndex] = { ...newTask, status: originalTask.status, dateUpdated: new Date().toISOString() };
    } else {
        tasks.push(newTask);
    }
    state.setTasks(tasks);
    showNotification('success', 'Propuesta Guardada', `La propuesta para ${newTask.webName} ha sido guardada.`);
    resetForm();
    saveTasks();
}

export function resetForm() {
    state.setEditingIndex(-1);
    document.getElementById('clientName').value = '';
    document.getElementById('webName').value = '';
    dom.serviceTypeSelect.value = 'puntual';
    dom.marginPercentageInput.value = '60';
    document.getElementById('isUrgentCheckbox').checked = false;
    toggleSelectionMode('puntual');
    clearAllSelections();
}

export function editTask(index) {
    const { tasks } = state.getState();
    const task = tasks[index];
    state.setEditingIndex(index);
    
    document.getElementById('clientName').value = task.clientName;
    document.getElementById('webName').value = task.webName;
    dom.marginPercentageInput.value = (task.margin * 100).toFixed(0);
    document.getElementById('isUrgentCheckbox').checked = task.isUrgent || false;
    
    if (task.isTiered) {
        showNotification('info', 'Editando Propuesta por Niveles', 'Abre el constructor de propuestas por niveles para editar los detalles.');
        // Opcional: abrir el modal directamente.
        // showTieredBuilderModal(task);
        return;
    }

    const selectionType = task.plan ? 'mensual' : 'puntual';
    dom.serviceTypeSelect.value = selectionType;
    toggleSelectionMode(selectionType);
    
    setTimeout(() => {
        clearAllSelections();
        if (task.package) {
            document.getElementById(`package-${task.package.id}`).checked = true;
        } else if (task.plan) {
            state.setExtraPointsPurchased(task.plan.extraPointsPurchased || 0);
            state.setExtraPointsCost(task.plan.extraPointsCost || 0);
            document.getElementById(`plan-${task.plan.id}`).checked = true;
            handlePlanSelection(task.plan.id, task.plan.selectedServiceIds);
        } else {
            state.setCustomServices(task.services.filter(s => s.type === 'custom'));
            task.services.filter(s => s.type === 'standard').forEach(svc => {
                const el = document.getElementById(`standard-${svc.id}`);
                if (el) el.checked = true;
            });
        }
        updateSelectedItems();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
}

export function deleteTask(index) {
    let { tasks, editingIndex } = state.getState();
    tasks.splice(index, 1);
    state.setTasks(tasks);
    saveTasks();
    showNotification('info', 'Propuesta Eliminada', `La propuesta ha sido eliminada.`);
    if (index === editingIndex) resetForm(); 
}

export function updateTaskStatus(index, newStatus) {
    let { tasks } = state.getState();
    if (tasks[index]) {
        tasks[index].status = newStatus;
        tasks[index].dateUpdated = new Date().toISOString();
        state.setTasks(tasks);
        saveTasks();
        showNotification('info', 'Estado Actualizado', `El estado de la propuesta para "${tasks[index].webName}" es ahora "${newStatus}".`);
    }
}

export function deleteLocalService(serviceId) {
    if (!confirm("¿Estás seguro de que quieres eliminar este servicio personalizado permanentemente? Esta acción no se puede deshacer.")) {
        return;
    }

    let { localServices } = state.getState();
    const serviceToRemove = localServices.find(s => s.id === serviceId);

    if (!serviceToRemove) {
        console.error(`Servicio local con ID ${serviceId} no encontrado.`);
        return;
    }

    const updatedServices = localServices.filter(s => s.id !== serviceId);
    state.setLocalServices(updatedServices);
    saveLocalServices();

    const serviceElement = document.getElementById(`standard-${serviceId}`);
    if (serviceElement) {
        const card = serviceElement.closest('.item-card');
        const grid = card.parentElement;
        card.remove();
        if (grid && grid.children.length === 0) {
            const container = grid.closest('#local-services-container');
            if (container) container.remove();
        }
    }
    
    showNotification('info', 'Servicio Eliminado', `El servicio "${serviceToRemove.name}" ha sido eliminado permanentemente.`);
}