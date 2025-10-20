// /js/chat-frontend.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SELECTORES DEL DOM ---
    const chatMessagesContainer = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('chat-send-btn');

    // Salir si no estamos en la página del presupuestador
    if (!chatMessagesContainer || !chatInput || !sendChatBtn) {
        return;
    }

    // --- 2. ESTADO DEL CHAT ---
    let chatHistory = [];

    // --- 3. FUNCIONES DE LA INTERFAZ DEL CHAT ---

    function addMessageToChat(message, sender) {
        // Estilos base para el contenedor del mensaje
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'chat-message flex flex-col';
        
        // Estilos para la burbuja del chat
        const messageBubble = document.createElement('div');
        messageBubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';
        messageBubble.innerHTML = message; // Usamos innerHTML para renderizar <br> y formato

        if (sender === 'user') {
            messageWrapper.classList.add('items-end'); // Alinear a la derecha
            messageBubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
        } else {
            messageWrapper.classList.add('items-start'); // Alinear a la izquierda
            messageBubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
        }
        
        messageWrapper.appendChild(messageBubble);
        chatMessagesContainer.appendChild(messageWrapper);
        
        // Auto-scroll hacia el último mensaje
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

    // --- 4. LÓGICA DE COMUNICACIÓN ---

    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (userMessage === '') return;

        addMessageToChat(userMessage, 'user');
        chatHistory.push({ role: 'user', content: userMessage });
        chatInput.value = '';
        toggleTypingIndicator(true);

        try {
            // Llamada a tu Netlify Function
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
            
            // Reemplazamos saltos de línea del modelo por <br> para HTML
            const formattedResponse = data.response.replace(/\n/g, '<br>');

            addMessageToChat(formattedResponse, 'ai');
            chatHistory.push({ role: 'assistant', content: data.response });

        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            toggleTypingIndicator(false);
            addMessageToChat(`Lo siento, hubo un error de conexión con el asistente: ${error.message}`, 'ai');
        }
    }

    // --- 5. INICIALIZACIÓN ---

    function initChat() {
        const welcomeMessage = '¡Hola! Soy tu asistente IA de ventas. Descríbeme la necesidad de tu cliente y te recomendaré los servicios ideales del catálogo.';
        addMessageToChat(welcomeMessage, 'ai');
        chatHistory.push({ role: 'assistant', content: welcomeMessage });

        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Evita que el Enter haga un salto de línea
                sendMessage();
            }
        });
    }

    initChat();
});