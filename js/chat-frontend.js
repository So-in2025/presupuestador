// /js/chat-frontend.js

document.addEventListener('DOMContentLoaded', () => {
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');
    const summaryCard = document.getElementById('summaryCard');

    if (!chatMessagesContainer || !chatInput || !sendChatBtn) return;
    
    // --- Nivel 3: Persistencia de la Conversación ---
    // Carga el historial desde localStorage o empieza uno nuevo.
    let chatHistory = JSON.parse(localStorage.getItem('zenChatHistory')) || [];

    function saveHistory() {
        localStorage.setItem('zenChatHistory', JSON.stringify(chatHistory));
    }

    // --- Nivel 1: Recomendaciones Accionables ---
    // Esta función ahora crea botones clicables para los servicios recomendados.
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
            
            if (message.includes('Servicios:') && message.includes('Respuesta:')) {
                const servicesMatch = message.match(/Servicios:\s*([\w\s,]+)/);
                const responseText = message.substring(message.indexOf('Respuesta:') + 'Respuesta:'.length).trim();
                let htmlContent = '';

                if (servicesMatch && servicesMatch[1]) {
                    const serviceIDs = servicesMatch[1].trim().split(',').map(s => s.trim());
                    htmlContent += `
                        <div class="mb-3 p-2 border-l-4 border-purple-400 bg-slate-800 rounded-r-md">
                            <p class="text-sm font-bold text-purple-300 mb-2">Acción Rápida (Click para añadir):</p>
                            <div class="flex flex-wrap gap-2">
                                ${serviceIDs.map(id => {
                                    // Determina el tipo de servicio para encontrar el input correcto
                                    let type = 'standard';
                                    if (/^p\d+/.test(id)) type = 'package';
                                    else if (/^\d+$/.test(id)) type = 'plan'; // Si es solo número, es un plan
                                    
                                    return `<button class="px-2 py-1 text-xs font-mono bg-slate-900 text-cyan-300 rounded cursor-pointer hover:bg-cyan-800 transition" 
                                              data-action="add-service"
                                              data-service-id="${id}" 
                                              data-service-type="${type}">
                                        + ${id}
                                    </button>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
                htmlContent += responseText.replace(/\n/g, '<br>');
                messageBubble.innerHTML = htmlContent;
            } else {
                messageBubble.innerHTML = message.replace(/\n/g, '<br>');
            }
        }
        
        messageWrapper.appendChild(messageWrapper.appendChild(messageBubble));
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
        chatHistory.push({ role: 'user', content: userMessage });
        saveHistory(); // Nivel 3: Guarda el historial
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
            saveHistory(); // Nivel 3: Guarda el historial

        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            toggleTypingIndicator(false);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente: ${error.message}`, 'ai');
        }
    }

    function initChat() {
        // Nivel 3: Reconstruye el chat al cargar la página
        if (chatHistory.length > 0) {
            chatHistory.forEach(turn => addMessageToChat(turn.content, turn.role === 'user' ? 'user' : 'ai'));
        } else {
            const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.';
            addMessageToChat(welcomeMessage, 'ai');
        }

        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
        
        // --- Nivel 1: Listener para los botones de servicio ---
        chatMessagesContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-action="add-service"]');
            if (target) {
                const { serviceId, serviceType } = target.dataset;
                let elementId;

                // Construye el ID del elemento input basado en el tipo
                if (serviceType === 'plan') {
                    elementId = `plan-${serviceId}`;
                } else {
                    elementId = `${serviceType}-${serviceId}`;
                }
                
                const serviceElement = document.getElementById(elementId);
                
                if (serviceElement) {
                    serviceElement.click(); // Simula el clic
                    
                    if(summaryCard) {
                        summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    
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