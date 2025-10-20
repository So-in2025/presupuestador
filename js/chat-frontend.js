// /js/chat-frontend.js

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn) return;

    let chatHistory = [];

    // --- FUNCIÓN MEJORADA PARA MOSTRAR MENSAJES ---
    // Ahora puede parsear la respuesta estructurada de la IA.
    function addMessageToChat(message, sender) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'chat-message flex flex-col';
        
        const messageBubble = document.createElement('div');
        messageBubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';

        if (sender === 'user') {
            messageWrapper.classList.add('items-end');
            messageBubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
            messageBubble.textContent = message;
        } else { // Mensajes de la IA
            messageWrapper.classList.add('items-start');
            messageBubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
            
            // INTELIGENCIA DE PARSEO: Revisa si la respuesta tiene el formato esperado
            if (message.includes('Servicios:') && message.includes('Respuesta:')) {
                const servicesMatch = message.match(/Servicios:\s*([\w\s,]+)/);
                const responseText = message.substring(message.indexOf('Respuesta:') + 'Respuesta:'.length).trim();

                let htmlContent = '';
                if (servicesMatch && servicesMatch[1]) {
                    const serviceIDs = servicesMatch[1].trim().split(',').map(s => s.trim());
                    // Crea una caja de recomendación
                    htmlContent += `
                        <div class="mb-3 p-2 border-l-4 border-purple-400 bg-slate-800 rounded-r-md">
                            <p class="text-sm font-bold text-purple-300 mb-1">Recomendación de Servicios:</p>
                            <div class="flex flex-wrap gap-2">
                                ${serviceIDs.map(id => `<span class="px-2 py-1 text-xs font-mono bg-slate-900 text-cyan-300 rounded">${id}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }
                htmlContent += responseText.replace(/\n/g, '<br>'); // Añade el texto de venta
                messageBubble.innerHTML = htmlContent;
            } else {
                // Si no tiene el formato, muestra el mensaje tal cual (para errores, etc.)
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
                indicator.innerHTML = `
                    <div class="chat-bubble bg-slate-700 rounded-bl-none p-3 flex items-center space-x-1">
                        <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: -0.32s;"></span>
                        <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: -0.16s;"></span>
                        <span class="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></span>
                    </div>`;
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
        chatHistory.push({ role: 'user', content: userMessage });
        chatInput.value = '';
        chatInput.focus();
        toggleTypingIndicator(true);

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: chatHistory })
            });
            toggleTypingIndicator(false);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Hubo un error en la respuesta del servidor.');
            }

            const data = await response.json();
            addMessageToChat(data.response, 'ai');
            chatHistory.push({ role: 'assistant', content: data.response });

        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            toggleTypingIndicator(false);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente: ${error.message}`, 'ai');
        }
    }

    function initChat() {
        const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.';
        addMessageToChat(welcomeMessage, 'ai');
        // No añadimos el mensaje de bienvenida al historial de la API para evitar errores.

        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
    }

    initChat();
});