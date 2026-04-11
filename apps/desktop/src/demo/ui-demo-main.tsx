import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/index.css';
import { DemoShell } from './DemoShell';
import { UiDemoPage } from './UiDemoPage';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <DemoShell>
      <UiDemoPage />
    </DemoShell>
  </StrictMode>,
);
