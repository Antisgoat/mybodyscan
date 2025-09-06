import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/mbs.theme.css';
import { killServiceWorkers } from './lib/killSW';
import { initAnalytics } from './lib/firebase';

window.addEventListener(
  "error",
  () => {
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;top:0;left:0;right:0;background:#fee;color:#900;padding:8px 12px;font:14px/1.4 system-ui, sans-serif;z-index:99999";
    div.textContent = "App failed to start. Check console for details.";
    document.body.appendChild(div);
  },
  { once: true }
);

killServiceWorkers();
initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
