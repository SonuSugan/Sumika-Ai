import { useEffect } from 'react';
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
  padding: 16px;
`;

const Card = styled.div`
  animation: ${fadeIn} 0.2s ease-out;
  width: min(480px, 100%);
  max-height: 85vh;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(28, 20, 40, 0.95), rgba(10, 8, 18, 0.97));
  border: 1px solid ${({ theme, $kind }) => ($kind === 'review' ? theme.colors.cyan : theme.colors.magenta)};
  box-shadow: 0 0 50px ${({ $kind }) => ($kind === 'review' ? 'rgba(91, 230, 255, 0.2)' : 'rgba(255, 91, 214, 0.25)')};
  border-radius: 16px;
  padding: 24px;
  color: ${({ theme }) => theme.colors.text};
`;

const Title = styled.h3`
  margin: 0 0 8px;
  font-size: 16px;
  color: ${({ theme, $kind }) => ($kind === 'review' ? theme.colors.cyan : theme.colors.magenta)};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Message = styled.p`
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textDim};
  margin: 0 0 16px;
`;

const QaList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
`;

const QaItem = styled.div`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  border-radius: 10px;
  padding: 12px;
`;

const Question = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.cyan};
  margin-bottom: 6px;
`;

const Answer = styled.div`
  font-size: 13px;
  line-height: 1.5;
`;

const Button = styled.button`
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: ${({ theme, $kind }) => ($kind === 'review' ? theme.colors.cyan : theme.colors.magenta)};
  color: #1a0a14;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    filter: brightness(1.1);
  }
`;

export default function HelpModal({ info, onResume, speak }) {
  useEffect(() => {
    if (!info) return;
    if (info.kind === 'review' && info.qa?.length) {
      const spoken = `I've drafted answers for ${info.qa.length} question${info.qa.length > 1 ? 's' : ''}. ` +
        info.qa.map((item) => `Question: ${item.question}. My answer: ${item.answer}`).join(' ... ');
      speak?.(spoken);
    } else {
      speak?.(info.reason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  if (!info) return null;
  const kind = info.kind || 'blocker';

  return (
    <Overlay>
      <Card $kind={kind}>
        <Title $kind={kind}>{kind === 'review' ? '📝 Review before you submit' : '⚠ Sumika needs your help'}</Title>
        <Message>{info.reason}</Message>
        {kind === 'review' && info.qa?.length > 0 && (
          <QaList>
            {info.qa.map((item, i) => (
              <QaItem key={i}>
                <Question>{item.question}</Question>
                <Answer>{item.answer}</Answer>
              </QaItem>
            ))}
          </QaList>
        )}
        <Button $kind={kind} onClick={() => onResume(info.id)}>
          {kind === 'review' ? "Got it - I'll submit it myself" : "I've handled it — continue"}
        </Button>
      </Card>
    </Overlay>
  );
}
