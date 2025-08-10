import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import AuthGate from './components/AuthGate'

createRoot(document.getElementById("root")!).render(
  <AuthGate>
    <App />
  </AuthGate>
);
