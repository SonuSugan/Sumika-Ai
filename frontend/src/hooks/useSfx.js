import { useCallback, useMemo, useRef } from 'react';

// Sci-fi HUD blips synthesized live with the Web Audio API - zero audio files,
// zero cost, zero licensing to worry about.
export function useSfx() {
  const ctxRef = useRef(null);

  const getCtx = () => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  };

  const blip = useCallback((freqFrom, freqTo, duration = 0.12, type = 'sine', gain = 0.05) => {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqFrom, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), ctx.currentTime + duration);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // audio not available (autoplay policy before first user gesture) - fail silently
    }
  }, []);

  // Memoized so consumers can safely depend on `sfx` in their own useCallback/
  // useEffect deps without it changing (and re-triggering them) every render.
  return useMemo(() => ({
    playListenStart: () => blip(420, 900, 0.14, 'sine'),
    playListenEnd: () => blip(700, 300, 0.1, 'sine'),
    playSend: () => blip(500, 1200, 0.08, 'triangle', 0.04),
    playReply: () => blip(650, 950, 0.18, 'sine', 0.045),
    playAlert: () => blip(300, 180, 0.35, 'sawtooth', 0.05)
  }), [blip]);
}
