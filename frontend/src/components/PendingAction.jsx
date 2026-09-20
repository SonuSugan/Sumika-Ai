import { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

// Browsers block window.open() unless it happens inside a real click/keypress -
// a voice command never carries that, so a spoken "open gmail" can't force a
// tab open by itself. This banner is the closest thing to "automatic": it pops
// up immediately, is autofocused so Enter/Space fires it instantly, and stays
// on screen (not buried in chat history) until acted on or dismissed.
const slideIn = keyframes`
  from { opacity: 0; transform: translate(-50%, -12px); }
  to { opacity: 1; transform: translate(-50%, 0); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 24px rgba(91, 230, 255, 0.35); }
  50% { box-shadow: 0 0 40px rgba(91, 230, 255, 0.6); }
`;

const Bar = styled.div`
  position: fixed;
  top: 18px;
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 18px;
  border-radius: 999px;
  background: rgba(12, 18, 32, 0.92);
  border: 1px solid ${({ theme }) => theme.colors.cyanSoft};
  animation: ${slideIn} 0.25s ease-out, ${glow} 1.8s ease-in-out infinite;
  backdrop-filter: blur(8px);
`;

const Text = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const OpenButton = styled.button`
  background: ${({ theme }) => theme.colors.cyan};
  color: #04121c;
  border: none;
  border-radius: 999px;
  padding: 7px 16px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`;

const Dismiss = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export default function PendingAction({ action, onOpen, onDismiss }) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (action) btnRef.current?.focus();
  }, [action]);

  if (!action) return null;

  return (
    <Bar role="alert">
      <Text>{action.label || 'Ready to open'}</Text>
      <OpenButton ref={btnRef} onClick={onOpen}>Tap to open ↗</OpenButton>
      <Dismiss onClick={onDismiss} aria-label="Dismiss" data-pending-dismiss>✕</Dismiss>
    </Bar>
  );
}
