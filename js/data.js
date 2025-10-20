// js/data.js

import { setAllServices, setMonthlyPlans, setTasks, getState } from './state.js';
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

export function loadTasks() {
    try {
        const storedTasks = localStorage.getItem('webBudgetTasks');
        if (storedTasks) {
            setTasks(JSON.parse(storedTasks));
        }
    } catch (e) {
        console.error("Error al cargar tareas:", e);
        setTasks([]);
    }
    renderTasksDashboard();
}

export function saveTasks() {
    const { tasks } = getState();
    localStorage.setItem('webBudgetTasks', JSON.stringify(tasks));
    renderTasksDashboard();
}