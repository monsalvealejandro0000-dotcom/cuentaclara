import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lib/theme';
import { App } from './App';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/confirm';
import { SessionProvider } from '@/lib/session';

createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
);
