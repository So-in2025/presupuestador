
// js/points.js

import * as dom from './dom.js';
import { getState, setSelectedPlanId, setTotalPlanPoints, setUsedPlanPoints, setSelectedPlanServices } from './state.js';
import { createServiceItemHTML } from './ui.js';
import { updateSelectedItems } from './app.js';

export function handlePlanSelection(planId, preSelectedIds = []) {
    const { monthlyPlans, allServices } = getState();
    const plan = monthlyPlans.find(p => p.id == planId);
    if (!plan) return;

    setSelectedPlanId(planId);
    setTotalPlanPoints(plan.points);
    
    let initialUsedPoints = 0;
    let initialSelectedServices = [];

    dom.servicesTabsDiv.innerHTML = Object.keys(allServices).filter(k => !allServices[k].isExclusive).map(key => {
        const category = allServices[key];
        const itemsHTML = category.items.map(svc => createServiceItemHTML(svc, 'plan-service', `plan-service-${key}`, false, key)).join('');
        return `
            <div class="p-4 bg-slate-900 rounded-xl shadow-inner">
                <h3 class="text-xl font-semibold mb-3 text-cyan-500">${category.name}</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${itemsHTML}</div>
            </div>`;
    }).join('');
    
    // Pre-seleccionar ítems si se está editando
    preSelectedIds.forEach(serviceId => {
        const checkbox = document.getElementById(`plan-service-${serviceId}`);
        if (checkbox) {
            checkbox.checked = true;
            const pointCost = parseInt(checkbox.dataset.pointCost);
            initialUsedPoints += pointCost;
            initialSelectedServices.push({ id: checkbox.value, name: checkbox.dataset.name, type: 'plan-service', price: 0, pointCost: pointCost });
        }
    });

    setUsedPlanPoints(initialUsedPoints);
    setSelectedPlanServices(initialSelectedServices);
    
    updatePointSystemUI();
}

export function handleServiceSelection(checkbox, isChecked) {
    let { usedPlanPoints, selectedPlanServices } = getState();
    const pointCost = parseInt(checkbox.dataset.pointCost);
    const serviceId = checkbox.value;
    const serviceName = checkbox.dataset.name;
    
    if (isChecked) {
        usedPlanPoints += pointCost;
        selectedPlanServices.push({ id: serviceId, name: serviceName, type: 'plan-service', price: 0, pointCost: pointCost });
    } else {
        usedPlanPoints -= pointCost;
        selectedPlanServices = selectedPlanServices.filter(s => s.id !== serviceId);
    }
    setUsedPlanPoints(usedPlanPoints);
    setSelectedPlanServices(selectedPlanServices);
    
    updatePointSystemUI();
    updateSelectedItems();
}

export function updatePointSystemUI() {
    const { usedPlanPoints, totalPlanPoints } = getState();
    dom.planPointsCounterSpan.textContent = `${usedPlanPoints} / ${totalPlanPoints}`;
    const remainingPoints = totalPlanPoints - usedPlanPoints;

    const allServiceCheckboxes = dom.monthlyServicesContainer.querySelectorAll('input[type="checkbox"]');
    allServiceCheckboxes.forEach(cb => {
        const servicePointCost = parseInt(cb.dataset.pointCost);
        if (!cb.checked && servicePointCost > remainingPoints) {
            cb.disabled = true;
            cb.closest('.item-card').classList.add('item-disabled');
        } else {
            cb.disabled = false;
            cb.closest('.item-card').classList.remove('item-disabled');
        }
    });
}
