// /js/chat-frontend.js
/**
 * @file Frontend logic for the Zen Assistant chatbot.
 * @description This script handles all user interactions with the chat interface.
 * 1. Manages the chat UI (displaying messages, typing indicators).
 * 2. Manages the temporary in-memory chat history for the current session.
 * 3. Communicates with the Netlify serverless function backend.
 * 4. Handles user input and clicks on actionable recommendations.
 * @author Gemini Assistant (Refactored for Production)
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Element Caching ---
    // Cache all necessary DOM elements on load for performance.
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');
    const summaryCard = document.getElementById('summaryCard');

    // Failsafe: if essential elements aren't found, do nothing.
    if (!chatMessagesContainer || !chatInput || !sendChatBtn) {
        console.error("Error crítico: No se encontraron los elementos esenciales del chat en el DOM.");
        return;
    }
    
    // --- 2. State Management ---
    // The history is temporary and only lives in memory for the current page session.
    let chatHistory = [];

    // --- 3. UI Rendering Functions ---

    /**
     * Renders a new message bubble in the chat window.
     * @param {string} message - The text content of the message.
     * @param {string} role - The role of the sender ('user' or 'model').
     */
    function addMessageToChat(message, role) {
        const sender = (role === 'user') ? 'user' : 'ai'; // 'sender' is for CSS class styling
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'chat-message flex flex-col';
        
        const messageBubble = document.createElement('div');
        messageBubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';

        if (sender === 'user') {
            messageWrapper.classList.add('items-end');
            messageBubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
            messageBubble.textContent = message;
        } else { // AI ('model') messages
            messageWrapper.classList.add('items-start');
            messageBubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            
            // Intelligent parsing for structured AI responses
            if (message.includes('Servicios:') && message.includes('Respuesta:')) {
                const servicesMatch = message.match(/Servicios:\s*([\w\d\s,-]+)/);
                const responseText = message.substring(message.indexOf('Respuesta:') + 'Respuesta:'.length).trim();
                let htmlContent = '';
                if (servicesMatch && servicesMatch[1].trim()) {
                    const serviceIDs = servicesMatch[1].trim().split(',').map(s => s.trim());
                    htmlContent += `<div class="mb-3 p-2 border-l-4 border-purple-400 bg-slate-800 rounded-r-md"><p class="text-sm font-bold text-purple-300 mb-2">Acción Rápida (Click para añadir):</p><div class="flex flex-wrap gap-2">${serviceIDs.map(id => {let type = 'standard'; if (/^p\d+/.test(id)) type = 'package'; else if (/^\d+$/.test(id)) type = 'plan'; return `<button class="px-2 py-1 text-xs font-mono bg-slate-900 text-cyan-300 rounded cursor-pointer hover:bg-cyan-800 transition" data-action="add-service" data-service-id="${id}" data-service-type="${type}">+ ${id}</button>`;}).join('')}</div></div>`;
                }
                htmlContent += responseText.replace(/\n/g, '<br>');
                messageBubble.innerHTML = htmlContent;
            } else {
                messageBubble.innerHTML = message.replace(/\n/g, '<br>');
            }
        }
        
        messageWrapper.appendChild(messageBubble);
        chatMessagesContainer.appendChild(messageWrapper);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    /**
     * Shows or hides the "typing..." indicator.
     * @param {boolean} show - True to show, false to hide.
     */
    function toggleTypingIndicator(show) {
        let indicator = document.getElementById('typing-indicator');
        if (show) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'typing-indicator';
                indicator.className = 'chat-message flex items-start';
                indicator.innerHTML = `<div class="chat-bubble bg-slate-700 rounded-bl-none p-3 flex items-center space-x-1"><span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: -0.32s;"></span><span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: -0.16s;"></span><span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></span></div>`;
                chatMessagesContainer.appendChild(indicator);
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }
        } else {
            if (indicator) indicator.remove();
        }
    }

    // --- 4. Core Logic ---

    /**
     * Handles sending the user's message to the backend and processing the response.
     */
    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (userMessage === '') return;

        addMessageToChat(userMessage, 'user');
        // The history must match the structure Google's API expects.
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        
        chatInput.value = '';
        chatInput.focus();
        toggleTypingIndicator(true);

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: chatHistory })
            });

            if (!response.ok) {
                // Try to parse the error from the backend for better debugging.
                const errorData = await response.json().catch(() => ({ error: 'Error de servidor no especificado.' }));
                throw new Error(errorData.error || `Error de red: ${response.statusText}`);
            }

            const data = await response.json();
            addMessageToChat(data.response, 'model');
            chatHistory.push({ role: 'model', parts: [{ text: data.response }] });

        } catch (error) {
            console.error("Error detallado al enviar mensaje:", error);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente. Por favor, intenta de nuevo.`, 'model');
        } finally {
            // This block ALWAYS runs, ensuring the typing indicator is removed.
            toggleTypingIndicator(false);
        }
    }
    
    /**
     * Initializes the chat on page load.
     */
    function initChat() {
        // Always start a fresh session on page load.
        chatMessagesContainer.innerHTML = '';
        chatHistory = [];

        const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.';
        addMessageToChat(welcomeMessage, 'model');
        // Add the welcome message to the session history for context.
        chatHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });

        // --- 5. Event Listeners ---

        sendChatBtn.addEventListener('click', sendMessage);
        
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent form submission
                sendMessage();
            }
        });
        
        // Event delegation for actionable service buttons
        chatMessagesContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action="add-service"]');
            if (target) {
                const { serviceId, serviceType } = target.dataset;
                const elementId = (serviceType === 'plan') ? `plan-${serviceId}` : `${serviceType}-${serviceId}`;
                const serviceElement = document.getElementById(elementId);
                
                if (serviceElement) {
                    serviceElement.click(); // Simulate a click on the checkbox/radio
                    if(summaryCard) summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Visual feedback on the button
                    target.classList.remove('bg-slate-900', 'text-cyan-300', 'hover:bg-cyan-800');
                    target.classList.add('bg-green-700', 'text-white', 'cursor-default');
                    target.textContent = `Añadido ✔️`;
                    target.disabled = true;
                } else {
                     target.textContent = `No encontrado`;
                     target.disabled = true;
                }
            }
        });
    }

    // Start the application.
    initChat();
});