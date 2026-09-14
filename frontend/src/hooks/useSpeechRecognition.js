import { useCallback, useEffect, useRef, useState } from 'react';

// Wraps the browser's free, built-in Web Speech API (SpeechRecognition) in an
// always-listening loop: Chrome silently ends a recognition session after a
// stretch of silence even with continuous:true, so this restarts it automatically
// whenever `active` stays true. Set `active` to false (e.g. while Sumika is
// speaking) to avoid the mic picking up her own voice.
export function useSpeechRecognition({ onResult, active = true } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);
  const wantActiveRef = useRef(active);
  const runningRef = useRef(false);

  const safeStart = useCallback(() => {
    if (!recognitionRef.current || runningRef.current) return;
    try {
      recognitionRef.current.start();
      runningRef.current = true;
    } catch {
      // already started - ignore
    }
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      setInterimText(interim);
      if (finalText) onResult?.(finalText.trim());
    };

    recognition.onstart = () => {
      runningRef.current = true;
      setListening(true);
    };

    recognition.onend = () => {
      runningRef.current = false;
      setListening(false);
      setInterimText('');
      if (wantActiveRef.current) {
        setTimeout(() => {
          if (wantActiveRef.current) safeStart();
        }, 300);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPermissionDenied(true);
        wantActiveRef.current = false;
      }
      // 'no-speech' / 'aborted' etc just fall through to onend, which restarts us.
    };

    recognitionRef.current = recognition;
    if (wantActiveRef.current) safeStart();

    return () => {
      wantActiveRef.current = false;
      recognition.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onResult]);

  useEffect(() => {
    wantActiveRef.current = active;
    if (!recognitionRef.current) return;
    if (active) {
      safeStart();
    } else if (runningRef.current) {
      recognitionRef.current.stop();
    }
  }, [active, safeStart]);

  const start = useCallback(() => {
    wantActiveRef.current = true;
    safeStart();
  }, [safeStart]);

  const stop = useCallback(() => {
    wantActiveRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  return { listening, supported, permissionDenied, interimText, start, stop };
}
