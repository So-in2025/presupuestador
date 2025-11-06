// js/main.js

import * as dom from './dom.js';
import * as state from './state.js';
import { loadPricingData, loadLocalData, saveTasks } from './data.js';
import { resetForm, handleAddTask, clearAllSelections, toggleSelectionMode, updateSelectedItems, deleteTask, editTask, deleteLocalService, updateTaskStatus } from './app.js';
import { handleServiceSelection, handlePlanSelection } from './points.js';
import { 
    removeCustomService, 
    showNotification,
    closeNotificationModal,
    showCustomServiceModal,
    closeCustomServiceModal,
    addCustomServiceToSelection,
    showPdfOptionsModal,
    closePdfOptionsModal,
    showBrandingModal,
    closeBrandingModal,
    showTieredBuilderModal,
    closeTieredBuilderModal,
    addTieredProposal,
    showExtraPointsModal,
    closeExtraPointsModal,
    addExtraPoints,
    showExchangeRateModal,
    closeExchangeRateModal,
    handleSaveExchangeRate,
    showContentStudioModal,
    closeContentStudioModal,
    showLeadGenPlanModal,
    showSalesChannelsModal,
    closeSalesChannelsModal,
    showOpportunityRadarModal
} from './modals.js';
import { initializeBranding, rerenderAllPrices, updateCurrencyToggleButton, saveBranding, initializeGuidedMode, updateActiveStep } from './ui.js';
import { initializeChatAssistant } from './chat-frontend.js';
import { generatePdf } from './pdf.js';
import { ttsManager } from './tts.js'; // Importar el gestor centralizado

// --- LÓGICA MODO ENFOQUE CHAT ---
const chatContainer = document.getElementById('ai-assistant-container');
const focusContainer = document.getElementById('ai-chat-focus-container');
const originalChatParent = chatContainer.parentElement;
const toggleFocusBtn = document.getElementById('toggle-chat-focus-btn');
const expandIcon = document.getElementById('focus-icon-expand');
const collapseIcon = document.getElementById('focus-icon-collapse');
let isChatFocused = false;

function toggleChatFocusMode() {
    isChatFocused = !isChatFocused;

    if (isChatFocused) {
        // Expandir
        focusContainer.appendChild(chatContainer);
        focusContainer.classList.remove('hidden');
        setTimeout(() => focusContainer.classList.remove('opacity-0'), 10);
        chatContainer.classList.add('is-focused');
        expandIcon.classList.add('hidden');
        collapseIcon.classList.remove('hidden');
        toggleFocusBtn.setAttribute('title', 'Salir del Modo Enfoque');
    } else {
        // Encoger
        focusContainer.classList.add('opacity-0');
        setTimeout(() => {
            focusContainer.classList.add('hidden');
            // Reinsertar en la posición correcta (después del primer elemento, que es #proposal-details-container)
            originalChatParent.insertBefore(chatContainer, originalChatParent.children[1]); 
        }, 300); // Coincide con la duración de la transición
        chatContainer.classList.remove('is-focused');
        expandIcon.classList.remove('hidden');
        collapseIcon.classList.add('hidden');
        toggleFocusBtn.setAttribute('title', 'Activar Modo Enfoque');
    }
}


// --- LÓGICA DEL SPLASH SCREEN ---
function initializeSplashScreen() {
    const startBtn = document.getElementById('start-app-btn');
    const detailsBtn = document.getElementById('toggle-details-btn');
    const detailsSection = document.getElementById('detailsSection');
    const splashScreen = document.getElementById('splash-screen');
    const readAloudBtn = document.getElementById('read-aloud-btn');

    startBtn.addEventListener('click', () => {
        ttsManager.stop();
        splashScreen.style.opacity = '0';
        splashScreen.style.pointerEvents = 'none';
        
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            updateApiKeyUI();
            updateCurrencyToggleButton();
        }, 500);
    });

    detailsBtn.addEventListener('click', () => {
        detailsSection.classList.toggle('open');
    });

    // --- LÓGICA DE LECTURA REFACTORIZADA ---
    readAloudBtn.addEventListener('click', () => {
        const contentElements = document.querySelectorAll('#detailsSection [data-tts-content]');
        ttsManager.speakQueue(contentElements, readAloudBtn);
    });
}


