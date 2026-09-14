import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(2, 4, 10, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
`;

const Card = styled.div`
  animation: ${fadeIn} 0.2s ease-out;
  width: min(440px, 90vw);
  background: linear-gradient(180deg, rgba(28, 20, 40, 0.9), rgba(10, 8, 18, 0.95));
  border: 1px solid ${({ theme }) => theme.colors.magenta};
  box-shadow: 0 0 50px rgba(255, 91, 214, 0.25);
  border-radius: 16px;
  padding: 24px;
  color: ${({ theme }) => theme.colors.text};
`;

const Title = styled.h3`
  margin: 0 0 8px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.magenta};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Message = styled.p`
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textDim};
  margin: 0 0 20px;
`;

const Button = styled.button`
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: ${({ theme }) => theme.colors.magenta};
  color: #1a0a14;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    filter: brightness(1.1);
  }
`;

export default function HelpModal({ info, onResume }) {
  if (!info) return null;
  return (
    <Overlay>
      <Card>
        <Title>⚠ Sumika needs your help</Title>
        <Message>{info.reason}</Message>
        <Button onClick={() => onResume(info.id)}>I've handled it — continue</Button>
      </Card>
    </Overlay>
  );
}
