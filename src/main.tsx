import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/mbs.theme.css';
import { killSW } from './lib/killSW';
import { ensureAppCheckInitialized } from './lib/appCheck';
import ErrorBoundary from './components/ErrorBoundary';

killSW();
ensureAppCheckInitialized();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
