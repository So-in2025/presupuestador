// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant.
 * VERSIÓN MEJORADA CON TEXT-TO-SPEECH (TTS).
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

    // --- INICIO: NUEVO BLOQUE DEL MOTOR Y SELECTOR TTS ---

    let voices = [];
    let selectedVoiceURI = localStorage.getItem('zenAssistantVoiceURI');
    let shouldAutoplay = true; // El autoplay está activado por defecto

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
            if (this.isPlaying) {
                this.stop();
                // Si el usuario presionó el mismo botón para detener, no inicies de nuevo
                if (buttonElement && buttonElement.classList.contains('was-playing')) {
                    buttonElement.classList.remove('was-playing');
                    return;
                }
            }
            
            shouldAutoplay = true; // Reactiva el autoplay si se inicia manualmente
            const utterance = new SpeechSynthesisUtterance(text);
            const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);

            if (selectedVoice) {
                utterance.voice = selectedVoice;
            } else {
                 // Fallback a la primera voz en español si la guardada no existe
                const fallbackVoice = voices.find(v => v.lang.startsWith('es-'));
                if (fallbackVoice) utterance.voice = fallbackVoice;
            }

            utterance.lang = 'es-ES';
            utterance.rate = 1.05;
            utterance.pitch = 1;

            utterance.onstart = () => {
                this.isPlaying = true;
                if (buttonElement) {
                    document.querySelectorAll('.tts-btn.playing').forEach(btn => btn.classList.remove('playing', 'was-playing'));
                    buttonElement.innerHTML = '⏹️ Detener';
                    buttonElement.classList.add('playing', 'was-playing');
                }
            };

            utterance.onend = () => {
                this.isPlaying = false;
                if (buttonElement) {
                    buttonElement.innerHTML = '▶️ Escuchar';
                    buttonElement.classList.remove('playing', 'was-playing');
                }
            };
            
            window.speechSynthesis.speak(utterance);
        }
    };

    function populateVoiceList() {
        voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es-'));
        const voiceSelect = document.getElementById('voice-selector');
        if (!voiceSelect || voices.length === 0) return;

        voiceSelect.innerHTML = '';
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.setAttribute('data-uri', voice.voiceURI);
            voiceSelect.appendChild(option);
        });

        if (selectedVoiceURI) {
            voiceSelect.value = voices.find(v => v.voiceURI === selectedVoiceURI)?.name;
        }
        
        // Si no hay voz guardada, selecciona Google Español por defecto
        if (!voiceSelect.value) {
            const googleVoice = voices.find(v => v.name.includes('Google') && v.name.includes('español'));
            if (googleVoice) {
                 voiceSelect.value = googleVoice.name;
                 selectedVoiceURI = googleVoice.voiceURI;
                 localStorage.setItem('zenAssistantVoiceURI', selectedVoiceURI);
            }
        }
    }
    
    function createVoiceSelector() {
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'mb-2 p-2 bg-slate-800 rounded-md flex items-center gap-2';
        selectorContainer.innerHTML = `
            <label for="voice-selector" class="text-sm font-bold text-slate-300">Voz:</label>
            <select id="voice-selector" class="w-full styled-input text-sm text-cyan-300"></select>
        `;
        chatMessagesContainer.parentNode.insertBefore(selectorContainer, chatMessagesContainer);

        const voiceSelect = document.getElementById('voice-selector');
        voiceSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            selectedVoiceURI = selectedOption.getAttribute('data-uri');
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

    // --- FIN: NUEVO BLOQUE DEL MOTOR Y SELECTOR TTS ---

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
        bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%] relative';
        
        let finalHTML = message.replace(/\n/g, '<br>');
        let textToSpeak = message;

        if (sender === 'ai') {
            try {
                const jsonResponse = JSON.parse(message);
                if (jsonResponse.introduction && Array.isArray(jsonResponse.services)) {
                    
                    let cleanText = `${jsonResponse.introduction}\n\n${jsonResponse.closing}\n\n`;
                    if (jsonResponse.sales_pitch) {
                        cleanText += `Aquí tienes un argumento de venta para tu cliente: ${jsonResponse.sales_pitch}\n\n`;
                    }
                    if (jsonResponse.client_questions) {
                        cleanText += `Para definir mejor el proyecto, puedes preguntarle a tu cliente: ${jsonResponse.client_questions.join(' ')}`;
                    }
                    textToSpeak = cleanText;
                    
                    let messageText = `${jsonResponse.introduction.replace(/\n/g, '<br>')}`;
                    let serviceButtonsHTML = '';
                    
                    jsonResponse.services.forEach(serviceId => {
                        const serviceInfo = findServiceById(serviceId);
                        if (serviceInfo) serviceButtonsHTML += createServiceButtonHTML(serviceId, serviceInfo.type, serviceInfo.item.name);
                        else console.warn(`Servicio recomendado no encontrado en catálogo: ${serviceId}`);
                    });
                    
                    if (jsonResponse.closing) messageText += `<br><br>${jsonResponse.closing.replace(/\n/g, '<br>')}`;
                    
                    finalHTML = messageText;
                    
                    if (serviceButtonsHTML) {
                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                            <p class="text-sm font-bold text-purple-300 mb-2">Acciones Rápidas:</p>
                            <div class="flex flex-wrap gap-2">${serviceButtonsHTML}</div>
                        </div>`;
                    }

                    if (Array.isArray(jsonResponse.client_questions) && jsonResponse.client_questions.length > 0) {
                        let questionButtonsHTML = '';
                        jsonResponse.client_questions.forEach(question => {
                            const escapedQuestion = question.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            questionButtonsHTML += `<button onclick='document.getElementById("chat-input").value = "Mi cliente respondió a \\'${escapedQuestion}\\', y dijo que..."; document.getElementById("chat-input").focus();' 
                                class="suggested-question-btn text-left text-sm bg-slate-800 text-slate-300 py-2 px-3 rounded-lg hover:bg-slate-600 transition duration-200 mt-2 w-full">
                                ❔ ${question}
                            </button>`;
                        });

                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                            <p class="text-sm font-bold text-yellow-300 mb-2">Pregúntale a tu Cliente:</p>
                            <div class="flex flex-col items-start gap-2">${questionButtonsHTML}</div>
                        </div>`;
                    }
                    
                    if (jsonResponse.sales_pitch) {
                        const pitchId = `pitch-${Date.now()}`;
                        finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                            <p class="text-sm font-bold text-green-300 mb-2">Argumento de Venta (Para tu Cliente):</p>
                            <div class="p-3 bg-slate-800 rounded-lg border border-slate-600 relative">
                                <p id="${pitchId}" class="text-slate-200 text-sm">${jsonResponse.sales_pitch.replace(/\n/g, '<br>')}</p>
                                <button onclick="navigator.clipboard.writeText(document.getElementById('${pitchId}').innerText); this.innerText='¡Copiado!';"
                                    class="absolute top-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">
                                    Copiar
                                </button>
                            </div>
                        </div>`;
                    }
                }
            } catch (e) { /* No es JSON, es texto plano */ }

            const escapedTextToSpeak = textToSpeak.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            const ttsButtonHTML = `
                <button onclick='ttsManager.speak(this.dataset.text, this); shouldAutoplay = false;' 
                        data-text='${escapedTextToSpeak}'
                        class="tts-btn absolute bottom-2 right-2 text-xs bg-slate-900 text-cyan-300 font-bold py-1 px-2 rounded hover:bg-cyan-800 transition">
                    ▶️ Escuchar
                </button>
            `;
            finalHTML = `<div class="pr-20 pb-2">${finalHTML}</div>${ttsButtonHTML}`;
        }

        if (sender === 'user') {
            wrapper.classList.add('items-end');
            bubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
            bubble.innerHTML = finalHTML;
        } else {
            wrapper.classList.add('items-start');
            bubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            bubble.innerHTML = finalHTML;
            
            if (shouldAutoplay) {
                setTimeout(() => {
                    const lastButton = bubble.querySelector('.tts-btn');
                    if (lastButton) ttsManager.speak(lastButton.dataset.text, lastButton);
                }, 300);
            }
        }

        wrapper.appendChild(bubble);
        chatMessagesContainer.appendChild(wrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    async function sendMessage() {
        ttsManager.stop();
        shouldAutoplay = true;
        const userMessage = chatInput.value.trim();
        if (!userMessage || isSending) return;

        isSending = true;
        sendChatBtn.disabled = true;
        addMessageToChat(userMessage, 'user');
        
        const payload = { userMessage: userMessage, history: chatHistory };
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