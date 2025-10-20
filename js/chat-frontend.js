// /js/chat-frontend.js

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const summaryCard = document.getElementById('summaryCard');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn) return;
    
    let chatHistory = [];

    function addMessageToChat(message, role) {
        const sender = (role === 'user') ? 'user' : 'ai';
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'chat-message flex flex-col';
        const messageBubble = document.createElement('div');
        messageBubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';
        if (sender === 'user') {
            messageWrapper.classList.add('items-end');
            messageBubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
            messageBubble.textContent = message;
        } else {
            messageWrapper.classList.add('items-start');
            messageBubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            if (message.includes('Servicios:') && message.includes('Respuesta:')) {
                const servicesMatch = message.match(/Servicios:\s*([\w\s,]+)/);
                const responseText = message.substring(message.indexOf('Respuesta:') + 'Respuesta:'.length).trim();
                let htmlContent = '';
                if (servicesMatch && servicesMatch[1]) {
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

    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (userMessage === '') return;

        addMessageToChat(userMessage, 'user');
         // Formatea el mensaje para la API de Google con el campo 'data'
        chatHistory.push({ role: 'user', parts: [{ data: { text: userMessage } }] });
        
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
                const errorData = await response.json();
                throw new Error(errorData.error || 'Hubo un error en la respuesta del servidor.');
            }

            const data = await response.json();
            addMessageToChat(data.response, 'model');
            // Formatea la respuesta de la IA con el campo 'data'
            chatHistory.push({ role: 'model', parts: [{ data: { text: data.response } }] });

        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente. Intenta de nuevo.`, 'model');
        } finally {
            toggleTypingIndicator(false);
        }
    }
    
    function initChat() {
        
        chatMessagesContainer.innerHTML = '';
        chatHistory = [];

        const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.';
        // Formatea el mensaje de bienvenida con el campo 'data'
        chatHistory.push({ role: 'model', parts: [{ data: { text: welcomeMessage } }] });
        
        chatHistory.forEach(turn => addMessageToChat(turn.parts[0].data.text, turn.role));

        sendChatBtn.addEventListener('click', sendMessage);
        
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
        
        chatMessagesContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action="add-service"]');
            if (target) {
                const { serviceId, serviceType } = target.dataset;
                let elementId;
                if (serviceType === 'plan') elementId = `plan-${serviceId}`;
                else elementId = `${serviceType}-${serviceId}`;
                const serviceElement = document.getElementById(elementId);
                if (serviceElement) {
                    serviceElement.click();
                    if(summaryCard) summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    initChat();
});