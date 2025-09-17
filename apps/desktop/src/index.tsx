import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import '@tgim/ui/styles/index.css';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
