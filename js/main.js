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
    showTieredBuilderHelp,
    showExtraPointsModal,
    closeExtraPointsModal,
    addExtraPoints,
    showExchangeRateModal,
    closeExchangeRateModal,
    handleSaveExchangeRate,
    showContentStudioModal,
    closeContentStudioModal,
    showLeadGenPlanModal
} from './modals.js';
import { initializeBranding, rerenderAllPrices, restartTour, initializeTour, updateCurrencyToggleButton, saveBranding } from './ui.js';
import { initializeChatAssistant } from './chat-frontend.js';
import { generatePdf, generateActionPlanPdf } from './pdf.js';

// --- TTS Manager for Explanations ---
const infoTTSManager = {
    currentUtterance: null,
    currentButton: null,

    stop() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        if (this.currentButton) {
            this.currentButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.348 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM18.584 14.828a1.5 1.5 0 000-2.121 5.03 5.03 0 00-7.113 0 1.5 1.5 0 001.06 2.561 2.03 2.03 0 012.872 0 1.5 1.5 0 002.121 0z" /><path d="M16.463 17.56a8.966 8.966 0 000-11.121 1.5 1.5 0 00-2.12 2.121A5.966 5.966 0 0112 12a5.966 5.966 0 01-2.343-4.44 1.5 1.5 0 10-2.121-2.121A8.966 8.966 0 0012 21a8.966 8.966 0 004.463-3.44z" /></svg>`;
            this.currentButton.classList.remove('bg-red-500');
        }
        this.currentUtterance = null;
        this.currentButton = null;
    },

    speak(text, button) {
        if (this.currentButton === button) { // If same button is clicked
            this.stop();
            return;
        }
        this.stop(); // Stop any previous playback

        let selectedVoice = null;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
             const spanishVoices = voices.filter(v => v.lang.startsWith('es'));
             if (spanishVoices.length > 0) {
                selectedVoice = 
                    spanishVoices.find(v => v.name.toLowerCase().includes('google') && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('español'))) ||
                    spanishVoices.find(v => v.name.toLowerCase().includes('google')) ||
                    spanishVoices[0];
             }
        }

        this.currentUtterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) {
            this.currentUtterance.voice = selectedVoice;
        }
        this.currentUtterance.lang = 'es-ES';
        
        this.currentUtterance.onend = () => this.stop();
        this.currentUtterance.onerror = () => this.stop();

        this.currentButton = button;
        this.currentButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2H4z" /></svg>`;
        this.currentButton.classList.add('bg-red-500');

        window.speechSynthesis.speak(this.currentUtterance);
    }
};

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
        window.speechSynthesis.cancel();
        splashScreen.style.opacity = '0';
        splashScreen.style.pointerEvents = 'none';
        splashScreen.style.zIndex = '-1';
        
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
    document.getElementById('toggle-chat-focus-btn')?.addEventListener('click', toggleChatFocusMode);
    document.getElementById('show-branding-modal-btn')?.addEventListener('click', showBrandingModal);
    document.getElementById('change-api-key-btn')?.addEventListener('click', () => updateApiKeyUI(true));
    document.getElementById('restart-tour-btn')?.addEventListener('click', restartTour);
    document.getElementById('generate-lead-gen-plan-btn')?.addEventListener('click', showLeadGenPlanModal);
    document.getElementById('show-content-studio-btn')?.addEventListener('click', showContentStudioModal);
    document.getElementById('tieredBuilderBtn')?.addEventListener('click', () => showTieredBuilderModal());
    document.getElementById('show-tiered-builder-help-btn-modal')?.addEventListener('click', showTieredBuilderHelp);
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

    // TTS Buttons for Modals
    const leadGenTTSBtn = document.getElementById('lead-gen-tts-btn');
    if (leadGenTTSBtn) {
        leadGenTTSBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const text = "Esta herramienta es tu estratega de marketing personal. Su único fin es darte un plan de acción de 7 días, claro y accionable, para que puedas captar a tu primer cliente de alto valor. La visión es simple: dejar de esperar a que lleguen los clientes y empezar a buscarlos activamente con una estrategia profesional. Usa esta guía para posicionarte como un experto en tu nicho y llenar tu pipeline de ventas.";
            infoTTSManager.speak(text, leadGenTTSBtn);
        });
    }

    const contentStudioTTSBtn = document.getElementById('content-studio-tts-btn');
    if (contentStudioTTSBtn) {
        contentStudioTTSBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const text = "Este es tu estudio creativo. Su propósito es ahorrarte horas de trabajo y eliminar el bloqueo del escritor. La estrategia es simple: generar contenido de alta calidad, tanto textos como imágenes, que resuenen con tu audiencia y estén alineados a los servicios que ofreces. La visión es convertirte en una máquina de contenido, publicando de manera consistente y profesional para construir tu marca y atraer clientes sin esfuerzo.";
            infoTTSManager.speak(text, contentStudioTTSBtn);
        });
    }

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
    initializeEventListeners(); // The new central hub for all interactions
});