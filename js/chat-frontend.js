// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant.
 * v17 (Cost Buckets UI)
 */

import { getState } from './state.js';
import { loadChatHistories, saveChatHistories } from './data.js';
import { showNotification } from './modals.js';

// --- INICIO: BLOQUE TTS MODIFICADO ---
const ttsManager = {
    isPlaying: false,
    stop: function() {
        window.speechSynthesis.cancel();
        this.isPlaying = false;
        document.querySelectorAll('.tts-btn.playing').forEach(btn => {
            btn.innerHTML = '▶️';
            btn.classList.remove('playing');
        });
    },
    speak: function(text, buttonElement) {
        if (this.isPlaying) return;
        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            const fallbackVoice = voices.find(v => v.lang.startsWith('es-'));
            if (fallbackVoice) utterance.voice = fallbackVoice;
        }
        utterance.lang = 'es-ES';
        utterance.rate = 1.05;
        utterance.pitch = 1;
        utterance.onstart = () => {
            this.isPlaying = true;
            if (buttonElement) {
                buttonElement.innerHTML = '⏹️';
                buttonElement.classList.add('playing');
            }
        };
        utterance.onend = () => {
            this.isPlaying = false;
            if (buttonElement) {
                buttonElement.innerHTML = '▶️';
                buttonElement.classList.remove('playing');
            }
        };
        window.speechSynthesis.speak(utterance);
    }
};

const handleTTSButtonClick = (buttonElement) => {
    const text = buttonElement.dataset.text;
    const isCurrentlyPlayingThis = ttsManager.isPlaying && buttonElement.classList.contains('playing');
    ttsManager.stop();
    shouldAutoplay = false;
    if (!isCurrentlyPlayingThis) {
        ttsManager.speak(text, buttonElement);
    }
};

let voices = [];
let selectedVoiceURI = localStorage.getItem('zenAssistantVoiceURI');
let shouldAutoplay = true;

