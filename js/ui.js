// js/ui.js

import * as dom from './dom.js';
import { getState } from './state.js';

export function createServiceItemHTML(svc, type, name, isExclusive, categoryKey = null) {
    const pointCostHTML = svc.pointCost ? `<span class="font-bold text-yellow-400 text-xs">${svc.pointCost} Pts</span>` : '';
    const priceText = svc.price > 0 ? `$${svc.price.toFixed(2)} USD` : 'A cotizar';
    return `
        <div class="item-card tooltip-container flex items-center justify-between p-3 bg-slate-800 rounded-lg transition duration-150 cursor-pointer border border-slate-700">
            <label class="flex-grow cursor-pointer text-sm pr-2">${svc.name}</label>
            <div class="flex items-center gap-3">
                ${pointCostHTML}
                <span class="font-bold text-red-400">${priceText}</span>
                <input type="${isExclusive ? 'radio' : 'checkbox'}" name="${name}" class="${isExclusive ? 'custom-radio' : 'custom-checkbox'} ml-4"
                    id="${type}-${svc.id}" value="${svc.id}" data-price="${svc.price}" data-name="${svc.name}" data-type="${type}"
                    data-point-cost="${svc.pointCost || 0}" data-category-key="${categoryKey || ''}">
            </div>
            <div class="tooltip-content">${svc.description || 'Sin descripción.'}</div>
        </div>`;
}

export function initializeServiceCheckboxes() {
    const { allServices, localServices } = getState();
    let servicesHTML = Object.keys(allServices).map(key => {
        const category = allServices[key];
        const itemsHTML = category.items.map(svc => createServiceItemHTML(svc, category.isExclusive ? 'package' : 'standard', category.isExclusive ? 'selectionGroup' : `item-${svc.id}`, category.isExclusive, key)).join('');
        return `
            <div class="p-4 bg-slate-900 rounded-xl shadow-inner">
                <h3 class="text-xl font-semibold mb-3 accent-color">${category.name}</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${itemsHTML}</div>
            </div>`;
    }).join('');

    // Renderizar servicios locales guardados
    if (localServices.length > 0) {
        const localItemsHTML = localServices.map(svc => createServiceItemHTML(svc, 'standard', `item-${svc.id}`, false, 'local')).join('');
        servicesHTML += `
            <div id="local-services-container" class="p-4 bg-purple-900/20 rounded-xl shadow-inner border border-purple-700">
                <h3 class="text-xl font-semibold mb-3 text-purple-400">H. Servicios Personalizados (Guardados)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${localItemsHTML}</div>
            </div>`;
    }

    dom.servicesSelectionDiv.innerHTML = servicesHTML;
}

