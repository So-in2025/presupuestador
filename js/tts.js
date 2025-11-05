// js/tts.js
/**
 * Módulo centralizado para la gestión de Texto-a-Voz (TTS).
 * Maneja la selección de voz, reproducción, detención y estado de la síntesis.
 */
class TTSManager {
    constructor() {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.currentButton = null;
        this.voices = [];
        this.selectedVoice = null;
        this.shouldAutoplay = true; // Para el chat
        this.ttsQueue = [];
        this.currentHighlightElement = null;
        this.queueButton = null;
        this.wasManuallyStopped = false; // Flag para controlar la detención manual
        this.init();
    }

    init() {
        if (typeof window.speechSynthesis === 'undefined') {
            console.warn('TTS no soportado por este navegador.');
            return;
        }
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
        this.loadVoices();
    }

    loadVoices() {
        this.voices = window.speechSynthesis.getVoices();
        if (this.voices.length === 0) return;

        this.selectedVoice = this.voices.find(v => v.name === 'Google español' && v.lang.startsWith('es')) ||
                             this.voices.find(v => v.name.toLowerCase().includes('google') && v.lang.startsWith('es-') && !v.name.toLowerCase().includes('female')) ||
                             this.voices.find(v => v.lang.startsWith('es-') && v.default) ||
                             this.voices.find(v => v.lang.startsWith('es-')) || null;
    }

    _resetUI() {
        if (this.currentButton) {
            const textSpan = this.currentButton.querySelector('.tts-button-text');
            if (textSpan) textSpan.textContent = 'Escuchar Explicación';
            else if (this.currentButton.dataset.action === 'tts') this.currentButton.textContent = '▶️';
            else if (this.currentButton.classList.contains('info-tooltip-btn')) {
                // No cambiar el ícono
            }
        }
        if (this.queueButton) {
            this.queueButton.textContent = 'Leer en voz alta';
        }
        if (this.currentHighlightElement) {
            this.currentHighlightElement.classList.remove('tts-highlight');
        }
        this.currentButton = null;
        this.queueButton = null;
        this.currentHighlightElement = null;
    }

    async speak(text, button) {
        if (this.isPlaying && this.currentButton === button) {
            this.stop();
            return;
        }
        this.stop();

        if (typeof window.speechSynthesis === 'undefined') {
            const { showNotification } = await import('./modals.js');
            return showNotification('error', 'No Soportado', 'La función de Texto-a-Voz no es compatible con tu navegador.');
        }

        this.currentUtterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) this.currentUtterance.voice = this.selectedVoice;
        this.currentUtterance.lang = 'es-ES';
        this.currentUtterance.rate = 1.0;
        
        this.currentButton = button;
        this.isPlaying = true;
        
        if (this.currentButton) {
            const textSpan = this.currentButton.querySelector('.tts-button-text');
            if (textSpan) textSpan.textContent = 'Detener';
            else if (this.currentButton.dataset.action === 'tts') this.currentButton.textContent = '⏹️';
        }

        this.currentUtterance.onend = () => {
            this.isPlaying = false;
            this._resetUI();
            this.currentUtterance = null;
        };

        this.currentUtterance.onerror = async (event) => {
            // Si la detención fue manual, el flag estará activado.
            // Lo reseteamos y salimos sin mostrar ningún error.
            if (this.wasManuallyStopped) {
                this.wasManuallyStopped = false;
                return;
            }
            
            console.error('Error en la síntesis de voz:', event.error);
            this.isPlaying = false;
            this._resetUI();
            // Ya no mostramos el cartel rojo por pedido del usuario.
        };

        window.speechSynthesis.speak(this.currentUtterance);
    }
    
    stop() {
        this.wasManuallyStopped = true; // Activamos el flag antes de cancelar
        this.ttsQueue = [];
        if (window.speechSynthesis && (this.isPlaying || window.speechSynthesis.pending)) {
            window.speechSynthesis.cancel(); 
        }
        this.isPlaying = false;
        this._resetUI();
    }
    
    speakQueue(elements, button) {
        if (this.isPlaying) {
            this.stop();
            return;
        }
        this.stop();

        this.queueButton = button;
        this.ttsQueue = Array.from(elements).map(element => ({
            element,
            text: element.dataset.ttsContent
        }));

        if (this.ttsQueue.length > 0) {
            this.queueButton.textContent = 'Detener lectura';
            this._playNextInQueue();
        }
    }
    
    _playNextInQueue() {
        if (this.currentHighlightElement) this.currentHighlightElement.classList.remove('tts-highlight');
        
        if (this.ttsQueue.length === 0) {
            this.isPlaying = false;
            this._resetUI();
            return;
        }

        const { element, text } = this.ttsQueue.shift();
        
        this.currentHighlightElement = element;
        this.currentHighlightElement.classList.add('tts-highlight');
        
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) this.currentUtterance.voice = this.selectedVoice;
        this.currentUtterance.lang = 'es-ES';
        this.currentUtterance.rate = 1.0;
        this.isPlaying = true;
        
        this.currentUtterance.onend = () => {
            this._playNextInQueue();
        };
        
        this.currentUtterance.onerror = (e) => {
             if (this.wasManuallyStopped) {
                this.wasManuallyStopped = false;
                this.isPlaying = false;
                this._resetUI();
                return;
            }
            console.error("Error en cola TTS:", e.error);
            this._playNextInQueue(); // Saltar al siguiente
        };

        window.speechSynthesis.speak(this.currentUtterance);
    }
}

export const ttsManager = new TTSManager();