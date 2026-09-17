import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import VoiceOrb from './components/VoiceOrb.jsx';
import ChatLog from './components/ChatLog.jsx';
import HelpModal from './components/HelpModal.jsx';
import Waveform from './components/Waveform.jsx';
import QuickActions from './components/QuickActions.jsx';
import ResumeUpload from './components/ResumeUpload.jsx';
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis.js';
import { useSfx } from './hooks/useSfx.js';
import { sendMessage, resumeHelp, connectSocket, getProfile } from './api.js';

const Screen = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const Panel = styled.div`
  width: min(460px, 100%);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 18px;
  border-radius: 20px;
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  box-shadow: 0 0 60px rgba(91, 230, 255, 0.08);
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Logo = styled.img`
  width: 26px;
  height: 26px;
`;

const Title = styled.h1`
  font-size: 20px;
  letter-spacing: 0.16em;
  font-weight: 300;
  background: linear-gradient(90deg, ${({ theme }) => theme.colors.cyan}, ${({ theme }) => theme.colors.magenta});
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin: 0;
`;

const Status = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDim};
  min-height: 14px;
  text-align: center;
`;

const Transcript = styled.div`
  font-size: 12px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.cyan};
  min-height: 14px;
  text-align: center;
  opacity: 0.85;
`;

const TextRow = styled.form`
  display: flex;
  gap: 6px;
  width: 100%;
`;

const Input = styled.input`
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme }) => theme.colors.text};
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

const SendButton = styled.button`
  background: ${({ theme }) => theme.colors.cyan};
  color: #04121c;
  border: none;
  border-radius: 10px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
