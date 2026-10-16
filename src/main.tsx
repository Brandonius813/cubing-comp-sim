import { createRoot } from 'react-dom/client';
import App from './App';
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./operations/Dashboard'));
const isAdmin = /^\/admin(?:\/|$)/.test(location.pathname);
import { ErrorBoundary } from './ui/ErrorBoundary';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(<ErrorBoundary>{isAdmin ? <Suspense fallback={<p>Loading dashboard…</p>}><Dashboard /></Suspense> : <App />}</ErrorBoundary>);
