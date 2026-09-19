import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import VoiceOrb from './components/VoiceOrb.jsx';
import ChatLog from './components/ChatLog.jsx';
import HelpModal from './components/HelpModal.jsx';
import Waveform from './components/Waveform.jsx';
import QuickActions from './components/QuickActions.jsx';
import ResumeUpload from './components/ResumeUpload.jsx';
import PendingAction from './components/PendingAction.jsx';
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis.js';
import { useSfx } from './hooks/useSfx.js';
import { sendMessage, resumeHelp, connectSocket, getProfile } from './api.js';

// Full-viewport HUD instead of a small centered dialog - Sumika now uses the
// whole page as its "surface", with a scanning grid + drifting glow behind
// everything for the Jarvis-console feel.
const drift = keyframes`
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-3%, 2%); }
`;

const Screen = styled.div`
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at 50% -10%, #0d2540 0%, ${({ theme }) => theme.colors.bgGradientA} 45%, ${({ theme }) => theme.colors.bgGradientB} 100%);
`;

const GridFX = styled.div`
  position: absolute;
  inset: -10%;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    linear-gradient(${({ theme }) => theme.colors.cyanSoft} 1px, transparent 1px),
    linear-gradient(90deg, ${({ theme }) => theme.colors.cyanSoft} 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 50% 20%, black 0%, transparent 65%);
  animation: ${drift} 24s ease-in-out infinite;
`;

const Header = styled.header`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 16px 8px;
  flex-shrink: 0;
`;

const Logo = styled.img`
  width: 24px;
  height: 24px;
`;

const Title = styled.h1`
  font-size: 18px;
  letter-spacing: 0.22em;
  font-weight: 300;
  background: linear-gradient(90deg, ${({ theme }) => theme.colors.cyan}, ${({ theme }) => theme.colors.magenta});
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin: 0;
`;

const Main = styled.main`
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 4px 16px 0;
`;

const Stage = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const Status = styled.div`
  font-size: 12px;
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

const ChatWrap = styled.div`
  flex: 1;
  min-height: 0;
  width: min(760px, 100%);
  display: flex;
`;

const Dock = styled.footer`
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 18px;
  background: linear-gradient(180deg, transparent, rgba(5, 8, 16, 0.75) 40%);
`;

const DockInner = styled.div`
  width: min(760px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const TextRow = styled.form`
  display: flex;
  gap: 8px;
  width: 100%;
`;

const Input = styled.input`
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme }) => theme.colors.text};
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

const SendButton = styled.button`
  background: ${({ theme }) => theme.colors.cyan};
  color: #04121c;
  border: none;
  border-radius: 12px;
  padding: 0 20px;
  font-weight: 600;
  font-size: 14px;
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
  const [pendingAction, setPendingAction] = useState(null);
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
      // user's browser, whether the backend is local or cloud). This only
      // succeeds when the browser still considers the request "user-initiated" -
      // true for typed/Send-button commands, but a spoken voice command never
      // carries that flag at all, so window.open() gets silently blocked. When
      // that happens (it returns null/undefined), surface a big one-tap banner
      // instead of quietly failing.
      const links = (result.actions || [])
        .map((a) => a.result?.clientAction)
        .filter((a) => a?.type === 'open_url')
        .map((a) => a.url);
      // Note: passing the 'noopener' feature string makes some browsers return
      // null from window.open() even when it SUCCEEDS, which would make every
      // open look "blocked". Open without it, then sever window.opener
      // ourselves - same security effect, but a return value we can trust.
      const blocked = links.filter((url) => {
        const win = window.open(url, '_blank');
        if (win) win.opener = null;
        return !win;
      });
      if (blocked.length) {
        setPendingAction({ links: blocked, label: 'Your browser needs a tap to open this' });
      }

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

  const handleOpenPending = () => {
    pendingAction?.links.forEach((url) => {
      const win = window.open(url, '_blank');
      if (win) win.opener = null;
    });
    setPendingAction(null);
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
      <GridFX />
      <PendingAction action={pendingAction} onOpen={handleOpenPending} onDismiss={() => setPendingAction(null)} />
      <Header>
        <Logo src="/favicon.svg" alt="" />
        <Title>SUMIKA</Title>
      </Header>
      <Main>
        <Stage>
          <VoiceOrb state={activeState} onClick={handleOrbClick} />
          <Waveform active={activeState === 'listening' || activeState === 'speaking'} color={activeState === 'speaking' ? 'magenta' : 'cyan'} />
          <Status>{statusText}</Status>
          {(interimText || (activeState === 'idle' && lastHeard)) && (
            <Transcript>
              {interimText ? `"${interimText}"` : `heard: "${lastHeard}"`}
            </Transcript>
          )}
        </Stage>
        <ChatWrap>
          <ChatLog messages={messages} />
        </ChatWrap>
      </Main>
      <Dock>
        <DockInner>
          <ResumeUpload hasResume={hasResume} onUploaded={handleResumeUploaded} />
          <QuickActions onPick={handleFinalText} />
          <TextRow onSubmit={handleSubmit}>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a command…" />
            <SendButton type="submit">Send</SendButton>
          </TextRow>
        </DockInner>
      </Dock>
      <HelpModal info={helpInfo} onResume={handleResume} speak={speak} />
    </Screen>
  );
}
