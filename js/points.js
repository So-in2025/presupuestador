// js/points.js

import * as dom from './dom.js';
import { getState, setSelectedPlanId, setTotalPlanPoints, setUsedPlanPoints, setSelectedPlanServices, setExtraPointsPurchased, setExtraPointsCost } from './state.js';
import { createServiceItemHTML } from './ui.js';
import { updateSelectedItems } from './app.js';

export function handlePlanSelection(planId, preSelectedIds = []) {
    const { monthlyPlans, allServices } = getState();
    const plan = monthlyPlans.find(p => p.id == planId);
    if (!plan) return;
    
    // Resetear puntos extra al seleccionar un nuevo plan
    setExtraPointsPurchased(0);
    setExtraPointsCost(0);

    setSelectedPlanId(planId);
    setTotalPlanPoints(plan.points);
    
    let initialUsedPoints = 0;
    let initialSelectedServices = [];

    dom.servicesTabsDiv.innerHTML = Object.keys(allServices).filter(k => !allServices[k].isExclusive).map((key, index) => {
        const category = allServices[key];
        const itemsHTML = category.items.map(svc => createServiceItemHTML(svc, 'plan-service', `plan-service-${key}`, false, key, true)).join('');
        const isOpenClass = index === 0 ? 'is-open' : '';
        return `
            <div class="accordion-item bg-slate-900 rounded-xl shadow-inner ${isOpenClass}">
                <button class="accordion-header p-4 w-full">
                    <h3 class="text-xl font-semibold text-cyan-500">${category.name}</h3>
                    <svg class="accordion-chevron h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div class="accordion-content px-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${itemsHTML}</div>
                </div>
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
    
    document.getElementById('buyExtraPointsBtn').classList.remove('hidden');
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
    const { usedPlanPoints, totalPlanPoints, extraPointsPurchased } = getState();
    const availablePoints = totalPlanPoints + extraPointsPurchased;

    if (!dom.planPointsCounterSpan) return;
    
    dom.planPointsCounterSpan.textContent = `${usedPlanPoints} / ${availablePoints}`;
    const remainingPoints = availablePoints - usedPlanPoints;

    const allServiceCheckboxes = dom.monthlyServicesContainer.querySelectorAll('input[type="checkbox"]');
    allServiceCheckboxes.forEach(cb => {
        const servicePointCost = parseInt(cb.dataset.pointCost);
        const card = cb.closest('.item-card');
        const tooltip = card.querySelector('.tooltip-content');

        if (!cb.checked && servicePointCost > remainingPoints) {
            cb.disabled = true;
            card.classList.add('item-disabled');
            if (tooltip) {
                const needed = servicePointCost - remainingPoints;
                tooltip.innerHTML = `Necesitas <strong>${needed}</strong> punto${needed > 1 ? 's' : ''} más para añadir este servicio. <span class="text-yellow-300">Compra puntos extra para activarlo.</span>`;
            }
        } else {
            cb.disabled = false;
            card.classList.remove('item-disabled');
             if (tooltip) {
                const serviceId = cb.value;
                const categoryKey = cb.dataset.categoryKey;
                const { allServices } = getState();
                const service = allServices[categoryKey]?.items.find(s => s.id === serviceId);
                if (service) tooltip.textContent = service.description;
            }
        }
    });

    const buyButton = document.getElementById('buyExtraPointsBtn');
    if (buyButton) {
        const planSelected = !!getState().selectedPlanId;
        buyButton.classList.toggle('hidden', !planSelected);
    }
}