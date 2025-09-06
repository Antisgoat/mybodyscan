import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/mbs.theme.css';
import { killSW } from './lib/killSW';

killSW();

createRoot(document.getElementById('root')!).render(<App />);
