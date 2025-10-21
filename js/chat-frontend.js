// /js/chat-frontend.js
/**
 * Frontend logic for Zen Assistant using Gemini 2.5 Flash Lite.
 * Comunicates with Netlify serverless function backend.
 */

// Importamos el estado para poder acceder al catálogo de servicios
import { getState } from './state.js'; 

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

  // --- AYUDANTE DE BÚSQUEDA DE SERVICIOS (usa getState para acceder al catálogo) ---
  function findServiceById(id) {
    const { allServices, monthlyPlans } = getState();
    
    // Buscar en servicios estándar/paquetes
    for (const key in allServices) {
        const item = allServices[key].items.find(s => s.id === id);
        if (item) {
            // El tipo se infiere de la estructura del pricing.json (p1, s1, etc.)
            let type = 'standard';
            if (key === 'completeWebs' || key === 'complexPackages') {
                type = 'package';
            }
            return { name: item.name, type: type };
        }
    }

    // Buscar en planes mensuales
    const plan = monthlyPlans.find(p => p.id == id);
    if (plan) {
        return { name: plan.name, type: 'plan' };
    }
    
    return null;
  }

  // --- AYUDANTE DE CREACIÓN DE BOTONES ---
  function createServiceButtonHTML(serviceId, serviceType, serviceName) {
    // Aseguramos que el type sea 'plan', 'package', o 'standard' para la función del clic en el frontend
    const type = serviceType === 'plan' ? 'plan' : serviceType; // Usamos el tipo directo
    
    // El texto del botón ahora usa el nombre del servicio (serviceName)
    return `<button 
        data-action="add-service" 
        data-service-id="${serviceId}" 
        data-service-type="${type}" 
        class="bg-slate-900 text-cyan-300 font-bold py-2 px-4 rounded-lg hover:bg-cyan-800 hover:text-white transition duration-200 mt-2 mr-2">
        Añadir ${serviceName}
    </button>`;
  }

  function addMessageToChat(message, role) {
    const sender = role === 'user' ? 'user' : 'ai';
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message flex flex-col';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble p-3 rounded-lg max-w-[85%]';
    
    let finalHTML = message.replace(/\n/g, '<br>');

    if (sender === 'ai') {
        // --- LÓGICA DE PARSEO JSON (Recomendación de Servicios) ---
        try {
            const jsonResponse = JSON.parse(message);
            if (jsonResponse.message && Array.isArray(jsonResponse.recommendations)) {
                // 1. Usar el mensaje de texto del JSON
                let messageText = jsonResponse.message.replace(/\n/g, '<br>');
                let buttonsHTML = '';
                
                // 2. Generar los botones HTML
                jsonResponse.recommendations.forEach(rec => {
                    const serviceInfo = findServiceById(rec.id);
                    if (serviceInfo) {
                        // AQUÍ ES DONDE SE USA serviceInfo.name
                        buttonsHTML += createServiceButtonHTML(rec.id, serviceInfo.type, serviceInfo.name);
                    } else {
                        console.warn(`Servicio no encontrado en el catálogo: ${rec.id}`);
                        // En caso de no encontrarlo, al menos mostramos el ID para depurar
                        buttonsHTML += createServiceButtonHTML(rec.id, rec.type, `Servicio ID: ${rec.id}`);
                    }
                });
                
                finalHTML = messageText;
                
                if (buttonsHTML) {
                    finalHTML += `<div class="mt-3 pt-3 border-t border-slate-600">
                        <p class="text-sm font-bold text-purple-300 mb-2">Acción Rápida (Recomendación):</p>
                        <div class="flex flex-wrap gap-2">${buttonsHTML}</div>
                    </div>`;
                }
            }
        } catch (e) {
            // El mensaje no es JSON (es un mensaje de ASSIST_SALES o un error), 
            // se procesa como texto simple.
        }
    }
    // --- FIN LÓGICA DE PARSEO JSON ---

    if (sender === 'user') {
      wrapper.classList.add('items-end');
      bubble.classList.add('bg-cyan-500', 'text-slate-900', 'rounded-br-none');
      bubble.textContent = message;
    } else {
      wrapper.classList.add('items-start');
      bubble.classList.add('bg-slate-700', 'text-slate-50', 'rounded-bl-none');
      bubble.innerHTML = finalHTML; // Usamos innerHTML para renderizar los botones
    }

    wrapper.appendChild(bubble);
    chatMessagesContainer.appendChild(wrapper);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function toggleTypingIndicator(show) {
    let indicator = document.getElementById('typing-indicator');
    if (show) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'chat-message flex items-start';
        indicator.innerHTML = `<div class="chat-bubble bg-slate-700 rounded-bl-none p-3 flex items-center space-x-1">
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
    if (!userMessage) return;

    addMessageToChat(userMessage, 'user');
    
    // Solo añadimos el mensaje del usuario al historial para la API
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
        const errorData = await response.json().catch(() => ({ error: 'Error de servidor no especificado.' }));
        throw new Error(errorData.error || `Error de red: ${response.statusText}`);
      }

      const data = await response.json();
      
      // La respuesta del servidor ya trae el historial completo, incluyendo la respuesta de la IA
      chatHistory = data.history; 
      
      // El último mensaje en el historial actualizado es la respuesta de la IA
      const aiResponseText = data.response; 
      
      // addMessageToChat ahora maneja el JSON/Texto.
      addMessageToChat(aiResponseText, 'model'); 

    } catch (error) {
      console.error("Error detallado al enviar mensaje:", error);
      addMessageToChat("Lo siento, hubo un error de conexión con el asistente. Por favor, intenta de nuevo.", 'model');
    } finally {
      toggleTypingIndicator(false);
    }
  }

  function initChat() {
    chatMessagesContainer.innerHTML = '';
    chatHistory = [];

    const welcomeMessage = '¡Hola! Soy Zen Assistant. Describe el proyecto de tu cliente y te ayudaré a seleccionar los servicios exactos en la herramienta.';
    addMessageToChat(welcomeMessage, 'model');
    chatHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });

    sendChatBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
      }
    });

    // Delegación de eventos para los botones de servicio generados por la IA
    chatMessagesContainer.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action="add-service"]');
      if (target) {
        const { serviceId, serviceType } = target.dataset;
        const elementId = serviceType === 'plan' ? `plan-${serviceId}` : `${serviceType}-${serviceId}`;
        const serviceElement = document.getElementById(elementId);

        if (serviceElement) {
          serviceElement.click();
          if(summaryCard) summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Actualizar el estilo del botón
          target.classList.remove('bg-slate-900', 'text-cyan-300', 'hover:bg-cyan-800', 'hover:text-white');
          target.classList.add('bg-green-700', 'text-white', 'cursor-default');
          target.textContent = `Añadido ✔️`;
          target.disabled = true;
        } else {
          // Si por alguna razón el servicio no existe en el DOM (catálogo no cargado, error de ID)
          target.textContent = `No encontrado`;
          target.disabled = true;
        }
      }
    });
  }

  initChat();
});