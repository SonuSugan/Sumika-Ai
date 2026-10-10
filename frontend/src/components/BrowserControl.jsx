import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { backendUrl, checkAccess, getAccessCode, setAccessCode } from '../api.js';
import { useBrowserControl } from '../hooks/useBrowserControl.js';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textDim};
`;

const Chip = styled.button`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme, $tone }) => ($tone === 'bad' ? '#f87171' : $tone === 'ok' ? '#4ade80' : theme.colors.cyan)};
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

const Form = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CodeInput = styled.input`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme }) => theme.colors.text};
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  width: 190px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

const Note = styled.span`
  max-width: 420px;
  text-align: center;
`;

const isLocalPage = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const LABELS = {
  connected: ['Browser control: connected', 'ok'],
  connecting: ['Browser control: connecting...', ''],
  unauthorized: ['Browser control: wrong access code', 'bad'],
  unreachable: ["Browser control: can't reach the backend", 'bad'],
  idle: ['Browser control: ready', '']
};

export default function BrowserControl() {
  const control = useBrowserControl();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const autoPaired = useRef(false);

  // Once per page load, if this browser already knows its access code (or this
  // is a local page that needs none), pair the extension without being asked -
  // and re-pair if it was last paired against a different backend.
  const { installed, configured, backendUrl: pairedTo, pair } = control;
  useEffect(() => {
    if (!installed || autoPaired.current) return;
    const saved = getAccessCode();
    if (!saved && !isLocalPage) return;
    autoPaired.current = true;
    if (configured && pairedTo === backendUrl()) return;
    pair(saved);
  }, [installed, configured, pairedTo, pair]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNote(isLocalPage ? '' : 'Checking the code - a sleeping backend can take up to a minute to wake...');
    try {
      const trimmed = code.trim();
      if (!(await checkAccess(trimmed))) {
        setNote(trimmed ? 'The server rejected that code.' : 'Enter your access code.');
        return;
      }
      setAccessCode(trimmed);
      control.pair(trimmed);
      setCode('');
      setNote('');
      setOpen(false);
    } catch {
      setNote("Couldn't reach the backend. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    setAccessCode('');
    control.unpair();
    setOpen(false);
  };

  let label;
  let tone = '';
  if (control.installed === null) label = 'Browser control: checking...';
  else if (!control.installed) label = 'Browser control: extension not installed';
  else if (!control.configured) label = isLocalPage ? 'Browser control: set up' : 'Browser control: enter access code';
  else [label, tone] = LABELS[control.state] || LABELS.idle;

  return (
    <Wrap>
      <Chip type="button" $tone={tone} onClick={() => setOpen((v) => !v)} disabled={control.installed === false}>
        {label}
      </Chip>
      {open && (
        <Form onSubmit={save}>
          <CodeInput
            type="password"
            autoComplete="off"
            placeholder={isLocalPage ? 'Access code (optional)' : 'Access code'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Chip type="submit" disabled={busy}>
            {busy ? 'Checking...' : 'Save'}
          </Chip>
          {control.configured && (
            <Chip type="button" onClick={forget}>
              Forget
            </Chip>
          )}
        </Form>
      )}
      {open && note && <Note>{note}</Note>}
    </Wrap>
  );
}
