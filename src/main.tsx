import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { init } from './data/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles/app.css';

// Inside another site's frame, its page could steer taps onto our buttons (clickjacking).
// GitHub Pages can't send frame-ancestors or X-Frame-Options, so the app simply doesn't start there.
if (window.top === window.self) {
  init();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
