// /js/chat-frontend.js
/**
 * Lógica de frontend para Zen Assistant usando Gemini.
 * Se comunica con la función serverless de Netlify (chat.js) para la lógica de IA.
 * * * CORRECCIÓN CRÍTICA DE BUCLE: La actualización del historial del frontend estaba duplicando
 * el mensaje del usuario. Se revierte a la lógica de actualización correcta.
 * * CORRECCIÓN DE PRESUPUESTO: Se mantiene la lógica robusta para manejar la selección de botones
 * que cambia de modo (Plan Mensual a Servicio Estándar).
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
      // Búsqueda en Servicios Estándar
      let service = state.allServices.find(s => s.id === id);
      if (service) return { type: 'standard', item: service };

      // Búsqueda en Planes Mensuales
      service = state.monthlyPlans.find(p => p.id === id);
      if (service) return { type: 'monthly', item: service };
      
      // Búsqueda en Servicios de Puntos
      service = state.pointServices.find(p => p.id === id);
      if (service) return { type: 'plan-service', item: service };

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
    
    messageDiv.innerHTML = `
      <div class="max-w-[85%] p-3 text-sm whitespace-pre-wrap ${innerClass}">
        ${content}
      </div>
    `;
    chatMessagesContainer.appendChild(messageDiv);
    // Desplazarse al último mensaje
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  };
  
  /**
   * Renderiza el contenido del mensaje de la IA. Si es JSON, lo parsea y muestra la recomendación.
   * @param {string} content - La respuesta cruda de Gemini (Texto o JSON stringificado).
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
    
    // 3. Validar la estructura esencial (debe tener el array 'services' o ser un JSON de error del backend)
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
    
    // 2. AÑADIR MENSAJE DE USUARIO AL HISTORIAL DEL FRONTEND (Preparado para el próximo envío)
    chatHistory.push({ role: 'user', parts: [{ text: trimmedMessage }] });
    // Usamos el historial completo para enviar al backend
    const historyForApi = chatHistory;

    // 3. Renderizar indicador de carga (AI)
    const loadingMessageId = 'loading-' + Date.now();
    renderMessage('model', `<div id="${loadingMessageId}" class="flex items-center space-x-2 text-slate-400"><div class="loading-animation"></div><span>Escribiendo...</span></div>`);

    // 4. Llamada a la función Netlify (segura)
    try {
      const apiUrl = `/api/chat`; 

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Enviamos el historial COMPLETO, incluyendo el último mensaje de usuario
        body: JSON.stringify({ userMessage: trimmedMessage, history: historyForApi }) 
      });

      const data = await response.json();
      
      // 5. Eliminar el indicador de carga
      const loadingEl = document.getElementById(loadingMessageId);
      if (loadingEl && loadingEl.parentElement) {
          loadingEl.parentElement.remove();
      }

      if (data.error || !response.ok) {
        const errorMessage = data.message || "No se pudo contactar con la IA. Inténtalo de nuevo.";
        renderMessage('model', `<span class="text-red-400 font-bold">Error del Asistente:</span> ${errorMessage}`);
        // Si hay un error, removemos el último mensaje de usuario del historial para reintentar sin duplicar
        chatHistory.pop(); 
      } else {
        const aiResponseContent = renderMessageContent(data.response);
        renderMessage('model', aiResponseContent);
        
        // 6. Actualizamos el historial con la RESPUESTA DEL MODELO (únicamente, sin duplicar el userMessage)
        chatHistory.push({ role: 'model', parts: [{ text: data.response }] });
      }

    } catch (error) {
      console.error("Error al enviar el chat:", error);
      // Eliminar el indicador de carga si existe
      const loadingEl = document.getElementById(loadingMessageId);
      if (loadingEl && loadingEl.parentElement) {
          loadingEl.parentElement.remove();
      }
      renderMessage('model', '<span class="text-red-400 font-bold">Error de Conexión:</span> Hubo un problema de red. Por favor, inténtalo de nuevo.');
      // Si hay un error de conexión, removemos el último mensaje de usuario del historial
      chatHistory.pop();
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
        const elementId = `selection-box-${serviceData.id}`;
        const serviceElement = document.getElementById(elementId);
        
        // 1. **CORRECCIÓN CRÍTICA DE LÓGICA DE PRESUPUESTO:**
        
        if (serviceData.type === 'monthly') {
             // Si es un plan mensual:
             if (serviceElement) {
                 // handlePlanSelection gestiona la lógica de planes (limpia estándares y marca el plan)
                 handlePlanSelection(serviceData.id, serviceElement);
             } else {
                 showNotification('warning', 'Elemento No Encontrado', `El plan "${serviceData.item.name}" fue recomendado, pero su elemento de selección no está cargado.`);
                 return;
             }
             
        } else if (serviceData.type === 'standard') {
            // Si es un servicio estándar:
            
            // Si hay un plan mensual u otros servicios seleccionados, forzamos la limpieza
            // para cambiar el modo de presupuesto a "Servicio Estándar".
            // Esta línea asegura que el presupuesto no se arruine al mezclar modos.
            if (document.querySelector('input[name="selectionGroup"]:checked, input[name="monthlyPlanSelection"]:checked')) { 
                clearAllSelections(); 
            }
            
            // Marcamos el servicio estándar
            if (serviceElement) {
                serviceElement.checked = true;
            } else {
                 showNotification('warning', 'Elemento No Encontrado', `El servicio "${serviceData.item.name}" fue recomendado, pero su casilla de selección no se encuentra visible.`);
                 return;
            }
            
        } else if (serviceData.type === 'plan-service') {
             // Si es un servicio de puntos (no se debe marcar directamente en el catálogo principal)
             showNotification('info', 'Servicio de Puntos', `El servicio "${serviceData.item.name}" ha sido identificado. Si estás en modo Plan Mensual, selecciónalo en la lista de servicios con puntos.`);
             return; // No marcamos, solo notificamos
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