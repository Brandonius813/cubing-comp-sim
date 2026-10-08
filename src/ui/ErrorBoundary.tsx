import { Component, type ReactNode } from 'react';
import { telemetry } from '../telemetry';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { telemetry.reportError('client_error', { code: 'render_failed' }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="main-stage"><div className="center-message"><h1>CompSim could not continue</h1><p>Your saved history has not been cleared. Reload to try again.</p><button className="primary-button" onClick={() => location.reload()}>Reload</button></div></main>;
  }
}
