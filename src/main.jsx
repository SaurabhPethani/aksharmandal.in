import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import AppRouter from './routes/AppRouter';
import GlobalLoader from './components/GlobalLoader';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// QueryClientProvider wraps AuthProvider because AuthProvider clears the query
// cache on sign-out via useQueryClient.
//
// The boundary sits outermost: a throw in AuthProvider or the router itself has
// nothing else to catch it, and without this the app unmounts to a blank page.
// A second, finer-grained one wraps each routed page inside AppShell.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary variant="root" title="Akshar Connect could not start">
      <QueryClientProvider client={queryClient}>
        {/* Outside the router so it covers login and the session boot too — every
            request in the app, not just the ones made from a routed page. */}
        <GlobalLoader />
        <ToastProvider>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
