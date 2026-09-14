import styled, { css, keyframes } from 'styled-components';

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.06); opacity: 1; }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.02); opacity: 1; }
`;

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Ring = styled.div`
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.cyanSoft};
  ${({ $active }) =>
    $active &&
    css`
      animation: ${rotate} 6s linear infinite;
      border-style: dashed;
    `}
`;

const Ring2 = styled(Ring)`
  inset: -30px;
  border-color: rgba(255, 91, 214, 0.2);
  ${({ $active }) =>
    $active &&
    css`
      animation: ${rotate} 10s linear infinite reverse;
    `}
`;

const Orb = styled.button`
  position: relative;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: radial-gradient(
    circle at 35% 30%,
    ${({ theme }) => theme.colors.cyan},
    #1447a3 55%,
    #060b18 100%
  );
  box-shadow:
    0 0 40px ${({ theme }) => theme.colors.cyanSoft},
    inset 0 0 30px rgba(0, 0, 0, 0.4);
  animation: ${breathe} 3.2s ease-in-out infinite;

  ${({ $state }) =>
    ($state === 'listening' || $state === 'thinking') &&
    css`
      animation: ${pulse} 1.4s ease-in-out infinite;
    `}
  ${({ $state, theme }) =>
    $state === 'speaking' &&
    css`
      animation: ${pulse} 1.4s ease-in-out infinite;
      box-shadow:
        0 0 60px ${theme.colors.magenta},
        inset 0 0 30px rgba(0, 0, 0, 0.4);
    `}
  ${({ $state }) =>
    $state === 'muted' &&
    css`
      animation: none;
      filter: grayscale(0.85) brightness(0.6);
      box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5);
    `}
`;

const OuterWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const Wrap = styled.div`
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Label = styled.div`
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: ${({ theme }) => theme.colors.textDim};
`;

const LABELS = {
  idle: 'Always on',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  muted: 'Muted - tap to unmute'
};

export default function VoiceOrb({ state, onClick }) {
  const ringActive = state !== 'idle' && state !== 'muted';
  return (
    <OuterWrap>
      <Wrap>
        <Ring $active={ringActive} />
        <Ring2 $active={ringActive} />
        <Orb $state={state} onClick={onClick} aria-label="Mute or unmute Sumika's mic" />
      </Wrap>
      <Label>{LABELS[state] || 'Always on'}</Label>
    </OuterWrap>
  );
}
