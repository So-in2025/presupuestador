// js/main.js

import * as dom from './dom.js';
import * as state from './state.js';
import { loadPricingData, loadLocalData, saveTasks } from './data.js';
import { resetForm, handleAddTask, clearAllSelections, toggleSelectionMode, updateSelectedItems, deleteTask, editTask } from './app.js';
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
    showTieredBuilderHelp,
    showExtraPointsModal,
    closeExtraPointsModal,
    addExtraPoints,
    showExchangeRateModal,
    closeExchangeRateModal,
    handleSaveExchangeRate,
    showContentStudioModal,
    closeContentStudioModal
} from './modals.js';
import { initializeBranding, rerenderAllPrices, saveBranding, restartTour, initializeTour } from './ui.js';
import { initializeChatAssistant } from './chat-frontend.js';
import { generatePdf } from './pdf.js';

// --- LÓGICA DEL SPLASH SCREEN ---
function initializeSplashScreen() {
    const startBtn = document.getElementById('start-app-btn');
    const detailsBtn = document.getElementById('toggle-details-btn');
    const detailsSection = document.getElementById('detailsSection');
    const splashScreen = document.getElementById('splash-screen');
    const readAloudBtn = document.getElementById('read-aloud-btn');

    startBtn.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        splashScreen.style.opacity = '0';
        splashScreen.style.pointerEvents = 'none';
        splashScreen.style.zIndex = '-1';
        
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            updateApiKeyUI();
        }, 500);
    });

    detailsBtn.addEventListener('click', () => {
        detailsSection.classList.toggle('open');
    });

    // --- LÓGICA DE LECTURA INTELIGENTE (CON VOZ MEJORADA) ---
    let ttsQueue = [];
    let currentUtterance = null;
    let selectedVoice = null;

    const loadAndSelectVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) return;

        const spanishVoices = voices.filter(v => v.lang.startsWith('es'));
        if (spanishVoices.length === 0) return;

        // Prioridad 1: Voz masculina de Google en español.
        const googleMaleVoice = spanishVoices.find(v => 
            v.name.toLowerCase().includes('google') && 
            (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('español'))
        );
        
        if (googleMaleVoice) {
            selectedVoice = googleMaleVoice;
        } else {
            // Prioridad 2: Cualquier voz de Google.
            const googleVoice = spanishVoices.find(v => v.name.toLowerCase().includes('google'));
            if (googleVoice) {
                selectedVoice = googleVoice;
            } else {
                // Prioridad 3: La primera voz en español disponible.
                selectedVoice = spanishVoices[0];
            }
        }
    };

    // Cargar voces al inicio y cuando cambien.
    loadAndSelectVoice();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadAndSelectVoice;
    }


    const highlightElement = (element) => {
        document.querySelectorAll('[data-tts-content]').forEach(el => el.classList.remove('tts-highlight'));
        if (element) {
            element.classList.add('tts-highlight');
        }
    };

    const playNextInQueue = () => {
        if (ttsQueue.length > 0) {
            const { element, text } = ttsQueue.shift();
            currentUtterance = new SpeechSynthesisUtterance(text);
            
            if (selectedVoice) {
                currentUtterance.voice = selectedVoice;
            }
            
            currentUtterance.lang = 'es-ES';
            currentUtterance.rate = 1.0;

            currentUtterance.onstart = () => {
                highlightElement(element);
            };

            currentUtterance.onend = () => {
                playNextInQueue();
            };

            window.speechSynthesis.speak(currentUtterance);
        } else {
            readAloudBtn.textContent = 'Leer en voz alta';
            highlightElement(null);
            currentUtterance = null;
        }
    };

    readAloudBtn.addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            ttsQueue = [];
            readAloudBtn.textContent = 'Leer en voz alta';
            highlightElement(null);
        } else {
            // Asegurarse de que las voces estén cargadas antes de hablar
            if (!selectedVoice) loadAndSelectVoice();

            const contentElements = document.querySelectorAll('#detailsSection [data-tts-content]');
            contentElements.forEach(element => {
                ttsQueue.push({ element: element, text: element.dataset.ttsContent });
            });
            readAloudBtn.textContent = 'Detener lectura';
            playNextInQueue();
        }
    });

     window.addEventListener('beforeunload', () => {
        window.speechSynthesis.cancel();
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
    
    if (!localStorage.getItem('zenTourCompleted')) {
        initializeTour();
    }
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

    // Header Buttons
    document.getElementById('show-branding-modal-btn')?.addEventListener('click', showBrandingModal);
    document.getElementById('change-api-key-btn')?.addEventListener('click', () => updateApiKeyUI(true));
    document.getElementById('restart-tour-btn')?.addEventListener('click', restartTour);
    document.getElementById('show-content-studio-btn')?.addEventListener('click', showContentStudioModal);
    // FIX: Changed event listener to call the function correctly without passing the event object.
    document.getElementById('tieredBuilderBtn')?.addEventListener('click', () => showTieredBuilderModal());
    document.getElementById('show-tiered-builder-help-btn')?.addEventListener('click', showTieredBuilderHelp);
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
        document.getElementById('currency-toggle-btn').textContent = newCurrency;
        rerenderAllPrices();
    });

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
        }
    });

    dom.appContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.item-card');
        if (card && !e.target.matches('input')) {
            const input = card.querySelector('input');
            if (input && !input.disabled) {
                input.click();
            }
        }

        const actionButton = e.target.closest('[data-action]');
        if (actionButton) {
            const { action, index, id } = actionButton.dataset;
            if (action === 'edit') editTask(parseInt(index));
            if (action === 'delete') deleteTask(parseInt(index));
            if (action === 'remove-custom') removeCustomService(id);
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
    initializeEventListeners(); // The new central hub for all interactions
});