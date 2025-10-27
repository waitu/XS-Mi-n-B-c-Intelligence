import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import { AppRouter } from './router';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
