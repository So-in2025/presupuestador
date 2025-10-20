// js/ui.js

import * as dom from './dom.js';
import { getState } from './state.js';

export function createServiceItemHTML(svc, type, name, isExclusive, categoryKey = null) {
    const pointCostHTML = svc.pointCost ? `<span class="font-bold text-yellow-400 text-xs">${svc.pointCost} Pts</span>` : '';
    return `
        <div class="item-card tooltip-container flex items-center justify-between p-3 bg-slate-800 rounded-lg transition duration-150 cursor-pointer border border-slate-700">
            <label class="flex-grow cursor-pointer text-sm pr-2">${svc.name}</label>
            <div class="flex items-center gap-3">
                ${pointCostHTML}
                <span class="font-bold text-red-400">${svc.price > 0 ? `$${svc.price.toFixed(2)} USD` : ''}</span>
                <input type="${isExclusive ? 'radio' : 'checkbox'}" name="${name}" class="${isExclusive ? 'custom-radio' : 'custom-checkbox'} ml-4"
                    id="${type}-${svc.id}" value="${svc.id}" data-price="${svc.price}" data-name="${svc.name}" data-type="${type}"
                    data-point-cost="${svc.pointCost || 0}" data-category-key="${categoryKey || ''}">
            </div>
            <div class="tooltip-content">${svc.description || 'Sin descripción.'}</div>
        </div>`;
}

export function initializeServiceCheckboxes() {
    const { allServices } = getState();
    dom.servicesSelectionDiv.innerHTML = Object.keys(allServices).map(key => {
        const category = allServices[key];
        const itemsHTML = category.items.map(svc => createServiceItemHTML(svc, category.isExclusive ? 'package' : 'standard', category.isExclusive ? 'selectionGroup' : `item-${svc.id}`, category.isExclusive, key)).join('');
        return `
            <div class="p-4 bg-slate-900 rounded-xl shadow-inner">
                <h3 class="text-xl font-semibold mb-3 text-cyan-500">${category.name}</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${itemsHTML}</div>
            </div>`;
    }).join('');
}

export function initializeMonthlyPlansSelection() {
    const { monthlyPlans } = getState();
    dom.monthlyPlansContainer.innerHTML = '';
    if (!monthlyPlans || monthlyPlans.length === 0) return;

    const plansHTML = monthlyPlans.map(plan => `
        <div class="item-card tooltip-container flex items-center justify-between p-3 bg-slate-800 rounded-lg transition duration-150 cursor-pointer border border-slate-700">
            <label class="flex-grow cursor-pointer text-sm pr-2">${plan.name}</label>
            <span class="font-bold text-red-400 ml-2">$${plan.price.toFixed(2)} USD</span>
            <input type="radio" name="monthlyPlanSelection" class="custom-radio ml-4" id="plan-${plan.id}" value="${plan.id}"
                data-price="${plan.price}" data-name="${plan.name}" data-points="${plan.points}">
            <div class="tooltip-content">${plan.description || 'Sin descripción.'}</div>
        </div>`).join('');

    dom.monthlyPlansContainer.innerHTML = `
        <div class="p-4 bg-slate-900 rounded-xl shadow-inner">
            <h3 class="text-xl font-semibold mb-3 text-cyan-500">Planes Mensuales (Exclusivos)</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${plansHTML}</div>
        </div>`;
}

export function renderTasksDashboard() {
    const { tasks, monthlyPlans } = getState();
    dom.tasksDashboardDiv.innerHTML = tasks.length === 0
        ? '<p class="text-slate-400">No hay tareas guardadas.</p>'
        : tasks.map((task, index) => {
            let serviceList = '';
            if (task.package) {
                serviceList = `<span class="text-sm text-cyan-300 font-medium">Paquete: ${task.package.name}</span>`;
            } else if (task.plan) {
                const planInfo = monthlyPlans.find(p => p.id == task.plan.id);
                const remainingText = task.plan.remainingPoints > 0 ? `<br><span class="text-xs text-yellow-400">Sobrante: ${task.plan.remainingPoints} Pts</span>` : '';
                serviceList = `<span class="text-sm text-cyan-300 font-medium">Plan: ${planInfo.name}</span>${remainingText}`;
            } else {
                serviceList = `<span class="text-sm text-slate-300">${task.services.length} ítems individuales</span>`;
            }

            return `
                <div class="p-3 border border-slate-700 rounded-lg bg-slate-800 transition duration-150 hover:bg-slate-700">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-base text-white">${task.clientName || 'Sin Cliente'} - ${task.webName || 'Sin Web'}</h4>
                        <div class="flex gap-2">
                            <button data-action="edit" data-index="${index}" class="text-blue-400 hover:text-blue-300 text-sm action-button">Editar</button>
                            <button data-action="delete" data-index="${index}" class="text-red-400 hover:text-red-300 text-sm action-button">Eliminar</button>
                        </div>
                    </div>
                    ${serviceList}
                    <p class="text-xs text-slate-400 mt-1">Margen: ${(task.margin * 100).toFixed(0)}%</p>
                    <p class="text-xs text-red-300">Costo Dev: $${task.totalDev.toFixed(2)}</p>
                    <p class="text-sm font-bold text-green-400">Precio Cliente: $${task.totalClient.toFixed(2)}</p>
                </div>`;
        }).join('');

    dom.exportPdfBtn.disabled = tasks.length === 0;
    dom.clearAllTasksBtn.disabled = tasks.length === 0;

    let grandTotalDev = tasks.reduce((sum, t) => sum + t.totalDev, 0);
    let grandTotalClient = tasks.reduce((sum, t) => sum + t.totalClient, 0);
    dom.grandTotalDevSpan.textContent = grandTotalDev.toFixed(2);
    dom.grandTotalClientSpan.textContent = grandTotalClient.toFixed(2);
    dom.totalProfitSpan.textContent = (grandTotalClient - grandTotalDev).toFixed(2);
}

export function initializeUI() {
    initializeServiceCheckboxes();
    initializeMonthlyPlansSelection();
}