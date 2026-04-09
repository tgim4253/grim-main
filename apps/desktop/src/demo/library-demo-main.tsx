import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/index.css';
import { LibraryDemoPage } from '../pages/library/LibraryDemoPage';
import { DemoShell } from './DemoShell';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <DemoShell>
      <LibraryDemoPage />
    </DemoShell>
  </StrictMode>,
);