// --- GESTIÓN DE API KEY UI ---
function updateApiKeyUI(forceShow = false) {
    const apiKeyOverlay = document.getElementById('api-key-overlay');
    const apiKey = state.getSessionApiKey();
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const aiStatusIndicator = document.getElementById('ai-status-indicator');

    if (!apiKey || forceShow) {
        apiKeyOverlay.classList.remove('hidden');
        chatInput.disabled = true;
        chatSendBtn.disabled = true;
        if(aiStatusIndicator) {
            aiStatusIndicator.classList.remove('bg-green-400', 'animate-pulse');
            aiStatusIndicator.classList.add('bg-red-500');
        }
    } else {
        apiKeyOverlay.classList.add('hidden');
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        if(aiStatusIndicator) {
            aiStatusIndicator.classList.remove('bg-red-500');
            aiStatusIndicator.classList.add('bg-green-400', 'animate-pulse');
        }
    }
}

function handleSaveInlineApiKey() {
    const input = document.getElementById('inlineApiKeyInput');
    const key = input.value.trim();
    if (!key) {
        showNotification('error', 'Clave Requerida', 'Por favor, introduce una API Key.');
        return;
    }

    state.setSessionApiKey(key);
    updateApiKeyUI();
    input.value = ''; // Clear for security
    
    showNotification('success', 'API Key Guardada', 'Tu clave ha sido configurada para esta sesión. El asistente se activará y validará en tu primer chat.');
}


