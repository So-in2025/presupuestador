// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant.
 * VERSIÓN FINAL Y COMPATIBLE.
 */

import { getState } from './state.js';
import { showNotification } from './modals.js';
import { updateSelectedItems, clearAllSelections } from './app.js';
import { handlePlanSelection } from './points.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');
    const summaryCard = document.getElementById('summaryCard');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn) {
        console.error("Elementos esenciales del chat no encontrados.");
        return;
    }

    let chatHistory = [];
    let isSending = false;

    // --- FUNCIÓN DE BÚSQUEDA ROBUSTA ---
    const findServiceById = (id) => {
        const state = getState();
        let plan = state.monthlyPlans.find(p => p.id == id);
        if (plan) return { type: 'plan', item: plan };

        const allStandardServices = Object.values(state.allServices).flatMap(category => category.items);
        let service = allStandardServices.find(s => s.id === id);
        
        if (service) {
            const isPackage = Object.values(state.allServices).find(cat => cat.isExclusive && cat.items.some(i => i.id === id));
            let serviceType = isPackage ? 'package' : (service.pointCost ? 'plan-service' : 'standard');
            return { type: serviceType, item: service };
        }
        return null;
    };

    // --- LÓGICA DE RENDERIZADO (CORREGIDA PARA SER COMPATIBLE) ---
    function createServiceButtonHTML(serviceId, serviceType, serviceName) {
        return `<button 
            data-action="add-service" 
            data-service-id="${serviceId}" 
            data-service-type="${serviceType}" 
            class="add-service-btn bg-slate-900 text-cyan-300 font-bold py-2 px-4 rounded-lg hover:bg-cyan-800 hover:text-white transition duration-200 mt-2 mr-2">
            Añadir ${serviceName}
        </button>`;
    }

    function addMessageToChat(message, role) {
        const sender = role === 'user' ? 'user' : 'ai';
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message flex flex-col my-2';

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';
        
        let finalHTML = message.replace(/\n/g, '<br>');

         if (sender === 'ai') {
            try {
                const jsonResponse = JSON.parse(message);

                if (jsonResponse.introduction && Array.isArray(jsonResponse.services)) {
                    let messageText = `${jsonResponse.introduction.replace(/\n/g, '<br>')}`;
                    let serviceButtonsHTML = '';
                    
                    jsonResponse.services.forEach(serviceId => {
                        const serviceInfo = findServiceById(serviceId);
                        if (serviceInfo) {
                            serviceButtonsHTML += createServiceButtonHTML(serviceId, serviceInfo.type, serviceInfo.item.name);
                        } else {
                            console.warn(`Servicio recomendado no encontrado en catálogo: ${serviceId}`);
                        }
                    });
                    
                    if (jsonResponse.closing) {
                        messageText += `<br><br>${jsonResponse.closing.replace(/\n/g, '<br>')}`;
                    }
                    
                    finalHTML = messageText;
                    
                    if (serviceButtonsHTML) {
                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                            <p class="text-sm font-bold text-purple-300 mb-2">Acciones Rápidas:</p>
                            <div class="flex flex-wrap gap-2">${serviceButtonsHTML}</div>
                        </div>`;
                    }

                    // --- NUEVO BLOQUE PARA LAS PREGUNTAS SUGERIDAS ---
                    if (Array.isArray(jsonResponse.suggested_questions) && jsonResponse.suggested_questions.length > 0) {
                        let suggestionButtonsHTML = '';
                        jsonResponse.suggested_questions.forEach(question => {
                            // Usamos comillas simples para el onclick para no interferir con las dobles del atributo
                            suggestionButtonsHTML += `<button onclick='document.getElementById("chat-input").value = "${question}"; document.getElementById("chat-input").focus();' 
                                class="suggested-question-btn text-left text-sm bg-slate-800 text-slate-300 py-2 px-3 rounded-lg hover:bg-slate-600 transition duration-200 mt-2">
                                ${question}
                            </button>`;
                        });

                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                            <p class="text-sm font-bold text-yellow-300 mb-2">Siguiente Paso (Sugerencias):</p>
                            <div class="flex flex-col items-start gap-2">${suggestionButtonsHTML}</div>
                        </div>`;
                    }
                    // --- FIN DEL NUEVO BLOQUE ---
                }
            } catch (e) {
                // No es JSON, es texto plano. No hacer nada.
            }
        }

        if (sender === 'user') {
            wrapper.classList.add('items-end');
            bubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
            bubble.innerHTML = finalHTML;
        } else {
            wrapper.classList.add('items-start');
            bubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            bubble.innerHTML = finalHTML;
        }

        wrapper.appendChild(bubble);
        chatMessagesContainer.appendChild(wrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- LÓGICA DE ENVÍO Y MANEJO DE EVENTOS (SIN CAMBIOS) ---
    
    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (!userMessage || isSending) return;

        isSending = true;
        sendChatBtn.disabled = true;
        addMessageToChat(userMessage, 'user');
        
        // El frontend ahora envía el formato que espera el backend robusto
        const payload = {
            userMessage: userMessage,
            history: chatHistory
        };
        
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] }); 
        chatInput.value = '';
        chatInput.focus();
        toggleTypingIndicator(true);

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload) // Enviamos el payload correcto
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Error de servidor. Revisa el log de la función en Netlify.' }));
                throw new Error(errorData.message || `Error de red: ${response.status}`);
            }

            const data = await response.json();
            chatHistory = data.history; 
            const aiResponseText = data.response; 
            addMessageToChat(aiResponseText, 'model');

        } catch (error) {
            console.error("Error detallado al enviar mensaje:", error);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente. Error: ${error.message}`, 'model');
        } finally {
            isSending = false;
            sendChatBtn.disabled = false;
            toggleTypingIndicator(false);
        }
    }

    function toggleTypingIndicator(show) {
        let indicator = document.getElementById('typing-indicator');
        if (show) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'typing-indicator';
                indicator.className = 'chat-message flex items-start my-2';
                indicator.innerHTML = `<div class="chat-bubble bg-slate-700 rounded-bl-none p-3 flex items-center space-x-1">
                    <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></span>
                    <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></span>
                    <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.4s;"></span>
                </div>`;
                chatMessagesContainer.appendChild(indicator);
            }
        } else {
            if (indicator) indicator.remove();
        }
    }

    function initChat() {
        chatMessagesContainer.innerHTML = '';
        chatHistory = [];
        const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios.';
        addMessageToChat(welcomeMessage, 'model');
        chatHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });

        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); sendMessage(); }
        });

        chatMessagesContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action="add-service"]');
            if (target && !target.disabled) {
                const { serviceId, serviceType } = target.dataset;
                const elementId = serviceType === 'plan' ? `plan-${serviceId}` : `${serviceType}-${serviceId}`;
                const serviceElement = document.getElementById(elementId);
                if (serviceElement) {
                    serviceElement.click();
                    if(summaryCard) summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.remove('bg-slate-900', 'text-cyan-300', 'hover:bg-cyan-800');
                    target.classList.add('bg-green-700', 'text-white', 'cursor-default');
                    target.textContent = `Añadido ✔️`;
                    target.disabled = true;
                } else {
                    console.error(`Elemento del DOM no encontrado: #${elementId}`);
                    target.textContent = `Error: No encontrado`;
                    target.disabled = true;
                }
            }
        });
    }

    initChat();
});