
// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant.
 * v11 (INFALIBLE + API Key de Usuario)
 */

import { getState, setLocalServices } from './state.js';
import { saveLocalServices, loadChatHistory, saveChatHistory } from './data.js';
import { showNotification, showApiKeyModal } from './modals.js';
import { appendLocalServiceToUI } from './ui.js';
import { getSessionApiKey } from './main.js';

// --- INICIO: BLOQUE TTS MODIFICADO ---
window.handleTTSButtonClick = (buttonElement) => {
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

const ttsManager = {
    isPlaying: false,
    stop: function() {
        window.speechSynthesis.cancel();
        this.isPlaying = false;
        document.querySelectorAll('.tts-btn.playing').forEach(btn => {
            btn.innerHTML = '▶️ Escuchar';
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
                buttonElement.innerHTML = '⏹️ Detener';
                buttonElement.classList.add('playing');
            }
        };
        utterance.onend = () => {
            this.isPlaying = false;
            if (buttonElement) {
                buttonElement.innerHTML = '▶️ Escuchar';
                buttonElement.classList.remove('playing');
            }
        };
        window.speechSynthesis.speak(utterance);
    }
};
// --- FIN: BLOQUE TTS MODIFICADO ---

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');
    const summaryCard = document.getElementById('summaryCard');
    const modeSelector = document.getElementById('chat-mode-selector');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn || !modeSelector) {
        console.error("Elementos esenciales del chat no encontrados.");
        return;
    }

    let chatHistory = [];
    let isSending = false;
    let currentAiMode = 'builder'; // 'builder', 'objection', o 'analyze'

    modeSelector.addEventListener('click', (e) => {
        const button = e.target.closest('.chat-mode-btn');
        if (button && !button.classList.contains('active')) {
            modeSelector.querySelector('.active').classList.remove('active');
            button.classList.add('active');
            currentAiMode = button.dataset.mode;
            updateChatUIForMode();
        }
    });

    function updateChatUIForMode() {
        if (currentAiMode === 'builder') {
            chatInput.placeholder = "Ej: 'Necesito una web para un fotógrafo...'";
        } else if (currentAiMode === 'objection') {
            chatInput.placeholder = "Escribe la objeción de tu cliente aquí...";
        } else { // analyze
            chatInput.placeholder = "Pega aquí la conversación con tu cliente (email, chat...)"
        }
    }
    
    function populateVoiceList() {
        voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es-'));
        const voiceSelect = document.getElementById('voice-selector');
        if (!voiceSelect || voices.length === 0) {
            document.getElementById('voice-selector-container')?.remove();
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
        const selectorContainer = document.createElement('div');
        selectorContainer.id = 'voice-selector-container';
        selectorContainer.className = 'mb-2 p-2 bg-slate-800 rounded-md flex items-center gap-2';
        selectorContainer.innerHTML = `
            <label for="voice-selector" class="text-sm font-bold text-slate-300">Voz del Asistente:</label>
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

    function saveAndRenderNewLocalService(service) {
        const { localServices } = getState();
        if (localServices.find(s => s.id === service.id) || document.getElementById(`standard-${service.id}`)) {
            return;
        }
        const newLocalServices = [...localServices, service];
        setLocalServices(newLocalServices);
        saveLocalServices();
        appendLocalServiceToUI(service);
        showNotification('info', 'Servicio Personalizado Guardado', `"${service.name}" ha sido añadido a tu catálogo local.`);
    }

    const findServiceById = (id) => {
        const { allServices, monthlyPlans, localServices } = getState();
        let plan = monthlyPlans.find(p => p.id == id);
        if (plan) return { type: 'plan', item: plan };
        const allStandardServices = Object.values(allServices).flatMap(category => category.items);
        let service = allStandardServices.find(s => s.id === id);
        if (service) {
            const isPackage = Object.values(allServices).find(cat => cat.isExclusive && cat.items.some(i => i.id === id));
            return { type: isPackage ? 'package' : 'standard', item: service };
        }
        let localService = localServices.find(s => s.id === id);
        if (localService) return { type: 'standard', item: localService };
        return null;
    };

    function createServiceButtonHTML(serviceId, serviceType, serviceName) {
        return `<button data-action="add-service" data-service-id="${serviceId}" data-service-type="${serviceType}" class="add-service-btn bg-slate-900 text-cyan-300 font-bold py-2 px-4 rounded-lg hover:bg-cyan-800 hover:text-white transition duration-200 mt-2 mr-2">Añadir ${serviceName}</button>`;
    }

    function addMessageToChat(message, role) {
        const sender = role === 'user' ? 'user' : 'ai';
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message flex flex-col my-2';
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%] relative';
        
        let finalHTML = message.replace(/\n/g, '<br>');
        let textToSpeak = message;

        if (sender === 'ai') {
            if (currentAiMode === 'analyze') {
                finalHTML = '<ul>' + message.split('- ').filter(line => line.trim() !== '').map(line => `<li class="mb-1">${line.trim()}</li>`).join('') + '</ul>';
                textToSpeak = "He analizado la conversación. Aquí están los requisitos clave que he extraído: " + message;
            } else {
                 try {
                    const jsonResponse = JSON.parse(message);
                    if (jsonResponse.introduction && Array.isArray(jsonResponse.services)) {
                        jsonResponse.services.forEach(serviceObject => {
                            if (serviceObject.is_new) {
                                saveAndRenderNewLocalService(serviceObject);
                            }
                        });

                        let cleanText = `${jsonResponse.introduction}\n\n${jsonResponse.closing}\n\n`;
                        if (jsonResponse.sales_pitch) cleanText += `Argumento de venta: ${jsonResponse.sales_pitch}\n\n`;
                        if (jsonResponse.client_questions) cleanText += `Preguntas para el cliente: ${jsonResponse.client_questions.join(' ')}`;
                        textToSpeak = cleanText;
                        
                        let messageText = `${jsonResponse.introduction.replace(/\n/g, '<br>')}`;
                        let serviceButtonsHTML = '';
                        
                        jsonResponse.services.forEach(serviceObject => {
                            const serviceInfo = findServiceById(serviceObject.id);
                            if (serviceInfo) {
                                 serviceButtonsHTML += createServiceButtonHTML(serviceInfo.item.id, serviceInfo.type, serviceInfo.item.name);
                            } else {
                                console.warn(`Servicio recomendado no encontrado: ID=${serviceObject.id}`);
                                 serviceButtonsHTML += `<button class="add-service-btn bg-red-900 text-white font-bold py-2 px-4 rounded-lg mt-2 mr-2 cursor-not-allowed" disabled>Error: "${serviceObject.name}" no encontrado</button>`;
                            }
                        });
                        
                        if (jsonResponse.closing) messageText += `<br><br>${jsonResponse.closing.replace(/\n/g, '<br>')}`;
                        finalHTML = messageText;
                        
                        if (serviceButtonsHTML) finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600"><p class="text-sm font-bold text-purple-300 mb-2">Acciones Rápidas:</p><div class="flex flex-wrap gap-2">${serviceButtonsHTML}</div></div>`;

                        if (Array.isArray(jsonResponse.client_questions) && jsonResponse.client_questions.length > 0) {
                            let questionButtonsHTML = jsonResponse.client_questions.map(question => {
                                const escapedQuestion = question.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                                return `<button onclick='document.getElementById("chat-input").value = "Mi cliente respondió a \\'${escapedQuestion}\\', y dijo que..."; document.getElementById("chat-input").focus();' class="suggested-question-btn text-left text-sm bg-slate-800 text-slate-300 py-2 px-3 rounded-lg hover:bg-slate-600 transition duration-200 mt-2 w-full">❔ ${question}</button>`;
                            }).join('');
                            finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600"><p class="text-sm font-bold text-yellow-300 mb-2">Pregúntale a tu Cliente:</p><div class="flex flex-col items-start gap-2">${questionButtonsHTML}</div></div>`;
                        }
                        
                        if (jsonResponse.sales_pitch) {
                            const pitchId = `pitch-${Date.now()}`;
                            finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600"><p class="text-sm font-bold text-green-300 mb-2">Argumento de Venta (Para tu Cliente):</p><div class="p-3 bg-slate-800 rounded-lg border border-slate-600 relative"><p id="${pitchId}" class="text-slate-200 text-sm">${jsonResponse.sales_pitch.replace(/\n/g, '<br>')}</p><button onclick="navigator.clipboard.writeText(document.getElementById('${pitchId}').innerText); this.innerText='¡Copiado!';" class="absolute top-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">Copiar</button></div></div>`;
                        }
                    }
                } catch (e) { /* No es JSON, es texto plano (objeción, etc) */ }
            }

            const escapedTextToSpeak = textToSpeak.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            const ttsButtonHTML = `<button onclick='window.handleTTSButtonClick(this)' data-text='${escapedTextToSpeak}' class="tts-btn absolute bottom-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">▶️ Escuchar</button>`;
            finalHTML = `<div class="pr-20 pb-2">${finalHTML}</div>${ttsButtonHTML}`;
        }

        if (sender === 'user') {
            wrapper.classList.add('items-end');
            bubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
        } else {
            wrapper.classList.add('items-start');
            bubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            if (shouldAutoplay) {
                setTimeout(() => {
                    const lastButton = bubble.querySelector('.tts-btn');
                    if (lastButton) ttsManager.speak(lastButton.dataset.text, lastButton);
                }, 300);
            }
        }
        bubble.innerHTML = finalHTML;
        wrapper.appendChild(bubble);
        chatMessagesContainer.appendChild(wrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    async function sendMessage() {
        ttsManager.stop();
        shouldAutoplay = true;
        const userMessage = chatInput.value.trim();
        if (!userMessage || isSending) return;

        const apiKey = getSessionApiKey();
        if (!apiKey) {
            showApiKeyModal();
            showNotification('error', 'API Key Requerida', 'Por favor, introduce tu API Key de Google AI para usar el asistente.');
            return;
        }

        isSending = true;
        sendChatBtn.disabled = true;
        addMessageToChat(userMessage, 'user');
        
        const { selectedServices } = getState();
        const simpleSelectedServices = selectedServices.map(({ id, name, type }) => ({ id, name, type }));
        
        const payload = { 
            userMessage: userMessage, 
            history: chatHistory,
            mode: currentAiMode,
            selectedServicesContext: simpleSelectedServices,
            apiKey: apiKey 
        };

        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] }); 
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
            saveChatHistory(chatHistory);
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
    
        try {
            const loadedHistory = loadChatHistory();
            if (!Array.isArray(loadedHistory)) {
                throw new Error("El historial guardado no es un array.");
            }
            
            // Si el historial está vacío, iniciamos con el mensaje de bienvenida.
            if (loadedHistory.length === 0) {
                throw new Error("Historial no encontrado o vacío.");
            }

            // Validamos cada mensaje. Si alguno es corrupto, descartamos todo el historial.
            loadedHistory.forEach(msg => {
                if (!msg || typeof msg.role !== 'string' || !Array.isArray(msg.parts) || msg.parts.length === 0 || !msg.parts[0] || typeof msg.parts[0].text !== 'string') {
                    throw new Error(`Mensaje corrupto encontrado: ${JSON.stringify(msg)}`);
                }
            });
            
            chatHistory = loadedHistory;
            shouldAutoplay = false; 
            chatHistory.forEach(msg => addMessageToChat(msg.parts[0].text, msg.role));
    
        } catch (error) {
            console.warn("Fallo al cargar el historial, se reiniciará el chat:", error.message);
            
            localStorage.removeItem('zenChatHistory');
            chatHistory = []; // Asegurarse de que el historial en memoria esté vacío
            shouldAutoplay = true; 
            
            const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios.';
            addMessageToChat(welcomeMessage, 'model');
            chatHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });
            saveChatHistory(chatHistory);
        }
    
        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); sendMessage(); }
        });
    
        chatMessagesContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action="add-service"]');
            if (target && !target.disabled) {
                const { serviceId, serviceType } = target.dataset;
                const elementId = serviceType === 'plan' ? `plan-${serviceId}` : `standard-${serviceId}`;
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
    updateChatUIForMode();
});