`;

const SESSION_ID = 'local-user';

// No wake word - every heard phrase is treated as a command, EXCEPT these two
// control phrases, which pause/resume voice command handling itself.
const STOP_LISTENING = /\bstop listening\b/i;
const START_LISTENING = /\bstart listening\b/i;

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi, I\'m Sumika. I\'m always listening - just talk. Say "stop listening" to pause, "start listening" to resume, or type below.' }
  ]);
  const [state, setState] = useState('idle');
  const [draft, setDraft] = useState('');
  const [helpInfo, setHelpInfo] = useState(null);
  const [muted, setMuted] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [slowWake, setSlowWake] = useState(false);
  const { speak, speaking } = useSpeechSynthesis();
  const sfx = useSfx();
  const wsRef = useRef(null);

  useEffect(() => {
    getProfile()
      .then((profile) => setHasResume(Boolean(profile?.resumeText)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ws = connectSocket((msg) => {
      if (msg.type === 'help_needed') {
        if (msg.kind !== 'review') sfx.playAlert();
        setHelpInfo(msg);
      }
      if (msg.type === 'tool_event' && msg.status === 'running') {
        setMessages((prev) => [...prev, { role: 'assistant', text: `→ running: ${msg.name}…` }]);
      }
    });
    wsRef.current = ws;
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setState((prev) => (speaking ? 'speaking' : prev === 'speaking' ? 'idle' : prev));
  }, [speaking]);

  const handleFinalText = useCallback(async (text) => {
    if (!text) return;
    sfx.playSend();
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setState('thinking');
    setSlowWake(false);
    // The free backend host spins down after inactivity - first request after
    // a while can take 30-50s+ to wake it back up. Without this, that silent
    // wait looks indistinguishable from "broken".
    const slowTimer = setTimeout(() => setSlowWake(true), 6000);
    try {
      const result = await sendMessage(SESSION_ID, text);

      // Opening a URL happens client-side (the frontend already runs in the
      // user's browser, whether the backend is local or cloud). Try it now -
      // this works when the response came back quickly enough that the
      // browser still considers this a user-initiated action. If a slow
      // (e.g. cold-started) backend caused that window to expire, the popup
      // gets silently blocked, so the link chip below is the fallback.
      const links = (result.actions || [])
        .map((a) => a.result?.clientAction)
        .filter((a) => a?.type === 'open_url')
        .map((a) => a.url);
      links.forEach((url) => window.open(url, '_blank', 'noopener'));

      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply, provider: result.provider, links }]);
      sfx.playReply();
      speak(result.reply);
      setState('speaking');
    } catch (err) {
      sfx.playAlert();
      setMessages((prev) => [...prev, { role: 'assistant', text: `Sorry, I hit an error: ${err.message}` }]);
      speak('Sorry, I hit an error talking to my AI provider.');
      setState('idle');
    } finally {
      clearTimeout(slowTimer);
      setSlowWake(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  const [lastHeard, setLastHeard] = useState('');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const setListeningPaused = useCallback((paused, { viaVoice = false } = {}) => {
    setMuted(paused);
    sfx.playListenStart();
    setMessages((msgs) => [...msgs, { role: 'assistant', text: paused ? 'Okay, I\'ve stopped listening. Say "start listening" to resume.' : "I'm listening again." }]);
    if (viaVoice) speak(paused ? "Okay, I've stopped listening." : "I'm listening again.");
  }, [sfx, speak]);

  const handleVoiceResult = useCallback((transcript) => {
    setLastHeard(transcript);

    // The recognizer itself never stops (see `active` below) - otherwise it
    // could never hear "start listening" again once paused. Instead, pausing
    // just makes this handler ignore everything except the resume phrase.
    if (mutedRef.current) {
      if (START_LISTENING.test(transcript)) setListeningPaused(false, { viaVoice: true });
      return;
    }
    if (STOP_LISTENING.test(transcript)) {
      setListeningPaused(true, { viaVoice: true });
      return;
    }

    handleFinalText(transcript);
  }, [handleFinalText, setListeningPaused]);

  const { listening, supported, permissionDenied, interimText } = useSpeechRecognition({
    onResult: handleVoiceResult,
    active: !speaking
  });

  const handleOrbClick = () => {
    if (!supported) {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Voice input needs Chrome or Edge - try typing instead.' }]);
      return;
    }
    setListeningPaused(!muted);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    handleFinalText(draft.trim());
    setDraft('');
  };

  const handleResume = async (id) => {
    await resumeHelp(id);
    setHelpInfo(null);
  };

  const handleResumeUploaded = (profile, errorMessage) => {
    if (errorMessage) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Couldn't read that resume: ${errorMessage}` }]);
      return;
    }
    setHasResume(Boolean(profile?.resumeText));
    setMessages((prev) => [...prev, { role: 'assistant', text: "Got it - I've read your resume and I'll use it for job applications." }]);
  };

  const activeState = muted
    ? 'muted'
    : state === 'thinking' || state === 'speaking'
    ? state
    : listening
    ? 'listening'
    : 'idle';

  const statusText = !supported
    ? 'Voice recognition needs Chrome/Edge - type below instead.'
    : permissionDenied
    ? 'Mic permission blocked - allow it in the browser, then reload.'
    : activeState === 'thinking' && slowWake
    ? 'Still thinking… waking up the server can take up to a minute if it\'s been idle'
    : {
        idle: 'Always listening…',
        muted: 'Paused - say "start listening" or tap to resume',
        listening: 'Listening…',
        thinking: 'Thinking…',
        speaking: 'Speaking…'
      }[activeState];

  return (
    <Screen>
      <Panel>
        <TitleRow>
          <Logo src="/favicon.svg" alt="" />
          <Title>SUMIKA</Title>
        </TitleRow>
        <VoiceOrb state={activeState} onClick={handleOrbClick} />
        <Waveform active={activeState === 'listening' || activeState === 'speaking'} color={activeState === 'speaking' ? 'magenta' : 'cyan'} />
        <Status>{statusText}</Status>
        {(interimText || (activeState === 'idle' && lastHeard)) && (
          <Transcript>
            {interimText ? `"${interimText}"` : `heard: "${lastHeard}"`}
          </Transcript>
        )}
        <ChatLog messages={messages} />
        <ResumeUpload hasResume={hasResume} onUploaded={handleResumeUploaded} />
        <QuickActions onPick={handleFinalText} />
        <TextRow onSubmit={handleSubmit}>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a command…" />
          <SendButton type="submit">Send</SendButton>
        </TextRow>
      </Panel>
      <HelpModal info={helpInfo} onResume={handleResume} speak={speak} />
    </Screen>
  );
}
