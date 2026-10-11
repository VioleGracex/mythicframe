import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { showInAppAlert, showInAppConfirm, showInAppPrompt } from './services/dialogService';

// Global safety shims: route modal dialogs to in-app dialogs
(window as any).showInAppAlert = showInAppAlert;
(window as any).showInAppConfirm = showInAppConfirm;
(window as any).showInAppPrompt = showInAppPrompt;

window.alert = (msg?: any) => {
  showInAppAlert(String(msg ?? ''));
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
