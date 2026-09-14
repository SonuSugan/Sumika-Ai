import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; }

  html, body, #root {
    height: 100%;
    margin: 0;
  }

  body {
    background: radial-gradient(circle at 50% 20%, ${({ theme }) => theme.colors.bgGradientA}, ${({ theme }) => theme.colors.bgGradientB} 70%);
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.font};
    overflow: hidden;
  }
`;
