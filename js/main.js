// js/main.js

import * as dom from './dom.js';
import * as state from './state.js';
import { loadPricingData, loadLocalData, saveTasks } from './data.js';
import { resetForm, handleAddTask, clearAllSelections, toggleSelectionMode, updateSelectedItems, deleteTask, editTask } from './app.js';
import { handleServiceSelection, handlePlanSelection } from './points.js';
import { removeCustomService, showNotification, showApiKeyModal } from './modals.js';
import { initializeBranding, rerenderAllPrices } from './ui.js';
import { GoogleGenerativeAI } from 'https://esm.run/@google/generative-ai';

// --- GESTIÓN DE API KEY Y MONEDA---
let sessionApiKey = null;
export const getSessionApiKey = () => sessionApiKey;
export const setSessionApiKey = (key) => { 
    sessionApiKey = key; 
    const indicator = document.getElementById('ai-status-indicator');
    if(indicator) {
        indicator.classList.remove('bg-red-500');
        indicator.classList.add('bg-green-400', 'animate-pulse');
    }
};

export async function fetchExchangeRate() {
    const apiKey = getSessionApiKey();
    if (!apiKey) return;

    const toggleBtn = document.getElementById('currency-toggle-btn');
    const refreshBtn = document.getElementById('refresh-rate-btn');
    const refreshIcon = refreshBtn.querySelector('svg');

    toggleBtn.disabled = true;
    refreshBtn.disabled = true;
    refreshIcon.classList.add('spinner');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = "Provide the current exchange rate for 1 USD to ARS (Argentine Peso Blue). Respond ONLY with the numerical value, using a period as the decimal separator.";
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/,/g, '');
        const rate = parseFloat(text);

        if (isNaN(rate) || rate <= 0) {
            throw new Error("La IA no devolvió un número válido.");
        }
        
        state.setUsdToArsRate(rate);
        showNotification('info', 'Tipo de Cambio Actualizado', `1 USD = ${rate.toFixed(2)} ARS. Los precios ahora se pueden mostrar en pesos.`);
        toggleBtn.disabled = false;
        refreshBtn.disabled = false;

    } catch (error) {
        console.error("Error al obtener tipo de cambio:", error);
        showNotification('error', 'Error de Cotización', 'No se pudo obtener el tipo de cambio desde la IA. La aplicación seguirá en USD.');
        state.setUsdToArsRate(null);
        state.setCurrentCurrency('USD');
        toggleBtn.textContent = 'USD';
    } finally {
        refreshIcon.classList.remove('spinner');
    }
}


// --- LÓGICA DEL SPLASH SCREEN ---
function initializeSplashScreen() {
    const startBtn = document.getElementById('start-app-btn');
    const detailsBtn = document.getElementById('toggle-details-btn');
    const detailsSection = document.getElementById('detailsSection');
    const splashScreen = document.getElementById('splash-screen');

    startBtn.addEventListener('click', () => {
        splashScreen.style.opacity = '0';
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            // Check for API key ONLY after the app starts
            checkApiKey();
        }, 500); // Match transition duration
    });

    detailsBtn.addEventListener('click', () => {
        detailsSection.classList.toggle('open');
    });

    document.querySelectorAll('#splash-screen .tts-btn').forEach(button => {
        button.onclick = () => {
            const text = button.dataset.text;
            const isPlaying = button.textContent === '⏹️';
            
            window.speechSynthesis.cancel();
            document.querySelectorAll('#splash-screen .tts-btn').forEach(b => b.textContent = '▶️');
            
            if (isPlaying) return;

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            
            utterance.onstart = () => { button.textContent = '⏹️'; };
            utterance.onend = () => { button.textContent = '▶️'; };
            
            window.speechSynthesis.speak(utterance);
        };
    });
}


// --- EVENT LISTENERS PRINCIPALES ---

document.addEventListener('DOMContentLoaded', () => {
    initializeSplashScreen();
    initializeBranding();
    loadLocalData();
    loadPricingData();
    resetForm();
    // API Key check is now deferred
});

function checkApiKey() {
    if (!sessionApiKey) {
        showApiKeyModal();
        const indicator = document.getElementById('ai-status-indicator');
        if(indicator) {
            indicator.classList.remove('bg-green-400', 'animate-pulse');
            indicator.classList.add('bg-red-500');
        }
    }
}

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

document.getElementById('refresh-rate-btn').addEventListener('click', fetchExchangeRate);


// Delegación de eventos para selecciones y acciones
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