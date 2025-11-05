// js/tts.js
/**
 * Módulo centralizado para la gestión de Texto-a-Voz (TTS).
 * Maneja la selección de voz, reproducción, detención y estado de la síntesis.
 */
import { showNotification } from './modals.js';

class TTSManager {
    constructor() {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.currentButton = null;
        this.voices = [];
        this.selectedVoice = null;
        this.shouldAutoplay = true; // Para el chat
        this.init();
    }

    init() {
        if (typeof window.speechSynthesis === 'undefined') {
            console.warn('TTS no soportado por este navegador.');
            return;
        }
        this.loadVoices