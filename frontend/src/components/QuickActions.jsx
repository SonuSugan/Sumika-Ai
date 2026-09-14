import styled from 'styled-components';

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  max-width: 480px;
`;

const Chip = styled.button`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.panelBorder};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.cyan};
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

const ACTIONS = [
  { label: 'Open browser', text: 'Open my browser' },
  { label: 'Search web', text: 'Search the web for latest tech news' },
  { label: 'Open notepad', text: 'Open notepad' },
  { label: 'Job search', text: 'Search LinkedIn for react developer jobs' }
];

export default function QuickActions({ onPick }) {
  return (
    <Row>
      {ACTIONS.map((a) => (
        <Chip key={a.label} onClick={() => onPick(a.text)}>
          {a.label}
        </Chip>
      ))}
    </Row>
  );
}
