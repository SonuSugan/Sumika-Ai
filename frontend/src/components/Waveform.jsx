import styled, { css, keyframes } from 'styled-components';

const bounce = (i) => keyframes`
  0%, 100% { height: 6px; }
  50% { height: ${14 + ((i * 7) % 22)}px; }
`;

const Bars = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
`;

const Bar = styled.span`
  width: 3px;
  border-radius: 2px;
  background: ${({ theme, $color }) => ($color === 'magenta' ? theme.colors.magenta : theme.colors.cyan)};
  height: 6px;
  opacity: ${({ $active }) => ($active ? 1 : 0.35)};
  ${({ $active, $i }) =>
    $active &&
    css`
      animation: ${bounce($i)} ${0.5 + ($i % 4) * 0.12}s ease-in-out infinite;
      animation-delay: ${$i * 0.05}s;
    `}
`;

export default function Waveform({ active, color = 'cyan', bars = 14 }) {
  return (
    <Bars>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} $active={active} $i={i} $color={color} />
      ))}
    </Bars>
  );
}
