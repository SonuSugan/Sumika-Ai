import { useCallback, useEffect, useState } from 'react';
import { backendUrl } from '../api.js';

// The Sumika Chrome extension injects a content script into this page; the two
// talk over window.postMessage. If the extension isn't installed nothing ever
// answers, which is how `installed` ends up false.
const post = (type, extra = {}) => window.postMessage({ source: 'sumika-page', type, ...extra }, window.location.origin);

export function useBrowserControl() {
  const [info, setInfo] = useState({ installed: null, configured: false, state: 'idle', backendUrl: null });

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.source !== 'sumika-extension') return;
      if (msg.type === 'ready') post('hello');
      if (msg.type === 'status') {
        setInfo({ installed: true, configured: Boolean(msg.configured), state: msg.state || 'idle', backendUrl: msg.backendUrl || null, error: msg.error });
      }
    };
    window.addEventListener('message', onMessage);
    post('hello');
    const poll = setInterval(() => post('status'), 4000);
    const giveUp = setTimeout(() => setInfo((prev) => (prev.installed === null ? { ...prev, installed: false } : prev)), 1500);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, []);

  const pair = useCallback((token) => post('pair', { backendUrl: backendUrl(), token }), []);
  const unpair = useCallback(() => post('unpair'), []);

  return { ...info, pair, unpair };
}
