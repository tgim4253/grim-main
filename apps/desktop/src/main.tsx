import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/index.css';
import i18n from './i18n';
import App from './app';
import { installWebviewGuards } from './shared/lib/installWebviewGuards';

installWebviewGuards();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    i18n.t('app.error.root_element_not_found', { defaultValue: 'Root element not found' }),
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
