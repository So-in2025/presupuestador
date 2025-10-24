// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant usando Gemini.
 * Se comunica con la función serverless de Netlify (chat.js) para la lógica de IA.
 * * * RUTA FINAL CORRECTA: Usando '/netlify/functions/chat' según la ruta que el usuario quiere usar.
 * * CORRECCIÓN DE ROBUSTEZ: Se mantiene lógica para evitar el 'SyntaxError: Unexpected end of JSON input'
 * en caso de errores de servidor (404, 500) al fallar la lectura del JSON.
 * * CORRECCIÓN DE HISTORIAL: Se mantiene la lógica de sincronización de historial con el backend.
 */

// Importamos el estado para poder acceder al catálogo de servicios (necesario para el helper)
import { getState } from './state.js'; 
import { showNotification } from './modals.js';
import { updateSelectedItems, clearAllSelections } from './app.js';
import { handlePlanSelection } from './points.js';

document.addEventListener('DOMContentLoaded', () => {
  const chatMessagesContainer = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendChatBtn = document.getElementById('chat-send-btn');
  const summaryCard = document.getElementById('summaryCard'); // Referencia al panel de resumen

  if (!chatMessagesContainer || !chatInput || !sendChatBtn) {
    console.error("Elementos esenciales del chat no encontrados.");
    return;
  }

  // Historial del chat para mantener el contexto con la API de Gemini
  // Contiene objetos { role: 'user'/'model', parts: [{ text: '...' }] }
  let chatHistory = [];
  let isSending = false;

  // --- AYUDANTE DE BÚSQUEDA DE SERVICIOS (usa getState para acceder al catálogo) ---
  /**
   * Busca un servicio en el catálogo (allServices y monthlyPlans) por su ID.
   * @param {string} id - El ID del servicio a buscar (ej: 'p1', 's5', 'm1').
   * @returns {Object|null} Objeto {type: string, item: Object} o null.
   */
const findServiceById = (id) => {
      const state = getState();
      
      // Primero, busca en los Planes Mensuales (esto estaba bien)
      let plan = state.monthlyPlans.find(p => p.id == id || `plan-${p.id}` === id);
      if (plan) return { type: 'monthly', item: plan };

      // Ahora, busca en TODOS los demás servicios (CORREGIDO)
      // 1. Aplanamos todas las categorías de 'allServices' en un único array de items.
      const allStandardServices = Object.values(state.allServices).flatMap(category => category.items);
      
      // 2. Buscamos el servicio por su ID en ese array aplanado.
      let service = allStandardServices.find(s => s.id === id);
      
      if (service) {
        // 3. Si lo encontramos, determinamos su tipo para manejarlo correctamente.
        const isPackage = Object.values(state.allServices).find(cat => cat.isExclusive && cat.items.some(i => i.id === id));
        
        let serviceType = 'standard'; // Tipo por defecto
        if (isPackage) {
            serviceType = 'package';
        } else if (service.pointCost) {
            serviceType = 'plan-service';
        }

        return { type: serviceType, item: service };
      }

      // Si no se encontró en ningún lado, retorna null.
      return null;
  };

  // --- RENDERING DE CHAT ---

  /**
   * Añade un mensaje al contenedor del chat.
   * @param {string} role - 'user' o 'model'.
   * @param {string} content - Contenido del mensaje.
   */
  const renderMessage = (role, content) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    // Usamos el 'ai-message' como contenedor base para los mensajes del modelo
    let innerClass = role === 'user' ? 'user-message text-right' : 'ai-message text-left';
    
    // Estilos para diferenciar mensajes de IA y usuario
    const bgColor = role === 'user' ? 'bg-indigo-700 text-white' : 'card-bg text-slate-50 border border-slate-700';

    messageDiv.innerHTML = `
      <div class="max-w-[85%] p-3 text-sm whitespace-pre-wrap rounded-xl ${bgColor} ${innerClass}">
        ${content}
      </div>
    `;
    chatMessagesContainer.appendChild(messageDiv);
    // Desplazarse al último mensaje
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  };
  
  /**
   * Renderiza el contenido del mensaje de la IA. Si es JSON, lo parsea y muestra la recomendación.
   * @param {string} content - La respuesta cruda de la API (Texto o JSON stringificado).
   * @returns {string} El contenido HTML/Texto a mostrar en el chat.
   */
  const renderMessageContent = (content) => {
    // Intentamos parsear como JSON
    try {
      const { response_text, recommended_services } = parseRecommendedServices(content);

      if (recommended_services && recommended_services.length > 0) {
        // Estructura JSON válida de recomendación
        let html = `<p class="mb-3 font-semibold">${response_text.introduction.replace(/\n/g, '<br>')}</p>`;
        html += '<div class="space-y-2 mt-4 recommendation-list">';
        
        // Renderizar los botones de recomendación
        recommended_services.forEach(service => {
          html += `
            <button data-service-id="${service.id}" 
                    class="add-service-btn w-full text-left p-3 bg-slate-900 text-cyan-300 rounded-lg hover:bg-cyan-800 hover:text-white transition duration-200 shadow-md">
              <span class="font-bold">${service.name}</span>
              <span class="text-sm block text-slate-400">(${service.id}) - Añadir a Propuesta</span>
            </button>
          `;
        });
        html += `</div><p class="mt-3 text-sm text-slate-400">${response_text.closing.replace(/\n/g, '<br>')}</p>`;
        return html;
      }
      // Si se pudo parsear pero el array de servicios estaba vacío o no era una recomendación
      return response_text.introduction.replace(/\n/g, '<br>');

    } catch (e) {
      // Si falla el parseo, es un mensaje de texto normal
      return content.replace(/\n/g, '<br>');
    }
  };

  /**
   * Intenta parsear la respuesta de Gemini como una recomendación de servicios.
   * Espera la estructura JSON: { introduction: string, services: string[], closing: string }
   * @param {string} text - El string de respuesta de la API.
   * @returns {Object} {response_text: {introduction: string, closing: string}, recommended_services: Array<Object>} o lanza un error.
   */
  const parseRecommendedServices = (text) => {
    let jsonString = text.trim();
    
    // 1. Verificar si parece JSON y limpiar el string si contiene ```json
    if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7, jsonString.lastIndexOf('```')).trim();
    } 
    
    // 2. Parsear el JSON
    const recommendation = JSON.parse(jsonString); 
    
    // 3. Validar la estructura esencial 
    if (recommendation.error || !recommendation.services || !Array.isArray(recommendation.services)) {
        // Si es un JSON de error del backend, usamos el mensaje como introducción
        const introduction = recommendation.message || 'La IA no pudo generar una recomendación válida.';
        return {
            response_text: { introduction, closing: '' },
            recommended_services: []
        };
    }
    
    // 4. Enriquecer los IDs de servicio con su nombre
    const enrichedServices = recommendation.services.map(id => {
        const serviceData = findServiceById(id);
        // Si el servicio existe en el catálogo, lo incluimos
        return serviceData ? { id: id, name: serviceData.item.name, type: serviceData.type } : null; 
    }).filter(s => s !== null); // Filtramos cualquier ID que no se haya encontrado

    // 5. Devolver el resultado final
    return {
        response_text: {
            introduction: recommendation.introduction || 'Recomendación de servicios:',
            closing: recommendation.closing || 'Haz clic en los botones para añadir los servicios a tu propuesta.'
        },
        recommended_services: enrichedServices
    };
  };

  // --- LÓGICA DE ENVÍO Y RECEPCIÓN ---

  /**
   * Envía el mensaje del usuario al backend de Netlify.
   * @param {string} userMessage - Mensaje del usuario.
   */
  const sendChat = async (userMessage) => {
    const trimmedMessage = userMessage.trim();
    if (isSending || !trimmedMessage) return;

    isSending = true;
    sendChatBtn.disabled = true;
    chatInput.value = ''; // Limpiar la entrada inmediatamente

    // 1. Renderizar mensaje de usuario
    renderMessage('user', trimmedMessage);
    
    // 2. Construir el historial a enviar a la API (Historial existente + mensaje de usuario actual)
    const historyForApi = [
        ...chatHistory,
        { role: 'user', parts: [{ text: trimmedMessage }] }
    ];

    // 3. Renderizar indicador de carga (AI)
    const loadingMessageId = 'loading-' + Date.now();
    renderMessage('model', `<div id="${loadingMessageId}" class="flex items-center space-x-2 text-slate-400">
        <div class="h-2 w-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0s;"></div>
        <div class="h-2 w-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
        <div class="h-2 w-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0.4s;"></div>
        <span>Escribiendo...</span>
    </div>`);

    // 4. Llamada a la función Netlify (segura)
    try {
      // ************* RUTA DEFINITIVA A USAR *************
      const apiUrl = `/netlify/functions/chat`; 

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Enviamos el historial TEMPORAL que incluye el último mensaje de usuario
        body: JSON.stringify({ userMessage: trimmedMessage, history: historyForApi }) 
      });

      // --- CORRECCIÓN CRÍTICA DE ROBUSTEZ ---
      let data = {};
      let responseText = null;
      
      // Si la respuesta HTTP no es 200 (ej: 404, 500), leemos el cuerpo como texto para evitar SyntaxError.
      if (response.ok) {
          data = await response.json();
      } else {
          responseText = await response.text(); 
      }
      // ----------------------------------------
      
      // 5. Eliminar el indicador de carga
      const loadingEl = document.getElementById(loadingMessageId);
      if (loadingEl && loadingEl.parentElement) {
          loadingEl.parentElement.remove();
      }

      // La condición de error se actualiza para manejar errores HTTP (response.ok=false)
      if (!response.ok) { 
        // Generamos un mensaje de error más claro.
        const errorMessage = `Error de servidor (${response.status}). Asegúrate de que tu carpeta 'netlify/functions' existe, contiene 'chat.js' y las variables de entorno están configuradas.`;
        renderMessage('model', `<span class="text-red-400 font-bold">Error de Conexión:</span> ${errorMessage}`);
        
      } else if (data.error) { // Error devuelto por chat.js (código 200 con payload de error)
        const errorMessage = data.message || "La IA no pudo procesar la solicitud.";
        renderMessage('model', `<span class="text-red-400 font-bold">Error del Asistente:</span> ${errorMessage}`);
        
      } else {
        const aiResponseContent = renderMessageContent(data.response);
        renderMessage('model', aiResponseContent);
        
        // 6. Sincronización CRÍTICA: Reemplazamos el historial con el historial completo y validado del backend.
        chatHistory = data.history; 
      }

    } catch (error) {
      console.error("Error al enviar el chat:", error);
      // Eliminar el indicador de carga si existe
      const loadingEl = document.getElementById(loadingMessageId);
      if (loadingEl && loadingEl.parentElement) {
          loadingEl.parentElement.remove();
      }
      // Este catch captura errores de red o errores fatales ANTES de la llamada fetch.
      renderMessage('model', '<span class="text-red-400 font-bold">Error de Conexión:</span> Hubo un problema de red. Por favor, inténtalo de nuevo.');
    } finally {
      isSending = false;
      sendChatBtn.disabled = false;
      // Desplazarse al último mensaje
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; 
    }
  };

  // --- MANEJO DE EVENTOS ---

  // Botón de Envío
  sendChatBtn.addEventListener('click', () => {
    sendChat(chatInput.value);
  });

  // Tecla Enter
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChat(chatInput.value);
    }
  });
  
  // Delegación de eventos para los botones de recomendación (Añadir)
  chatMessagesContainer.addEventListener('click', (e) => {
      const target = e.target.closest('.add-service-btn');
      if (!target || target.disabled) return;

      const serviceId = target.getAttribute('data-service-id');
      if (!serviceId) return;

      const serviceData = findServiceById(serviceId);
      
      if (serviceData) {
        const serviceElement = document.querySelector(`input[data-service-id="${serviceData.id}"]`);
        
        // 1. Lógica de Presupuesto:
        
        if (serviceData.type === 'monthly') {
             if (serviceElement) {
                 handlePlanSelection(serviceData.id, serviceElement);
             } else {
                 showNotification('warning', 'Elemento No Encontrado', `El plan "${serviceData.item.name}" fue recomendado, pero su elemento de selección no está cargado.`);
                 return;
             }
             
        } else if (serviceData.type === 'standard') {
            if (document.querySelector('input[name="selectionGroup"]:checked, input[name="monthlyPlanSelection"]:checked')) { 
                clearAllSelections(); 
            }
            
            if (serviceElement) {
                serviceElement.checked = true;
            } else {
                 showNotification('warning', 'Elemento No Encontrado', `El servicio "${serviceData.item.name}" fue recomendado, pero su casilla de selección no se encuentra visible.`);
                 return;
            }
            
        } else if (serviceData.type === 'plan-service') {
             showNotification('info', 'Servicio de Puntos', `El servicio "${serviceData.item.name}" ha sido identificado. Si estás en modo Plan Mensual, selecciónalo en la lista de servicios con puntos.`);
             return; 
        } else {
            showNotification('error', 'Error de Lógica', 'Tipo de servicio recomendado desconocido.');
            return;
        }
        
        // 2. Actualizar el resumen (si no se retorna)
        updateSelectedItems(); 

        // 3. Desplazarse al resumen
        if(summaryCard) summaryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 4. Actualizar el estilo del botón del chat para indicar que fue añadido
        target.classList.remove('bg-slate-900', 'text-cyan-300', 'hover:bg-cyan-800', 'hover:text-white');
        target.classList.add('bg-green-700', 'text-white', 'cursor-default');
        target.textContent = `Añadido ✔️`;
        target.disabled = true;

      } else {
        showNotification('error', 'Error', 'El servicio recomendado no se encuentra en el catálogo.');
      }
  });


  // --- INICIALIZACIÓN ---

  // Mensaje de bienvenida inicial
  const welcomeMessage = `¡Hola! Soy Zen Assistant, tu IA de presupuestos. Dime qué tipo de proyecto tienes en mente (por ejemplo, "Necesito una web con e-commerce y CRM") y te sugeriré los servicios y planes más adecuados de nuestro catálogo.`;
  
  // Renderizar el mensaje de bienvenida
  if (chatMessagesContainer.children.length === 0) {
      renderMessage('model', welcomeMessage.replace(/\n/g, '<br>'));
      // Añadir al historial
      chatHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });
  }

});