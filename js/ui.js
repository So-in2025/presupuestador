// js/ui.js

import * as dom from './dom.js';
import { getState, formatPrice } from './state.js';
import { updateSummary } from './app.js';

export function updateCurrencyToggleButton() {
    const { currentCurrency, usdToArsRate } = getState();
    const btn = document.getElementById('currency-toggle-btn');
    if (!btn) return;

    if (!usdToArsRate) {
        btn.disabled = true;
        btn.textContent = 'Configurar ARS';
        return;
    }

    btn.disabled = false;
    if (currentCurrency === 'USD') {
        btn.textContent = `Ver en ARS`;
    } else {
        btn.textContent = `Ver en USD`;
    }
}

export function createServiceItemHTML(svc, type, name, isExclusive, categoryKey = null, showPoints = false) {
    const pointCostHTML = showPoints && svc.pointCost ? `<span class="font-bold text-yellow-400 text-xs">${svc.pointCost} Pts</span>` : '';
    const priceText = svc.price > 0 ? formatPrice(svc.price) : 'A cotizar';
    const deleteButtonHTML = categoryKey === 'local' ? `
        <button data-action="delete-local-service" data-id="${svc.id}" class="absolute top-1 right-1 p-1 rounded-full text-purple-300 hover:text-red-400 hover:bg-slate-700 transition-colors z-10 btn-press-feedback" title="Eliminar servicio permanentemente">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
        </button>
    ` : '';

    return `
        <div class="item-card tooltip-container relative flex items-center justify-between p-3 bg-slate-800 rounded-lg transition duration-150 cursor-pointer border border-slate-700">
            ${deleteButtonHTML}
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
    let servicesHTML = Object.keys(allServices).map((key, index) => {
        const category = allServices[key];
        const itemsHTML = category.items.map(svc => createServiceItemHTML(svc, category.isExclusive ? 'package' : 'standard', category.isExclusive ? 'selectionGroup' : `item-${svc.id}`, category.isExclusive, key, false)).join('');
        const isOpenClass = index === 0 ? 'is-open' : '';
        return `
            <div class="accordion-item bg-slate-900 rounded-xl shadow-inner ${isOpenClass}">
                <button class="accordion-header p-4 w-full">
                    <h3 class="text-xl font-semibold accent-color">${category.name}</h3>
                    <svg class="accordion-chevron h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div class="accordion-content px-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${itemsHTML}</div>
                </div>
            </div>`;
    }).join('');

    // Renderizar servicios locales guardados
    if (localServices.length > 0) {
        const localItemsHTML = localServices.map(svc => createServiceItemHTML(svc, 'standard', `item-${svc.id}`, false, 'local', false)).join('');
        servicesHTML += `
            <div id="local-services-container" class="accordion-item bg-purple-900/20 rounded-xl shadow-inner border border-purple-700">
                 <button class="accordion-header p-4 w-full">
                    <h3 class="text-xl font-semibold text-purple-400">H. Servicios Personalizados (Guardados)</h3>
                     <svg class="accordion-chevron h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div class="accordion-content px-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${localItemsHTML}</div>
                </div>
            </div>`;
    }

    dom.servicesSelectionDiv.innerHTML = servicesHTML;
}

// NUEVA: Función para añadir dinámicamente un servicio local a la UI
export function appendLocalServiceToUI(service) {
    let container = document.getElementById('local-services-container');
    if (!container) {
        dom.servicesSelectionDiv.insertAdjacentHTML('beforeend', `
             <div id="local-services-container" class="accordion-item bg-purple-900/20 rounded-xl shadow-inner border border-purple-700">
                <button class="accordion-header p-4 w-full">
                    <h3 class="text-xl font-semibold text-purple-400">H. Servicios Personalizados (Guardados)</h3>
                     <svg class="accordion-chevron h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <div class="accordion-content px-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
                </div>
            </div>
        `);
        container = document.getElementById('local-services-container');
    }
    const grid = container.querySelector('.grid');
    const itemHTML = createServiceItemHTML(service, 'standard', `item-${service.id}`, false, 'local', false);
    grid.insertAdjacentHTML('beforeend', itemHTML);
}


export function initializeMonthlyPlansSelection() {
    const { monthlyPlans } = getState();
    dom.monthlyPlansContainer.innerHTML = '';
    if (!monthlyPlans || monthlyPlans.length === 0) return;

    const plansHTML = monthlyPlans.map(plan => `
        <div class="item-card tooltip-container flex items-center justify-between p-3 bg-slate-800 rounded-lg transition duration-150 cursor-pointer border border-slate-700">
            <label class="flex-grow cursor-pointer text-sm pr-2">${plan.name}</label>
            <span class="font-bold text-red-400 ml-2">${formatPrice(plan.price)}</span>
            <input type="radio" name="monthlyPlanSelection" class="custom-radio ml-4" id="plan-${plan.id}" value="${plan.id}"
                data-price="${plan.price}" data-name="${plan.name}" data-points="${plan.points}">
            <div class="tooltip-content">${plan.description || 'Sin descripción.'}</div>
        </div>`).join('');

    dom.monthlyPlansContainer.innerHTML = `
        <div class="accordion-item bg-slate-900 rounded-xl shadow-inner is-open">
            <button class="accordion-header p-4 w-full">
                <h3 class="text-xl font-semibold accent-color">Planes Mensuales (Exclusivos)</h3>
                <svg class="accordion-chevron h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div class="accordion-content px-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${plansHTML}</div>
            </div>
        </div>`;
}

export function renderTasksDashboard() {
    const dashboard = dom.tasksDashboardDiv;
    dashboard.style.opacity = '0';
    
    const statuses = ['Propuesta Guardada', 'Enviada', 'En Negociación', 'Ganada', 'Perdida'];

    setTimeout(() => {
        const { tasks, monthlyPlans } = getState();
        dashboard.innerHTML = tasks.length === 0
            ? '<p class="text-slate-400">No hay propuestas guardadas.</p>'
            : tasks.map((task, index) => {
                const statusOptions = statuses.map(s => `<option value="${s}" ${task.status === s ? 'selected' : ''}>${s}</option>`).join('');
                const statusSelectHTML = `
                    <select data-index="${index}" class="task-status-select styled-select styled-input text-xs p-1 w-full mt-2">
                        ${statusOptions}
                    </select>`;

                let serviceList = '';
                let icon = '';
                const isUrgent = task.isUrgent;

                const urgentLabelHTML = isUrgent ? '<span class="ml-2 text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">URGENTE</span>' : '';

                if (task.isTiered) {
                    icon = '📊';
                    serviceList = `<span class="text-sm text-indigo-300 font-medium">Propuesta por Niveles: ${task.tiers.map(t => t.name).join(' / ')}</span>`;
                } else if (task.package) {
                    icon = '📦';
                    serviceList = `<span class="text-sm text-cyan-300 font-medium">Paquete: ${task.package.name}</span>`;
                } else if (task.plan) {
                    icon = '📅';
                    const planInfo = monthlyPlans.find(p => p.id == task.plan.id);
                    serviceList = `<span class="text-sm text-cyan-300 font-medium">Plan: ${planInfo.name}</span>`;
                } else {
                    icon = '🧩';
                    serviceList = `<span class="text-sm text-slate-300">${task.services.length} ítems individuales</span>`;
                }

                return `
                    <div class="p-3 border ${isUrgent ? 'border-red-500' : 'border-slate-700'} rounded-lg bg-slate-800 transition duration-150 hover:bg-slate-700">
                        <div class="flex justify-between items-start mb-1">
                            <div>
                                <h4 class="font-bold text-base text-white"><span class="mr-2">${icon}</span>${task.clientName || 'Sin Cliente'} - ${task.webName || 'Sin Web'}</h4>
                                ${serviceList}
                                ${urgentLabelHTML}
                            </div>
                            <div class="flex gap-2">
                                <button data-action="edit" data-index="${index}" class="text-blue-400 hover:text-blue-300 text-sm action-button rounded-md transition">Editar</button>
                                <button data-action="delete" data-index="${index}" class="text-red-400 hover:text-red-300 text-sm action-button rounded-md transition">Eliminar</button>
                            </div>
                        </div>
                        ${statusSelectHTML}
                    </div>`;
            }).join('');

        dom.exportPdfBtn.disabled = tasks.length === 0;
        dom.clearAllTasksBtn.disabled = tasks.length === 0;

        updatePerformanceDashboard();
        
        dashboard.style.opacity = '1';
    }, 300); // Coincide con la duración de la transición
}

export function updatePerformanceDashboard() {
    const { tasks } = getState();
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const wonThisMonth = tasks.filter(t => {
        const updatedDate = new Date(t.dateUpdated);
        return t.status === 'Ganada' && updatedDate >= firstDayOfMonth;
    });

    const salesThisMonth = wonThisMonth.reduce((sum, t) => sum + (t.totalClient || 0), 0);
    const profitThisMonth = wonThisMonth.reduce((sum, t) => sum + ((t.totalClient || 0) - (t.totalDev || 0)), 0);
    
    const activePipelineTasks = tasks.filter(t => t.status !== 'Ganada' && t.status !== 'Perdida');
    const activePipelineValue = activePipelineTasks.reduce((sum, t) => sum + (t.totalClient || 0), 0);

    const closedTasks = tasks.filter(t => t.status === 'Ganada' || t.status === 'Perdida');
    const wonTasksCount = tasks.filter(t => t.status === 'Ganada').length;
    const closeRate = closedTasks.length > 0 ? (wonTasksCount / closedTasks.length) * 100 : 0;

    document.getElementById('sales-this-month').innerHTML = formatPrice(salesThisMonth);
    document.getElementById('profit-this-month').innerHTML = formatPrice(profitThisMonth);
    document.getElementById('active-pipeline-value').innerHTML = formatPrice(activePipelineValue);
    document.getElementById('close-rate').textContent = `${closeRate.toFixed(0)}%`;
}


export function rerenderAllPrices() {
    initializeServiceCheckboxes();
    initializeMonthlyPlansSelection();
    renderTasksDashboard();
    updateSummary();
    updateCurrencyToggleButton();
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

export function saveBranding() {
    const color = document.getElementById('brandColorInput').value;
    const logoInput = document.getElementById('brandLogoInput');
    const logoFile = logoInput.files[0];
    const resellerInfo = document.getElementById('brandResellerInfo').value;
    const terms = document.getElementById('brandTerms').value;
    
    const currentInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    const newInfo = { 
        ...currentInfo, 
        color,
        resellerInfo,
        terms 
    };

    if (logoFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
            newInfo.logo = e.target.result;
            localStorage.setItem('zenBrandInfo', JSON.stringify(newInfo));
            applyBranding(newInfo.logo, newInfo.color);
            document.getElementById('close-branding-modal-btn').click();
        };
        reader.readAsDataURL(logoFile);
    } else {
        localStorage.setItem('zenBrandInfo', JSON.stringify(newInfo));
        applyBranding(newInfo.logo, newInfo.color);
        document.getElementById('close-branding-modal-btn').click();
    }
}

export function initializeBranding() {
    const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
    applyBranding(brandInfo.logo, brandInfo.color);

    document.getElementById('removeBrandLogo').addEventListener('click', () => {
        const brandInfo = JSON.parse(localStorage.getItem('zenBrandInfo') || '{}');
        delete brandInfo.logo;
        localStorage.setItem('zenBrandInfo', JSON.stringify(brandInfo));
        applyBranding(null, brandInfo.color);
    });
}

// --- TOUR GUIADO (RECONSTRUIDO Y ROBUSTO) ---
const tourSteps = [
    { el: '#ai-assistant-container', text: '¡Bienvenido a Proyecto Zen! Este es tu Asistente IA. Describe aquí la necesidad de tu cliente y recibirás una propuesta de servicios al instante.' },
    { el: '#proposal-details-container', text: 'Luego, completa los datos básicos del cliente y del proyecto en esta sección.' },
    { el: '#solution-config-container', text: 'Aquí puedes seleccionar los servicios recomendados por la IA o elegirlos manualmente. Tienes total flexibilidad.' },
    { el: '#summaryCard', text: 'Ajusta tu margen de ganancia. El sistema calculará el precio final para tu cliente en tiempo real, dándote control total sobre tu rentabilidad.' },
    { el: '#addTask', text: 'Cuando termines, guarda la propuesta. Se añadirá a tu panel de "Propuestas Guardadas".' },
    { el: '#saved-proposals-container', text: 'Desde este panel podrás gestionar todo tu pipeline de ventas: edita, elimina y genera los documentos PDF de todas tus propuestas.' },
    { el: '#tieredBuilderBtn', text: 'Consejo Pro: Usa el constructor por niveles para presentar 3 opciones a tu cliente (Básico, Recomendado, Completo). ¡Es una técnica de venta muy poderosa!' }
];

let currentStep = 0;
let isTourActive = false;

const tooltip = document.getElementById('tour-tooltip');
const tourOverlay = document.getElementById('tour-overlay');
const tourText = document.getElementById('tour-text');
const stepCounter = document.getElementById('tour-step-counter');
const prevBtn = document.getElementById('tour-prev');
const nextBtn = document.getElementById('tour-next');
const endBtn = document.getElementById('tour-end');

function positionTooltip(targetElement) {
    if (!isTourActive || !targetElement) return;

    requestAnimationFrame(() => {
        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const spaceAbove = targetRect.top;
        const spaceBelow = window.innerHeight - targetRect.bottom;
        
        let top, left;

        // Posicionar verticalmente (preferir abajo)
        if (spaceBelow > tooltipRect.height + 20) {
            top = targetRect.bottom + 10;
        } else if (spaceAbove > tooltipRect.height + 20) {
            top = targetRect.top - tooltipRect.height - 10;
        } else {
            // Centrar si no hay espacio
            top = (window.innerHeight - tooltipRect.height) / 2;
        }

        // Posicionar horizontalmente
        left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
        
        // Ajustar si se sale de la pantalla
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    });
}


function showStep(index) {
    document.querySelector('.tour-highlight-active')?.classList.remove('tour-highlight-active');

    if (index >= tourSteps.length) {
        endTour();
        return;
    }

    currentStep = index;
    const step = tourSteps[index];
    const targetElement = document.querySelector(step.el);

    // --- ROBUSTEZ: Manejo de elemento no visible ---
    if (!targetElement || !(targetElement.offsetWidth || targetElement.offsetHeight || targetElement.getClientRects().length)) {
        console.warn(`Tour step ${index + 1} target (${step.el}) not found or not visible. Ending tour.`);
        endTour();
        return;
    }

    targetElement.classList.add('tour-highlight-active');
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // Esperar a que el scroll termine para posicionar
    setTimeout(() => {
        tourText.textContent = step.text;
        stepCounter.textContent = `Paso ${index + 1} de ${tourSteps.length}`;
        tooltip.classList.remove('hidden');
        tourOverlay.classList.remove('hidden');
        positionTooltip(targetElement);
    }, 350);

    prevBtn.style.display = index === 0 ? 'none' : 'inline-block';
    nextBtn.textContent = index === tourSteps.length - 1 ? 'Finalizar Tour' : 'Siguiente';
}

function endTour() {
    if (!isTourActive) return;
    isTourActive = false;
    document.querySelector('.tour-highlight-active')?.classList.remove('tour-highlight-active');
    tooltip.classList.add('hidden');
    tourOverlay.classList.add('hidden');
    localStorage.setItem('zenTourCompleted', 'true');
    window.removeEventListener('resize', () => positionTooltip(document.querySelector('.tour-highlight-active')));
}


export function initializeTour() {
    if (localStorage.getItem('zenTourCompleted') === 'true') return;

    // Asignar listeners solo una vez para evitar duplicados
    if (!window.tourListenersAttached) {
        nextBtn.addEventListener('click', () => showStep(currentStep + 1));
        prevBtn.addEventListener('click', () => showStep(currentStep - 1));
        endBtn.addEventListener('click', endTour);
        window.tourListenersAttached = true;
    }

    let attempts = 0;
    const maxAttempts = 50;
    const checkInterval = setInterval(() => {
        const initialStepElement = document.querySelector(tourSteps[0].el);
        if (initialStepElement && initialStepElement.offsetParent !== null) {
            clearInterval(checkInterval);
            isTourActive = true;
            showStep(0);
            window.addEventListener('resize', () => positionTooltip(document.querySelector('.tour-highlight-active')));
        } else {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(checkInterval);
                console.warn("Tour could not start because the initial element was not found.");
            }
        }
    }, 100);
}


export function restartTour() {
    endTour();
    localStorage.removeItem('zenTourCompleted');
    setTimeout(() => initializeTour(), 100);
}

export function initializeUI() {
    initializeServiceCheckboxes();
    initializeMonthlyPlansSelection();
}