import styled from 'styled-components';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 4px 8px 4px 2px;

  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.panelBorder};
    border-radius: 4px;
  }
`;

const Bubble = styled.div`
  align-self: ${({ $me }) => ($me ? 'flex-end' : 'flex-start')};
  background: ${({ $me, theme }) => ($me ? 'rgba(91, 230, 255, 0.12)' : theme.colors.panel)};
  border: 1px solid ${({ $me, theme }) => ($me ? theme.colors.cyanSoft : theme.colors.panelBorder)};
  color: ${({ theme }) => theme.colors.text};
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.4;
  max-width: 85%;
`;

const Tag = styled.span`
  display: block;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textDim};
  margin-bottom: 4px;
`;

const LinkRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const LinkChip = styled.a`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.cyan};
  border: 1px solid ${({ theme }) => theme.colors.cyanSoft};
  border-radius: 999px;
  padding: 3px 10px;
  text-decoration: none;

  &:hover {
    border-color: ${({ theme }) => theme.colors.cyan};
  }
`;

export default function ChatLog({ messages }) {
  return (
    <List>
      {messages.map((m, i) => (
        <Bubble key={i} $me={m.role === 'user'}>
          <Tag>{m.role === 'user' ? 'You' : `Sumika${m.provider ? ` · ${m.provider}` : ''}`}</Tag>
          {m.text}
          {m.links?.length > 0 && (
            <LinkRow>
              {m.links.map((url) => (
                <LinkChip key={url} href={url} target="_blank" rel="noopener noreferrer">
                  Open ↗
                </LinkChip>
              ))}
            </LinkRow>
          )}
        </Bubble>
      ))}
    </List>
  );
}
