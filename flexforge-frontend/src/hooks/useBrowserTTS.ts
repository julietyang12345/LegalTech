import { useState, useEffect, useCallback, useRef } from 'react';
import type { TargetLanguage } from '@/types';

// Map TargetLanguage to BCP 47 language tags for Web Speech API
const LANGUAGE_CODES: Record<TargetLanguage, string> = {
  chinese: 'zh-CN',      // Mandarin Chinese
  japanese: 'ja-JP',
  korean: 'ko-KR',
  arabic: 'ar-SA',
  spanish: 'es-ES',
  french: 'fr-FR',
  german: 'de-DE',
  italian: 'it-IT',
  portuguese: 'pt-BR',   // Brazilian Portuguese (more common)
  russian: 'ru-RU',
  hindi: 'hi-IN',
  thai: 'th-TH',
  vietnamese: 'vi-VN',
  other: 'en-US',        // Fallback to English
};

/**
 * TTS using backend proxy to Google Translate (no API key needed)
 * Works everywhere without installation
 */
function speakWithTTS(text: string, langCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use our backend proxy to avoid CORS issues
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
    const url = `${apiUrl}/tts/speak?text=${encodeURIComponent(text)}&lang=${langCode}`;

    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('TTS failed'));
    audio.play().catch(reject);
  });
}

interface UseBrowserTTSOptions {
  rate?: number;         // Speech rate: 0.1 to 10 (default 1)
  pitch?: number;        // Pitch: 0 to 2 (default 1)
  volume?: number;       // Volume: 0 to 1 (default 1)
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

interface UseBrowserTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  availableVoices: SpeechSynthesisVoice[];
  currentVoice: SpeechSynthesisVoice | null;
  setVoice: (voice: SpeechSynthesisVoice) => void;
}

/**
 * Browser TTS hook using Web Speech API
 *
 * @param language - Target language (from TargetLanguage type)
 * @param options - Optional configuration
 *
 * @example
 * const { speak, isSpeaking } = useBrowserTTS('chinese');
 * speak('你好'); // Speaks "ni hao" in Chinese
 */
export function useBrowserTTS(
  language: TargetLanguage | string,
  options: UseBrowserTTSOptions = {}
): UseBrowserTTSReturn {
  const {
    rate: _rate = 1,
    pitch: _pitch = 1,
    volume: _volume = 1,
    onStart,
    onEnd,
    onError,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const _utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Get the BCP 47 language code
  const langCode = LANGUAGE_CODES[language as TargetLanguage] || language;

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();

      // Filter voices for the target language
      const languageVoices = voices.filter(voice =>
        voice.lang.startsWith(langCode.split('-')[0])
      );

      setAvailableVoices(languageVoices.length > 0 ? languageVoices : voices);

      // Auto-select best voice for language
      if (!selectedVoice) {
        const bestVoice = languageVoices.find(v => v.lang === langCode)
          || languageVoices[0]
          || voices.find(v => v.lang.startsWith(langCode.split('-')[0]))
          || null;
        setSelectedVoice(bestVoice);
      }
    };

    // Voices may load asynchronously
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported, langCode, selectedVoice]);

  // Speak text using backend TTS proxy (works everywhere, no installation needed)
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;

    setIsSpeaking(true);
    onStart?.();

    speakWithTTS(text, langCode)
      .then(() => {
        setIsSpeaking(false);
        onEnd?.();
      })
      .catch((err) => {
        setIsSpeaking(false);
        onError?.(err.message);
      });
  }, [langCode, onStart, onEnd, onError]);

  // Stop speaking
  const stop = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  // Set voice manually
  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setSelectedVoice(voice);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    availableVoices,
    currentVoice: selectedVoice,
    setVoice,
  };
}

/**
 * Simple one-shot TTS function (no hook needed)
 * Use this for quick playback without state management
 */
export function speakText(text: string, language: TargetLanguage | string = 'other'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const langCode = LANGUAGE_CODES[language as TargetLanguage] || language;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  speechSynthesis.speak(utterance);
}

export default useBrowserTTS;
