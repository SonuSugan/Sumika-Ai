import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import VoiceOrb from './components/VoiceOrb.jsx';
import ChatLog from './components/ChatLog.jsx';
import HelpModal from './components/HelpModal.jsx';
import Waveform from './components/Waveform.jsx';
import QuickActions from './components/QuickActions.jsx';
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis.js';
import { useSfx } from './hooks/useSfx.js';
import { sendMessage, resumeHelp, connectSocket } from './api.js';

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

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm Sumika. I'm always listening - just talk, or type below." }
  ]);
  const [state, setState] = useState('idle');
  const [draft, setDraft] = useState('');
  const [helpInfo, setHelpInfo] = useState(null);
  const [muted, setMuted] = useState(false);
  const { speak, speaking } = useSpeechSynthesis();
  const sfx = useSfx();
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = connectSocket((msg) => {
      if (msg.type === 'help_needed') {
        sfx.playAlert();
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
    try {
      const result = await sendMessage(SESSION_ID, text);
      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply, provider: result.provider }]);
      sfx.playReply();
      speak(result.reply);
      setState('speaking');
    } catch (err) {
      sfx.playAlert();
      setMessages((prev) => [...prev, { role: 'assistant', text: `Sorry, I hit an error: ${err.message}` }]);
      speak('Sorry, I hit an error talking to my AI provider.');
      setState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak]);

  const { listening, supported, permissionDenied } = useSpeechRecognition({
    onResult: handleFinalText,
    active: !muted && !speaking
  });

  const handleOrbClick = () => {
    if (!supported) {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Voice input needs Chrome or Edge - try typing instead.' }]);
      return;
    }
    setMuted((prev) => {
      const next = !prev;
      sfx.playListenStart();
      setMessages((msgs) => [...msgs, { role: 'assistant', text: next ? 'Mic muted.' : "I'm listening again." }]);
      return next;
    });
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
    : {
        idle: 'Always listening…',
        muted: 'Mic muted - tap orb to resume',
        listening: 'Listening…',
        thinking: 'Thinking…',
        speaking: 'Speaking…'
      }[activeState];

  return (
    <Screen>
      <Panel>
        <Title>SUMIKA</Title>
        <VoiceOrb state={activeState} onClick={handleOrbClick} />
        <Waveform active={activeState === 'listening' || activeState === 'speaking'} color={activeState === 'speaking' ? 'magenta' : 'cyan'} />
        <Status>{statusText}</Status>
        <ChatLog messages={messages} />
        <QuickActions onPick={handleFinalText} />
        <TextRow onSubmit={handleSubmit}>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a command…" />
          <SendButton type="submit">Send</SendButton>
        </TextRow>
      </Panel>
      <HelpModal info={helpInfo} onResume={handleResume} />
    </Screen>
  );
}