// --- FIN: BLOQUE TTS MODIFICADO ---

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

    let allChatHistories = { builder: [], objection: [], analyze: [] };
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

    // --- OPTIMIZACIÓN DE RENDERIZADO DE CHAT ---

    function createMessageNode(message, role) {
        const sender = role === 'user' ? 'user' : 'ai';
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message flex flex-col my-2';
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%] relative';
        
        let finalHTML = message.replace(/\n/g, '<br>');
        let textToSpeak = message;

        if (sender === 'ai') {
            // --- REFACTORED LOGIC TO FIX WELCOME MESSAGE PARSING ---
            // 1. If it's builder mode AND the message looks like JSON, try to parse it.
            if (currentAiMode === 'builder' && message.trim().startsWith('{')) {
                try {
                    const jsonResponse = JSON.parse(message);
                    if (!jsonResponse.introduction || !Array.isArray(jsonResponse.services)) {
                        throw new Error("Invalid JSON structure for builder mode.");
                    }
                    
                    let cleanText = `${jsonResponse.introduction}\n\n${jsonResponse.closing}\n\n`;
                    if (jsonResponse.sales_pitch) cleanText += `Argumento de venta: ${jsonResponse.sales_pitch}\n\n`;
                    if (jsonResponse.client_questions) cleanText += `Preguntas para el cliente: ${jsonResponse.client_questions.join(' ')}`;
                    textToSpeak = cleanText;
                    
                    let messageText = `${jsonResponse.introduction.replace(/\n/g, '<br>')}`;
                    
                    const servicesByPriority = { essential: [], recommended: [], optional: [] };
                    jsonResponse.services.forEach(service => {
                        (servicesByPriority[service.priority] || servicesByPriority.optional).push(service);
                    });

                    const priorityConfig = {
                        essential: { title: 'Fundamentales', color: 'text-cyan-300', btnClass: 'bg-slate-900 text-cyan-300 hover:bg-cyan-800 hover:text-white border border-cyan-700' },
                        recommended: { title: 'Recomendados', color: 'text-purple-300', btnClass: 'bg-slate-900 text-purple-300 hover:bg-purple-800 hover:text-white border border-purple-700' },
                        optional: { title: 'Opcionales', color: 'text-slate-400', btnClass: 'bg-slate-800 text-slate-400 hover:bg-slate-600 hover:text-white border border-slate-600' }
                    };

                    let actionsHTML = '';
                    Object.keys(priorityConfig).forEach(priority => {
                        if (servicesByPriority[priority].length > 0) {
                            const config = priorityConfig[priority];
                            let buttonsHTML = servicesByPriority[priority].map(serviceObject => {
                                const serviceInfo = findServiceById(serviceObject.id);
                                if (serviceInfo) {
                                    const displayName = serviceObject.name || serviceInfo.item.name;
                                    const description = serviceInfo.item.description || 'Sin descripción.';
                                    const baseClass = "add-service-btn font-bold py-2 px-4 rounded-lg transition duration-200 w-full";
                                    return `
                                        <div class="tooltip-container relative">
                                            <button data-action="add-service" data-service-id="${serviceInfo.item.id}" data-service-type="${serviceInfo.type}" class="${baseClass} ${config.btnClass}">
                                                Añadir ${displayName}
                                            </button>
                                            <div class="tooltip-content">${description}</div>
                                        </div>
                                    `;
                                }
                                return `<div class="tooltip-container relative"><button class="bg-red-900 text-white font-bold py-2 px-4 rounded-lg cursor-not-allowed w-full" disabled>Error: "${serviceObject.name}" no encontrado</button></div>`;
                            }).join('');

                            actionsHTML += `<div class="mb-3"><p class="text-sm font-bold ${config.color} mb-2">${config.title}:</p><div class="flex flex-wrap gap-2">${buttonsHTML}</div></div>`;
                        }
                    });
                    
                    if (jsonResponse.closing) messageText += `<br><br>${jsonResponse.closing.replace(/\n/g, '<br>')}`;
                    finalHTML = messageText;
                    
                    if (actionsHTML) finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">${actionsHTML}</div>`;

                    if (Array.isArray(jsonResponse.client_questions) && jsonResponse.client_questions.length > 0) {
                        let questionsHTML = jsonResponse.client_questions.map((question, index) => {
                            const escapedQuestion = question.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const questionId = `question-${Date.now()}-${index}`;
                            return `
                                <div class="flex items-center justify-between gap-2 bg-slate-800 rounded-lg w-full p-2">
                                    <p id="${questionId}" data-action="suggest-question" data-question="${escapedQuestion}" class="suggest-question-text text-left text-sm text-slate-300 flex-grow cursor-pointer hover:text-cyan-300 transition">❔ ${question}</p>
                                    <button data-action="copy-question" data-target-id="${questionId}" class="text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition flex-shrink-0">Copiar</button>
                                </div>
                            `;
                        }).join('');
                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600"><p class="text-sm font-bold text-yellow-300 mb-2">Pregúntale a tu Cliente:</p><div class="flex flex-col items-start gap-2 w-full">${questionsHTML}</div></div>`;
                    }
                    
                    if (jsonResponse.sales_pitch) {
                        const pitchId = `pitch-${Date.now()}`;
                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600"><p class="text-sm font-bold text-green-300 mb-2">Argumento de Venta (Para tu Cliente):</p><div class="p-3 bg-slate-800 rounded-lg border border-slate-600 relative"><p id="${pitchId}" class="text-slate-200 text-sm">${jsonResponse.sales_pitch.replace(/\n/g, '<br>')}</p><button data-action="copy-pitch" data-target-id="${pitchId}" class="absolute top-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">Copiar</button></div></div>`;
                    }

                } catch (e) {
                    // This catch now correctly triggers for malformed JSON, not welcome messages.
                    finalHTML = `<p class="text-yellow-300 font-semibold">El asistente devolvió una respuesta, pero no en el formato esperado.</p><p class="text-sm text-slate-400 mt-1">Intenta reformular tu pregunta de forma más clara para obtener una recomendación de servicios (Ej: "Necesito una web para un restaurante").</p>`;
                    textToSpeak = "El asistente devolvió una respuesta, pero no en el formato esperado. Intenta reformular tu pregunta de forma más clara.";
                }
            // 2. If it's analyze mode, format the list.
            } else if (currentAiMode === 'analyze') {
                finalHTML = '<ul>' + message.split('- ').filter(line => line.trim() !== '').map(line => `<li class="mb-1">${line.trim()}</li>`).join('') + '</ul>';
                textToSpeak = "He analizado la conversación. Aquí están los requisitos clave que he extraído: " + message;
            // 3. Otherwise (welcome messages, objection mode), just render as plain text.
            } else {
                finalHTML = message.replace(/\n/g, '<br>');
                textToSpeak = message;
            }

            const escapedTextToSpeak = textToSpeak.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            const ttsButtonHTML = `<button data-action="tts" data-text='${escapedTextToSpeak}' class="tts-btn absolute bottom-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">▶️</button>`;
            finalHTML = `<div class="pr-20 pb-2">${finalHTML}</div>${ttsButtonHTML}`;
        }

        if (sender === 'user') {
            wrapper.classList.add('items-end');
            bubble.classList.add('chat-bubble-user', 'rounded-br-none');
        } else {
            wrapper.classList.add('items-start');
            bubble.classList.add('chat-bubble-ai', 'rounded-bl-none');
        }
        bubble.innerHTML = finalHTML;
        wrapper.appendChild(bubble);
        return wrapper;
    }


    function renderChatMessages() {
        chatMessagesContainer.innerHTML = '';
        shouldAutoplay = false; // Deshabilitar autoplay al cargar historial

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
        
        // Lógica de autoplay solo para mensajes nuevos de la IA
        if (role === 'model' && shouldAutoplay) {
            setTimeout(() => {
                const button = messageNode.querySelector('.tts-btn[data-action="tts"]');
                if (button) ttsManager.speak(button.dataset.text, button);
            }, 300);
        }

        chatMessagesContainer.appendChild(messageNode);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    function getWelcomeMessageForMode(mode) {
        switch(mode) {
            case 'builder': 
                return '¡Listo para construir! Describe el proyecto de tu cliente y te crearé una propuesta estratégica con los mejores servicios de tu catálogo.';
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
            case 'objection': return "Ej: 'Tu propuesta es más cara que la de la competencia...'";
            case 'analyze': return 'Pega la conversación con tu cliente aquí...';
            default: return 'Escribe tu mensaje...';
        }
    }

    function updateChatUIForMode() {
        chatInput.placeholder = getPlaceholderForMode(currentAiMode);
    }
    
    function populateVoiceList() {
        voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es-'));
        const voiceSelect = document.getElementById('voice-selector');
        if (!voiceSelect || voices.length === 0) {
            const container = document.getElementById('voice-selector-container');
            if (container) container.remove();
            return;
        };

        voiceSelect.innerHTML = '';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = `${voice.name.replace('Google', '').trim()} (${voice.lang})`;
            option.value = voice.voiceURI;
            voiceSelect.appendChild(option);
        });

        const savedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
        if (savedVoice) {
            voiceSelect.value = savedVoice.voiceURI;
        } else {
            const googleVoice = voices.find(v => v.name.includes('Google') && v.name.includes('español')) || voices[0];
            if (googleVoice) {
                 voiceSelect.value = googleVoice.voiceURI;
                 selectedVoiceURI = googleVoice.voiceURI;
                 localStorage.setItem('zenAssistantVoiceURI', selectedVoiceURI);
            }
        }
    }
    
    function createVoiceSelector() {
        if (document.getElementById('voice-selector-container')) return;
        const selectorContainer = document.createElement('div');
        selectorContainer.id = 'voice-selector-container';
        selectorContainer.className = 'mb-2 p-2 bg-slate-800 rounded-md flex items-center gap-2';
        selectorContainer.innerHTML = `
            <label for="voice-selector" class="text-sm font-bold text-slate-300">Voz:</label>
            <select id="voice-selector" class="w-full styled-input text-sm accent-color"></select>
        `;
        chatMessagesContainer.parentNode.insertBefore(selectorContainer, chatMessagesContainer);

        const voiceSelect = document.getElementById('voice-selector');
        voiceSelect.addEventListener('change', (e) => {
            selectedVoiceURI = e.target.value;
            localStorage.setItem('zenAssistantVoiceURI', selectedVoiceURI);
            ttsManager.stop();
        });
    }

    if (typeof speechSynthesis !== 'undefined') {
        createVoiceSelector();
        populateVoiceList();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoiceList;
        }
    }
    
    window.addEventListener('beforeunload', () => ttsManager.stop());

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
        shouldAutoplay = true;
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
            selectedServicesContext: simpleSelectedServices,
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
            switchMode('builder', true);
        } catch(e) {
            console.error("Error catastrófico al inicializar el chat, reiniciando estado.", e);
            localStorage.removeItem('zenChatHistories');
            allChatHistories = { builder: [], objection: [], analyze: [] };
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
                            button.classList.remove('bg-slate-900', 'text-cyan-300', 'hover:bg-cyan-800'); // Clean up old styles, might need adjustment based on priority
                            button.className = button.className.replace(/bg-\w+-\d+/g, '').replace(/text-\w+-\d+/g, '').replace(/hover:bg-\w+-\d+/g, '');
                            button.classList.add('bg-green-700', 'text-white', 'cursor-default');
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
                    if(button) handleTTSButtonClick(button);
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