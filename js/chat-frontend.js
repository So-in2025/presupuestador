// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant.
 * v19 (Centralized TTS & A11y)
 */

import { getState } from './state.js';
import { loadChatHistories, saveChatHistories } from './data.js';
import { showNotification } from './modals.js';
import { ttsManager } from './tts.js'; // Usar el gestor de TTS centralizado

export function initializeChatAssistant(showApiKeyOverlay) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');
    const summaryCard = document.getElementById('summaryCard');
    const modeSelector = document.getElementById('chat-mode-selector');
    const clearChatBtn = document.getElementById('clear-chat-history-btn');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn || !modeSelector) {
        console.error("Elementos esenciales del chat no encontrados.");
        return;
    }

    const chatContainer = document.getElementById('ai-assistant-container');
    const themeToggle = document.getElementById('chat-theme-toggle');

    function applyChatTheme(theme) {
        if (theme === 'light') {
            chatContainer.classList.add('chat-light-mode');
            themeToggle.checked = true;
        } else { // dark
            chatContainer.classList.remove('chat-light-mode');
            themeToggle.checked = false;
        }
    }
    
    function toggleChatTheme() {
        const isLightMode = themeToggle.checked;
        const newTheme = isLightMode ? 'light' : 'dark';
        localStorage.setItem('zenChatTheme', newTheme);
        applyChatTheme(newTheme);
    }

    themeToggle.addEventListener('change', toggleChatTheme);

    const savedTheme = localStorage.getItem('zenChatTheme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        applyChatTheme(savedTheme);
    } else {
        applyChatTheme(systemPrefersDark ? 'dark' : 'light');
    }

    let allChatHistories = { builder: [], objection: [], analyze: [], entrenamiento: [] };
    let chatHistory = []; // Referencia al historial activo
    let isSending = false;
    let currentAiMode = 'builder';

    function switchMode(newMode, isInitialLoad = false) {
        if (!isInitialLoad) {
            allChatHistories[currentAiMode] = chatHistory;
        }
        currentAiMode = newMode;
        chatHistory = allChatHistories[currentAiMode] || [];
        
        modeSelector.querySelector('.active')?.classList.remove('active');
        modeSelector.querySelector(`[data-mode="${newMode}"]`).classList.add('active');
        updateChatUIForMode();
        renderChatMessages();
    }
    
    // --- REFACTORIZACIÓN: CREACIÓN DE NODOS DEL DOM ---
    function createMessageNode(message, role) {
        const sender = role === 'user' ? 'user' : 'ai';
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message flex flex-col my-2';
        
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%] relative';
    
        if (sender === 'user') {
            wrapper.classList.add('items-end');
            bubble.classList.add('chat-bubble-user', 'rounded-br-none');
            bubble.textContent = message;
        } else { // AI
            wrapper.classList.add('items-start');
            bubble.classList.add('chat-bubble-ai', 'rounded-bl-none');
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'pr-20 pb-2'; // Espacio para el botón de TTS
            bubble.appendChild(contentWrapper);
            
            let textToSpeak = message;
    
            if (currentAiMode === 'builder' && message.trim().startsWith('{')) {
                try {
                    const jsonResponse = JSON.parse(message);
                     if (!jsonResponse.introduction || !Array.isArray(jsonResponse.services)) {
                        throw new Error("Invalid JSON structure for builder mode.");
                    }
                    textToSpeak = `${jsonResponse.introduction}\n\n${jsonResponse.closing || ''}`;
                    contentWrapper.innerHTML = jsonResponse.introduction.replace(/\n/g, '<br>');
                    
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'mt-3 pt-3 border-t border-slate-600';
                    contentWrapper.appendChild(document.createElement('br'));
                    contentWrapper.appendChild(document.createElement('br'));
                    contentWrapper.insertAdjacentHTML('beforeend', jsonResponse.closing.replace(/\n/g, '<br>'));
                    bubble.appendChild(actionsContainer);
                    // Lógica para renderizar botones de servicios, preguntas, etc.
                    renderBuilderActions(actionsContainer, jsonResponse);

                } catch (e) {
                    contentWrapper.innerHTML = `<p class="text-yellow-300 font-semibold">El asistente devolvió una respuesta, pero no en el formato esperado.</p><p class="text-sm text-slate-400 mt-1">Intenta reformular tu pregunta de forma más clara para obtener una recomendación de servicios (Ej: "Necesito una web para un restaurante").</p>`;
                    textToSpeak = "El asistente devolvió una respuesta, pero no en el formato esperado. Intenta reformular tu pregunta.";
                }
            } else if (currentAiMode === 'analyze') {
                contentWrapper.innerHTML = '<ul>' + message.split('- ').filter(line => line.trim() !== '').map(line => `<li class="mb-1">${line.trim()}</li>`).join('') + '</ul>';
                textToSpeak = "He analizado la conversación. Aquí están los requisitos clave que he extraído: " + message;
            } else {
                contentWrapper.innerHTML = message.replace(/\n/g, '<br>');
            }
            
            const ttsButton = document.createElement('button');
            ttsButton.dataset.action = 'tts';
            ttsButton.dataset.text = textToSpeak;
            ttsButton.className = 'tts-btn absolute bottom-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition';
            ttsButton.textContent = '▶️';
            bubble.appendChild(ttsButton);
        }
        
        wrapper.appendChild(bubble);
        return wrapper;
    }


    function renderChatMessages() {
        chatMessagesContainer.innerHTML = '';
        ttsManager.shouldAutoplay = false; 

        const fragment = document.createDocumentFragment();

        if (chatHistory.length === 0) {
            const welcomeMessage = getWelcomeMessageForMode(currentAiMode);
            fragment.appendChild(createMessageNode(welcomeMessage, 'model'));
        } else {
            chatHistory.forEach(msg => {
                fragment.appendChild(createMessageNode(msg.parts[0].text, msg.role));
            });
        }
        
        chatMessagesContainer.appendChild(fragment);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    function addMessageToChat(message, role) {
        const messageNode = createMessageNode(message, role);
        
        if (role === 'model' && ttsManager.shouldAutoplay) {
            setTimeout(() => {
                const button = messageNode.querySelector('.tts-btn[data-action="tts"]');
                if (button) ttsManager.speak(button.dataset.text, button, true);
            }, 300);
        }

        chatMessagesContainer.appendChild(messageNode);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    function getWelcomeMessageForMode(mode) {
        switch(mode) {
            case 'builder': 
                return '¡Listo para construir! Describe el proyecto de tu cliente y te crearé una propuesta estratégica con los mejores servicios de tu catálogo.';
            case 'entrenamiento':
                return 'Modo Entrenamiento activado. Soy tu Experto de Producto. Pregúntame cualquier cosa sobre el catálogo de servicios y te daré los argumentos clave para venderlos.';
            case 'objection': 
                return "Tu cliente tiene dudas. Escribe su objeción (ej: 'Es muy caro') y te daré un argumento de venta sólido para convertir la duda en confianza.";
            case 'analyze': 
                return '¿Mucha charla con tu cliente? Pega la conversación aquí y extraeré automáticamente sus 5 necesidades más importantes para que sepas exactamente qué ofrecerle.';
            default: 
                return '¡Hola! Soy Zen Assistant.';
        }
    }

    modeSelector.addEventListener('click', (e) => {
        const button = e.target.closest('.chat-mode-btn');
        if (button && !button.classList.contains('active')) {
            switchMode(button.dataset.mode);
        }
    });
    
    function getPlaceholderForMode(mode) {
        switch(mode) {
            case 'builder': return "Ej: 'Necesito una web para un restaurante vegano...'";
            case 'entrenamiento': return "Ej: 'Háblame del E-commerce Avanzado...'";
            case 'objection': return "Ej: 'Tu propuesta es más cara que la de la competencia...'";
            case 'analyze': return 'Pega la conversación con tu cliente aquí...';
            default: return 'Escribe tu mensaje...';
        }
    }

    function updateChatUIForMode() {
        chatInput.placeholder = getPlaceholderForMode(currentAiMode);
    }
    
    const findServiceById = (id) => {
        const { allServices, monthlyPlans } = getState();
        let plan = monthlyPlans.find(p => p.id == id);
        if (plan) return { type: 'plan', item: plan };
        
        const allStandardServices = Object.values(allServices).flatMap(category => category.items);
        let service = allStandardServices.find(s => s.id === id);
        if (service) {
            const isPackage = Object.values(allServices).find(cat => cat.isExclusive && cat.items.some(i => i.id === id));
            return { type: isPackage ? 'package' : 'standard', item: service };
        }
        
        return null;
    };

    async function sendMessage() {
        ttsManager.stop();
        ttsManager.shouldAutoplay = true;
        const userMessage = chatInput.value.trim();
        if (!userMessage || isSending) return;

        const apiKey = getState().sessionApiKey;
        if (!apiKey) {
            showApiKeyOverlay(true);
            return;
        }

        isSending = true;
        sendChatBtn.disabled = true;
        addMessageToChat(userMessage, 'user');
        
        const { selectedServices } = getState();
        const simpleSelectedServices = selectedServices.map(({ id, name, type }) => ({ id, name, type }));
        
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] }); 
        
        const payload = { 
            userMessage: userMessage, 
            history: chatHistory,
            mode: currentAiMode,
            context: { selectedServicesContext: simpleSelectedServices },
            apiKey: apiKey 
        };

        chatInput.value = '';
        chatInput.focus();
        toggleTypingIndicator(true);

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Error de servidor (${response.status}). Revisa el log de la función en Netlify.` }));
                throw new Error(errorData.message || `Error de red: ${response.status}`);
            }

            const data = await response.json();
            
            toggleTypingIndicator(false);

            // Despachar evento para el modo guiado
            if (currentAiMode === 'builder' && data.response && data.response.trim().startsWith('{')) {
                document.body.dispatchEvent(new CustomEvent('aiBuilderSuccess'));
            }
            
            chatHistory = data.history; 
            const aiResponseText = data.response; 
            
            addMessageToChat(aiResponseText, 'model');

        } catch (error) {
            console.error("Error detallado al enviar mensaje:", error);
            toggleTypingIndicator(false);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente. Error: ${error.message}`, 'model');
        } finally {
            isSending = false;
            sendChatBtn.disabled = false;
            allChatHistories[currentAiMode] = chatHistory;
            saveChatHistories(allChatHistories);
        }
    }

    function toggleTypingIndicator(show) {
        let indicator = document.getElementById('typing-indicator');
        if (show && !indicator) {
            indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'chat-message flex items-start my-2';
            indicator.setAttribute('role', 'status');
            indicator.setAttribute('aria-live', 'polite');
            indicator.setAttribute('aria-label', 'El asistente está escribiendo');
            
            indicator.innerHTML = `<div class="chat-bubble chat-bubble-ai rounded-bl-none p-3 flex items-center space-x-1">
                <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></span>
                <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></span>
                <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.4s;"></span>
            </div>`;
            chatMessagesContainer.appendChild(indicator);
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        } else if (!show && indicator) {
            indicator.remove();
        }
    }
    
    function initChat() {
        try {
            const loadedHistories = loadChatHistories();
            allChatHistories.builder = loadedHistories.builder || [];
            allChatHistories.objection = loadedHistories.objection || [];
            allChatHistories.analyze = loadedHistories.analyze || [];
            allChatHistories.entrenamiento = loadedHistories.entrenamiento || [];
            switchMode('builder', true);
        } catch(e) {
            console.error("Error catastrófico al inicializar el chat, reiniciando estado.", e);
            localStorage.removeItem('zenChatHistories');
            allChatHistories = { builder: [], objection: [], analyze: [], entrenamiento: [] };
            switchMode('builder', true);
        }
    
        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); sendMessage(); }
        });
    
        chatMessagesContainer.addEventListener('click', (event) => {
            const actionTarget = event.target.closest('[data-action]');
            if (!actionTarget || actionTarget.disabled) return;

            const { action } = actionTarget.dataset;
            const button = actionTarget.tagName === 'BUTTON' ? actionTarget : null;

            switch (action) {
                case 'add-service': {
                    const { serviceId, serviceType } = actionTarget.dataset;
                    let elementId = (serviceType === 'package') ? `package-${serviceId}` : (serviceType === 'plan') ? `plan-${serviceId}` : `standard-${serviceId}`;
                    const serviceElement = document.getElementById(elementId);
                    
                    if (serviceElement) {
                        serviceElement.click();
                        summaryCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        if(button) {
                            button.className = button.className.replace(/bg-\w+-\d+/g, '').replace(/text-\w+-\d+/g, '').replace(/hover:bg-\w+-\d+/g, '').replace(/border-\w+-\d+/g, '');
                            button.classList.add('bg-green-700', 'text-white', 'cursor-default', 'border-transparent');
                            button.textContent = `Añadido ✔️`;
                            button.disabled = true;
                        }
                    } else {
                        console.error(`Elemento del DOM no encontrado: #${elementId}`);
                        if(button) {
                            button.textContent = `Error: No encontrado`;
                            button.disabled = true;
                        }
                    }
                    break;
                }
                case 'tts':
                    if(button) ttsManager.speak(button.dataset.text, button);
                    break;
                case 'copy-pitch': {
                    const targetId = actionTarget.dataset.targetId;
                    const pitchElement = document.getElementById(targetId);
                    if (pitchElement) {
                        navigator.clipboard.writeText(pitchElement.innerText);
                        if(button) button.textContent = '¡Copiado!';
                    }
                    break;
                }
                case 'copy-question': {
                    const targetId = actionTarget.dataset.targetId;
                    const questionElement = document.getElementById(targetId);
                    if (questionElement) {
                        navigator.clipboard.writeText(questionElement.innerText.replace('❔ ', ''));
                        if(button) button.textContent = '¡Copiado!';
                    }
                    break;
                }
                case 'suggest-question': {
                    const question = actionTarget.dataset.question;
                    chatInput.value = `Mi cliente respondió a '${question}', y dijo que...`;
                    chatInput.focus();
                    break;
                }
            }
        });

        clearChatBtn?.addEventListener('click', () => {
            const currentModeName = modeSelector.querySelector('.active')?.textContent || 'actual';
            if (confirm(`¿Estás seguro de que quieres borrar el historial del modo "${currentModeName}"? Esta acción no se puede deshacer.`)) {
                allChatHistories[currentAiMode] = [];
                chatHistory = []; // Update current reference
                saveChatHistories(allChatHistories);
                renderChatMessages();
                showNotification('info', 'Historial Borrado', `El historial para el modo "${currentModeName}" ha sido eliminado.`);
            }
        });
    }

    // Llama a la inicialización principal
    initChat();
}