// NUEVA: Función para añadir dinámicamente un servicio local a la UI
export function appendLocalServiceToUI(service) {
    let container = document.getElementById('local-services-container');
    if (!container) {
        dom.servicesSelectionDiv.insertAdjacentHTML('beforeend', `
             <div id="local-services-container" class="p-4 bg-purple-900/20 rounded-xl shadow-inner border border-purple-700">
                <h3 class="text-xl font-semibold mb-3 text-purple-400">H. Servicios Personalizados (Guardados)</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
            </div>
        `);
        container = document.getElementById('local-services-container');
    }
    const grid = container.querySelector('.grid');
    const itemHTML = createServiceItemHTML(service, 'standard', `item-${service.id}`, false, 'local');
    grid.insertAdjacentHTML('beforeend', itemHTML);
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
            <h3 class="text-xl font-semibold mb-3 accent-color">Planes Mensuales (Exclusivos)</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${plansHTML}</div>
        </div>`;
}

export function renderTasksDashboard() {
    const { tasks, monthlyPlans } = getState();
    dom.tasksDashboardDiv.innerHTML = tasks.length === 0
        ? '<p class="text-slate-400">No hay propuestas guardadas.</p>'
        : tasks.map((task, index) => {
            let serviceList = '';
            let priceText = '';
            let icon = '';

            if (task.isTiered) {
                icon = '📊';
                const prices = task.tiers.map(t => t.totalDev).sort((a,b) => a-b);
                serviceList = `<span class="text-sm text-indigo-300 font-medium">Propuesta por Niveles: ${task.tiers.map(t => t.name).join(' / ')}</span>`;
                priceText = `<p class="text-xs text-red-300">Costos Dev: $${prices.map(p => p.toFixed(2)).join(' / ')}</p>`;
            } else if (task.package) {
                icon = '📦';
                serviceList = `<span class="text-sm text-cyan-300 font-medium">Paquete: ${task.package.name}</span>`;
                priceText = `<p class="text-xs text-red-300">Costo Dev: $${task.totalDev.toFixed(2)}</p><p class="text-sm font-bold text-green-400">Precio Cliente: $${task.totalClient.toFixed(2)}</p>`;
            } else if (task.plan) {
                icon = '📅';
                const planInfo = monthlyPlans.find(p => p.id == task.plan.id);
                const remainingText = task.plan.remainingPoints > 0 ? `<br><span class="text-xs text-yellow-400">Sobrante: ${task.plan.remainingPoints} Pts</span>` : '';
                serviceList = `<span class="text-sm text-cyan-300 font-medium">Plan: ${planInfo.name}</span>${remainingText}`;
                priceText = `<p class="text-xs text-red-300">Costo Dev: $${task.totalDev.toFixed(2)}</p><p class="text-sm font-bold text-green-400">Precio Cliente: $${task.totalClient.toFixed(2)}</p>`;
            } else {
                icon = '🧩';
                serviceList = `<span class="text-sm text-slate-300">${task.services.length} ítems individuales</span>`;
                priceText = `<p class="text-xs text-red-300">Costo Dev: $${task.totalDev.toFixed(2)}</p><p class="text-sm font-bold text-green-400">Precio Cliente: $${task.totalClient.toFixed(2)}</p>`;
            }

            return `
                <div class="p-3 border border-slate-700 rounded-lg bg-slate-800 transition duration-150 hover:bg-slate-700">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-base text-white"><span class="mr-2">${icon}</span>${task.clientName || 'Sin Cliente'} - ${task.webName || 'Sin Web'}</h4>
                        <div class="flex gap-2">
                            <button data-action="edit" data-index="${index}" class="text-blue-400 hover:text-blue-300 text-sm action-button">Editar</button>
                            <button data-action="delete" data-index="${index}" class="text-red-400 hover:text-red-300 text-sm action-button">Eliminar</button>
                        </div>
                    </div>
                    ${serviceList}
                    <p class="text-xs text-slate-400 mt-1">Margen: ${(task.margin * 100).toFixed(0)}%</p>
                    ${priceText}
                </div>`;
        }).join('');

    dom.exportPdfBtn.disabled = tasks.length === 0;
    dom.clearAllTasksBtn.disabled = tasks.length === 0;

    let grandTotalDev = tasks.reduce((sum, t) => sum + (t.isTiered ? 0 : t.totalDev), 0);
    let grandTotalClient = tasks.reduce((sum, t) => sum + (t.isTiered ? 0 : t.totalClient), 0);
    dom.grandTotalDevSpan.textContent = grandTotalDev.toFixed(2);
    dom.grandTotalClientSpan.textContent = grandTotalClient.toFixed(2);
    dom.totalProfitSpan.textContent = (grandTotalClient - grandTotalDev).toFixed(2);
}

// --- NUEVO: BRANDING ---
function applyBranding(logo, color) {
    const root = document.documentElement;
    if (color) {
        root.style.setProperty('--accent-color', color);
        let r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
        r = Math.max(0, r - 20); g = Math.max(0, g - 20); b = Math.max(0, b - 20);
        const hoverColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        root.style.setProperty('--accent-color-hover', hoverColor);
    }
    const logoDisplay = document.getElementById('brand-logo-display');
    if (logo) {
        logoDisplay.src = logo;
        logoDisplay.classList.remove('hidden');
        document.getElementById('main-title').classList.add('hidden');
    } else {
        logoDisplay.classList.add('hidden');
        document.getElementById('main-title').classList.remove('hidden');
    }
}

export function initializeBranding() {
    const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    applyBranding(brandInfo.logo, brandInfo.color);

    window.saveBranding = () => {
        const color = document.getElementById('brandColorInput').value;
        const logoInput = document.getElementById('brandLogoInput');
        const logoFile = logoInput.files[0];
        
        const currentInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
        const newInfo = { ...currentInfo, color: color };

        if (logoFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                newInfo.logo = e.target.result;
                localStorage.setItem('zenBrandInfo', JSON.stringify(newInfo));
                applyBranding(newInfo.logo, newInfo.color);
                window.closeBrandingModal();
            };
            reader.readAsDataURL(logoFile);
        } else {
            localStorage.setItem('zenBrandInfo', JSON.stringify(newInfo));
            applyBranding(newInfo.logo, newInfo.color);
            window.closeBrandingModal();
        }
    };
    
    document.getElementById('removeBrandLogo').addEventListener('click', () => {
        const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
        delete brandInfo.logo;
        localStorage.setItem('zenBrandInfo', JSON.stringify(brandInfo));
        applyBranding(null, brandInfo.color);
    });
}

// --- TOUR GUIADO (RECONSTRUIDO Y ROBUSTO) ---
export function initializeTour() {
    if (localStorage.getItem('zenTourCompleted')) return;

    const tourSteps = [
        { el: '#ai-assistant-container', text: '¡Bienvenido! Este es tu Asistente IA. Describe las necesidades de tu cliente aquí para recibir una recomendación de servicios.' },
        { el: '#proposal-details-container', text: 'Luego, completa los datos del cliente y del proyecto en esta sección.' },
        { el: '#solution-config-container', text: 'Aquí puedes seleccionar los servicios recomendados por la IA o elegirlos manualmente. Puedes escoger paquetes, planes mensuales o ítems individuales.' },
        { el: '#summaryCard', text: 'Define tu margen de ganancia. El sistema calculará automáticamente el precio final para tu cliente.' },
        { el: '#addTask', text: 'Cuando termines, guarda la propuesta aquí. Aparecerá en el panel de "Propuestas Guardadas".' },
        { el: '#saved-proposals-container', text: 'Desde aquí podrás editar, eliminar y generar los PDFs de todas tus propuestas.' },
        { el: '#tieredBuilderBtn', text: 'Consejo Pro: Usa el constructor por niveles para presentar 3 opciones a tu cliente (Básico, Recomendado, Completo). ¡Es una técnica de venta muy poderosa!' }
    ];
    let currentStep = 0;

    const tooltip = document.getElementById('tour-tooltip');
    const tourText = document.getElementById('tour-text');
    const stepCounter = document.getElementById('tour-step-counter');
    const prevBtn = document.getElementById('tour-prev');
    const nextBtn = document.getElementById('tour-next');
    const endBtn = document.getElementById('tour-end');

    function showStep(index) {
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    
        if (index >= tourSteps.length) {
            endTour();
            return;
        }

        currentStep = index;
        const step = tourSteps[index];
        const targetElement = document.querySelector(step.el);

        // Comprobación de visibilidad
        if (!targetElement || targetElement.offsetParent === null) {
            console.warn(`Tour step ${index + 1} target (${step.el}) not found or not visible. Ending tour.`);
            endTour();
            return;
        }

        targetElement.classList.add('tour-highlight');
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        tourText.textContent = step.text;
        stepCounter.textContent = `Paso ${index + 1} de ${tourSteps.length}`;
        tooltip.classList.remove('hidden');

        // Posicionamiento inteligente con requestAnimationFrame
        requestAnimationFrame(() => {
            const targetRect = targetElement.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const spaceAbove = targetRect.top;
            const spaceBelow = window.innerHeight - targetRect.bottom;
            
            let top, left;

            if (spaceBelow > tooltipRect.height + 20) {
                // Posicionar debajo
                top = targetRect.bottom + 10 + window.scrollY;
            } else if (spaceAbove > tooltipRect.height + 20) {
                // Posicionar encima
                top = targetRect.top - tooltipRect.height - 10 + window.scrollY;
            } else {
                 // Fallback al centro de la pantalla
                top = (window.innerHeight - tooltipRect.height) / 2 + window.scrollY;
            }

            left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

            // Comprobación de límites horizontales
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }

            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
        });

        prevBtn.style.display = index === 0 ? 'none' : 'inline-block';
        nextBtn.textContent = index === tourSteps.length - 1 ? 'Finalizar Tour' : 'Siguiente';
    }
    
    function endTour() {
        const highlighted = document.querySelector('.tour-highlight');
        if (highlighted) highlighted.classList.remove('tour-highlight');
        tooltip.classList.add('hidden');
        localStorage.setItem('zenTourCompleted', 'true');
    }

    nextBtn.addEventListener('click', () => showStep(currentStep + 1));
    prevBtn.addEventListener('click', () => showStep(currentStep - 1));
    endBtn.addEventListener('click', endTour);

    // Iniciar el tour
    showStep(0);
}


export function initializeUI() {
    initializeServiceCheckboxes();
    initializeMonthlyPlansSelection();
}