// --- CENTRALIZED EVENT LISTENERS ---
function initializeEventListeners() {
    // Modal Buttons
    document.getElementById('close-notification-modal-btn-x')?.addEventListener('click', closeNotificationModal);
    document.getElementById('close-notification-modal-btn-accept')?.addEventListener('click', closeNotificationModal);
    document.getElementById('close-custom-service-modal-btn')?.addEventListener('click', closeCustomServiceModal);
    document.getElementById('add-custom-service-btn')?.addEventListener('click', addCustomServiceToSelection);
    document.getElementById('close-extra-points-modal-btn')?.addEventListener('click', closeExtraPointsModal);
    document.getElementById('add-extra-points-btn')?.addEventListener('click', addExtraPoints);
    document.getElementById('close-pdf-options-modal-btn')?.addEventListener('click', closePdfOptionsModal);
    document.getElementById('generate-client-pdf-btn')?.addEventListener('click', (e) => generatePdf(true, e.currentTarget));
    document.getElementById('generate-internal-pdf-btn')?.addEventListener('click', (e) => generatePdf(false, e.currentTarget));
    document.getElementById('close-branding-modal-btn')?.addEventListener('click', closeBrandingModal);
    document.getElementById('save-branding-btn')?.addEventListener('click', saveBranding);
    document.getElementById('close-tiered-builder-modal-btn')?.addEventListener('click', closeTieredBuilderModal);
    document.getElementById('cancel-tiered-builder-btn')?.addEventListener('click', closeTieredBuilderModal);
    document.getElementById('add-tiered-proposal-btn')?.addEventListener('click', addTieredProposal);
    document.getElementById('save-inline-api-key-btn')?.addEventListener('click', handleSaveInlineApiKey);
    document.getElementById('close-exchange-rate-modal-btn')?.addEventListener('click', closeExchangeRateModal);
    document.getElementById('save-exchange-rate-btn')?.addEventListener('click', handleSaveExchangeRate);
    document.getElementById('close-content-studio-modal-btn')?.addEventListener('click', closeContentStudioModal);
    document.getElementById('close-sales-channels-modal-btn')?.addEventListener('click', closeSalesChannelsModal);

    // Header Buttons
    document.getElementById('toggle-chat-focus-btn')?.addEventListener('click', toggleChatFocusMode);
    document.getElementById('show-branding-modal-btn')?.addEventListener('click', showBrandingModal);
    document.getElementById('change-api-key-btn')?.addEventListener('click', () => updateApiKeyUI(true));
    document.getElementById('generate-lead-gen-plan-btn')?.addEventListener('click', showLeadGenPlanModal);
    document.getElementById('show-content-studio-btn')?.addEventListener('click', showContentStudioModal);
    document.getElementById('show-sales-channels-btn')?.addEventListener('click', showSalesChannelsModal);
    document.getElementById('show-opportunity-radar-btn')?.addEventListener('click', showOpportunityRadarModal);
    document.getElementById('tieredBuilderBtn')?.addEventListener('click', () => showTieredBuilderModal());
    document.getElementById('configure-rate-btn')?.addEventListener('click', showExchangeRateModal);
    document.getElementById('add-custom-service-modal-btn')?.addEventListener('click', showCustomServiceModal);
    document.getElementById('buyExtraPointsBtn')?.addEventListener('click', showExtraPointsModal);
    dom.exportPdfBtn?.addEventListener('click', showPdfOptionsModal);

    // Main App Listeners
    dom.serviceTypeSelect.addEventListener('change', (e) => toggleSelectionMode(e.target.value));
    dom.clearSelectionsBtn.addEventListener('click', clearAllSelections);
    dom.addTaskButton.addEventListener('click', () => handleAddTask());
    dom.marginPercentageInput.addEventListener('input', updateSelectedItems);
    
    dom.clearAllTasksBtn.addEventListener('click', () => {
        const { tasks } = state.getState();
        if (tasks.length > 0 && confirm("¿Estás seguro de que deseas borrar TODAS las propuestas?")) {
            state.setTasks([]);
            saveTasks();
            resetForm();
            showNotification('info', 'Tareas Borradas', 'Todas las propuestas han sido eliminadas.');
        }
    });

    document.getElementById('currency-toggle-btn').addEventListener('click', () => {
        const current = state.getState().currentCurrency;
        const newCurrency = current === 'USD' ? 'ARS' : 'USD';
        state.setCurrentCurrency(newCurrency);
        rerenderAllPrices();
    });

    // TTS Buttons for Modals & Tooltips
    const setupTTSButton = (buttonId, text) => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                ttsManager.speak(text, button);
            });
        }
    };
    
    document.body.addEventListener('click', (e) => {
        const button = e.target.closest('.info-tooltip-btn');
        if (button) {
            e.preventDefault();
            e.stopPropagation();
            const tooltip = button.closest('.tooltip-container').querySelector('.tooltip-content');
            if (tooltip) {
                ttsManager.speak(tooltip.innerText, button);
            }
        }
    });

    setupTTSButton('lead-gen-tts-btn', "Esta herramienta es tu estratega de marketing personal. Su único fin es darte un plan de acción de 7 días, claro y accionable, para que puedas captar a tu primer cliente de alto valor. La visión es simple: dejar de esperar a que lleguen los clientes y empezar a buscarlos activamente con una estrategia profesional. Usa esta guía para posicionarte como un experto en tu nicho y llenar tu pipeline de ventas.");
    setupTTSButton('content-studio-tts-btn', "Este es tu estudio creativo. Su propósito es ahorrarte horas de trabajo y eliminar el bloqueo del escritor. La estrategia es simple: generar contenido de alta calidad, tanto textos como imágenes, que resuenen con tu audiencia y estén alineados a los servicios que ofreces. La visión es convertirte en una máquina de contenido, publicando de manera consistente y profesional para construir tu marca y atraer clientes sin esfuerzo.");
    setupTTSButton('tiered-builder-tts-btn', "Esta es una de las técnicas de venta más poderosas. En lugar de dar un solo precio, presentas tres opciones: una Básica, una Recomendada y una Completa. Esto aprovecha la psicología de 'anclaje de precios' y le da al cliente una sensación de control. La mayoría de las veces, elegirán la opción del medio, la que tú consideras ideal, aumentando así significativamente el valor promedio de tus tratos y tu tasa de cierre.");
    setupTTSButton('sales-channels-tts-btn', "Esta sección es tu mapa del tesoro. No basta con tener la mejor propuesta, hay que saber dónde presentarla. Aquí te damos una lista curada de plataformas y comunidades donde tus clientes potenciales ya están buscando soluciones. La estrategia es simple: ve a donde está la conversación, aporta valor y presenta tu solución en el momento justo. Esto acelera tu ciclo de ventas y te conecta con oportunidades reales.");

    // --- NEW: Sales Channels Tab Logic ---
    const salesChannelsTabsContainer = document.getElementById('sales-channels-tabs');
    if (salesChannelsTabsContainer) {
        salesChannelsTabsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.studio-tab');
            if (!button) return;

            const tabId = button.dataset.tab;
            
            // Update buttons
            salesChannelsTabsContainer.querySelectorAll('.studio-tab').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update content
            document.querySelectorAll('#sales-channels-content .studio-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-content-${tabId}`).classList.add('active');
        });
    }

    // --- NEW: Guided Mode Step Progression ---
    dom.clientNameInput.addEventListener('blur', () => { if (dom.clientNameInput.value) updateActiveStep(2); });
    dom.webNameInput.addEventListener('blur', () => { if (dom.webNameInput.value) updateActiveStep(2); });
    document.body.addEventListener('aiBuilderSuccess', () => updateActiveStep(3));

    // Event Delegation
    dom.appContainer.addEventListener('change', (e) => {
        const target = e.target;
        if (target.matches('input[name="selectionGroup"], input[data-type="standard"]')) {
            if (document.querySelector('input[name="monthlyPlanSelection"]:checked')) {
                clearAllSelections();
            }
            if (target.name === 'selectionGroup') {
                document.querySelectorAll('input[data-type="standard"]').forEach(cb => cb.checked = false);
            } else {
                if (document.querySelector('input[name="selectionGroup"]:checked')) {
                    document.querySelector('input[name="selectionGroup"]:checked').checked = false;
                }
            }
            updateSelectedItems();
        } else if (target.matches('input[name="monthlyPlanSelection"]')) {
            if (document.querySelector('input[name="selectionGroup"]:checked')) {
                document.querySelector('input[name="selectionGroup"]:checked').checked = false;
            }
            document.querySelectorAll('input[data-type="standard"]:checked').forEach(cb => cb.checked = false);
            handlePlanSelection(target.value);
            updateSelectedItems();
        } else if (target.matches('input[name^="plan-service-"]')) {
            handleServiceSelection(target, target.checked);
        } else if (target.matches('.task-status-select')) {
            updateTaskStatus(parseInt(target.dataset.index), target.value);
        }
    });

    dom.appContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.item-card');
        if (card && !e.target.matches('input, button, svg, path, .accordion-header, h3')) {
            const input = card.querySelector('input');
            if (input && !input.disabled) {
                input.click();
            }
        }

        const actionButton = e.target.closest('[data-action]');
        if (actionButton) {
            e.stopPropagation(); // Prevent card click when clicking a button
            const { action, index, id } = actionButton.dataset;
            if (action === 'edit') editTask(parseInt(index));
            if (action === 'delete') deleteTask(parseInt(index));
            if (action === 'remove-custom') removeCustomService(id);
            if (action === 'delete-local-service') deleteLocalService(id);
        }

        // --- LÓGICA DEL ACORDEÓN ---
        const accordionHeader = e.target.closest('.accordion-header');
        if (accordionHeader) {
            const accordionItem = accordionHeader.closest('.accordion-item');
            if (!accordionItem) return;

            const accordionContainer = accordionItem.parentElement;
            const wasOpen = accordionItem.classList.contains('is-open');

            // Cerrar todos los items en el mismo contenedor
            if (accordionContainer) {
                accordionContainer.querySelectorAll('.accordion-item').forEach(item => {
                    item.classList.remove('is-open');
                });
            }

            // Si estaba cerrado, abrirlo y enfocar
            if (!wasOpen) {
                accordionItem.classList.add('is-open');
                // Pequeño retraso para permitir que el layout comience a expandirse antes de hacer scroll
                setTimeout(() => {
                    accordionItem.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                }, 150);
            }
        }
    });
}


// --- APP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    initializeSplashScreen();
    initializeBranding();
    loadLocalData();
    loadPricingData(); // This now also calls initializeUI
    resetForm();
    initializeChatAssistant(updateApiKeyUI);
    initializeGuidedMode();
    initializeEventListeners(); // The new central hub for all interactions
});