function renderBuilderActions(container, jsonData) {
    container.innerHTML = ''; // Limpiar acciones anteriores

    const servicesByPriority = { essential: [], recommended: [], optional: [] };
    jsonData.services.forEach(service => {
        (servicesByPriority[service.priority] || servicesByPriority.optional).push(service);
    });

    const priorityConfig = {
        essential: { title: 'Fundamentales', color: 'text-cyan-300', btnClass: 'bg-slate-900 text-cyan-300 hover:bg-cyan-800 hover:text-white border border-cyan-700' },
        recommended: { title: 'Recomendados', color: 'text-purple-300', btnClass: 'bg-slate-900 text-purple-300 hover:bg-purple-800 hover:text-white border border-purple-700' },
        optional: { title: 'Opcionales', color: 'text-slate-400', btnClass: 'bg-slate-800 text-slate-400 hover:bg-slate-600 hover:text-white border border-slate-600' }
    };

    Object.keys(priorityConfig).forEach(priority => {
        if (servicesByPriority[priority].length > 0) {
            const config = priorityConfig[priority];
            const section = document.createElement('div');
            section.className = 'mb-3';
            section.innerHTML = `<p class="text-sm font-bold ${config.color} mb-2">${config.title}:</p>`;
            
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'flex flex-wrap gap-2';

            servicesByPriority[priority].forEach(serviceObject => {
                const serviceInfo = findServiceById(serviceObject.id);
                const buttonWrapper = document.createElement('div');
                buttonWrapper.className = 'tooltip-container relative';

                if (serviceInfo) {
                    const displayName = serviceObject.name || serviceInfo.item.name;
                    buttonWrapper.innerHTML = `
                        <button data-action="add-service" data-service-id="${serviceInfo.item.id}" data-service-type="${serviceInfo.type}" class="add-service-btn font-bold py-2 px-4 rounded-lg transition duration-200 w-full ${config.btnClass}">
                            Añadir ${displayName}
                        </button>
                        <div class="tooltip-content">${serviceInfo.item.description || 'Sin descripción.'}</div>
                    `;
                } else {
                    buttonWrapper.innerHTML = `<button class="bg-red-900 text-white font-bold py-2 px-4 rounded-lg cursor-not-allowed w-full" disabled>Error: "${serviceObject.name}" no encontrado</button>`;
                }
                buttonContainer.appendChild(buttonWrapper);
            });
            section.appendChild(buttonContainer);
            container.appendChild(section);
        }
    });
}