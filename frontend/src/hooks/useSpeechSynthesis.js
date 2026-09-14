import { useCallback, useEffect, useRef, useState } from 'react';

// Wraps the browser's free, built-in speechSynthesis API and picks a female-sounding voice.
export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef(null);

  useEffect(() => {
    function pickVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const preferred =
        voices.find((v) => /female|zira|jenny|aria|samantha|susan/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      voiceRef.current = preferred;
    }
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }, []);

  const speak = useCallback((text) => {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.pitch = 1.1;
    utterance.rate = 1.02;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const cancel = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speak, cancel, speaking };
}
