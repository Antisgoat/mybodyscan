import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/mbs.theme.css';
import { killSW } from './lib/killSW';
import ErrorBoundary from './components/ErrorBoundary';
import { ensureAppCheck } from './appCheck';

killSW();
void ensureAppCheck();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
