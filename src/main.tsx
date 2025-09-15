import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './styles/mbs.theme.css';
import './lib/i18n';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import EnvBanner from './components/EnvBanner';
import { runPreviewChecks } from './components/PreviewHealthCheck';
import Skeleton from './components/Skeleton';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalErrorBoundary>
        <EnvBanner />
        <React.Suspense fallback={<Skeleton />}>
          <App />
        </React.Suspense>
        {import.meta.env.DEV && runPreviewChecks()}
      </GlobalErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
