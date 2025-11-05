// js/ui-helpers.js
/**
 * Módulo de utilidades para funciones comunes de la interfaz de usuario.
 * Centraliza la lógica para mantener la consistencia y reducir la duplicación de código.
 */

/**
 * Gestiona el estado visual de un botón durante una operación de carga.
 * Muestra u oculta un spinner, cambia el texto del botón y lo habilita/deshabilita.
 *
 * @param {HTMLButtonElement} button - El elemento del botón a modificar.
 * @param {boolean} isLoading - True para iniciar el estado de carga, false para finalizarlo.
 * @param {string} [loadingText='Procesando...'] - El texto a mostrar en el botón mientras carga.
 */
export function toggleButtonLoading(button, isLoading, loadingText = 'Procesando...') {
    if (!button) return;

    const spinner = button.querySelector('.spinner');
    const buttonTextSpan = button.querySelector('.btn-text');

    if (isLoading) {
        // Guardar el texto original si no se ha guardado ya
        if (!button.dataset.originalText) {
            button.dataset.originalText = buttonTextSpan ? buttonTextSpan.textContent : button.textContent;
        }
        
        button.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (buttonTextSpan) buttonTextSpan.textContent = loadingText;

    } else {
        // Restaurar el texto original
        if (button.dataset.originalText) {
            if (buttonTextSpan) buttonTextSpan.textContent = button.dataset.originalText;
            // Limpiar el estado guardado
            delete button.dataset.originalText;
        }
        
        button.disabled = false;
        if (spinner) spinner.classList.add('hidden');
    }
}
