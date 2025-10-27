
// js/data.js

import { setAllServices, setMonthlyPlans, setTasks, setLocalServices, getState } from './state.js';
import { initializeUI, renderTasksDashboard } from './ui.js';
import * as dom from './dom.js';

export async function loadPricingData() {
    try {
        const resp = await fetch('pricing.json?v=' + new Date().getTime());
        if (!resp.ok) throw new Error('Archivo "pricing.json" no encontrado o error de red.');
        const data = await resp.json();
        setAllServices(data.allServices || {});
        setMonthlyPlans(data.monthlyPlans || []);
        dom.messageContainer.innerHTML = '';
        initializeUI();
    } catch (err) {
        console.error('Error Crítico al cargar pricing.json:', err.message);
        dom.appContainer.innerHTML = `<div class="col-span-full bg-red-900/50 border border-red-700 text-red-200 p-6 rounded-xl">
            <h2 class="text-2xl font-bold mb-2">Error Crítico de Carga</h2>
            <p>La aplicación no puede iniciarse porque no se pudo cargar o procesar el archivo <strong>pricing.json</strong>.</p>
            <p class="mt-2">Por favor, asegúrate de que el archivo se encuentre en el mismo directorio que este HTML y que su contenido sea un JSON válido.</p>
        </div>`;
    }
}

export function loadLocalData() {
    // Tareas
    try {
        const storedTasks = localStorage.getItem('zenTasks');
        if (storedTasks) setTasks(JSON.parse(storedTasks));
    } catch (e) {
        console.error("Error al cargar tareas:", e);
        setTasks([]);
    }

    // Servicios Locales
    try {
        const storedServices = localStorage.getItem('zenLocalServices');
        if (storedServices) setLocalServices(JSON.parse(storedServices));
    } catch (e) {
        console.error("Error al cargar servicios locales:", e);
        setLocalServices([]);
    }

    renderTasksDashboard();
}

export function saveTasks() {
    const { tasks } = getState();
    localStorage.setItem('zenTasks', JSON.stringify(tasks));
    renderTasksDashboard();
}

export function saveLocalServices() {
    const { localServices } = getState();
    localStorage.setItem('zenLocalServices', JSON.stringify(localServices));
}

export function loadChatHistory() {
    try {
        const storedHistory = localStorage.getItem('zenChatHistory');
        return storedHistory ? JSON.parse(storedHistory) : [];
    } catch (e) {
        console.error("Error al cargar historial del chat:", e);
        return [];
    }
}

export function saveChatHistory(history) {
    try {
        localStorage.setItem('zenChatHistory', JSON.stringify(history));
    } catch (e) {
        console.error("Error al guardar historial del chat:", e);
    }
}
