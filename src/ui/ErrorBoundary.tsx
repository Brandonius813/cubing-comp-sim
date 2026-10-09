import { Component, type ReactNode } from 'react';
import { telemetry } from '../telemetry';
import { t } from './i18n';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { telemetry.reportError('client_error', { code: 'RENDER_FAILED' }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="main-stage"><div className="center-message"><h1>{t('appFailed')}</h1><p>{t('reloadDescription')}</p><button className="primary-button" onClick={() => location.reload()}>{t('reload')}</button></div></main>;
  }
}
