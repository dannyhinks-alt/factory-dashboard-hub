import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

const KEY = 'factory-hub.session.v1';
/** Last line of defence: a render error shows its message and a one-click blank workspace instead of a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* message is shown on screen below */ }
  render() {
    if (!this.state.error) return this.props.children;
    return <div role="alert" style={{ padding: 24, font: '14px/1.5 Segoe UI, Arial, sans-serif', maxWidth: 720, margin: '40px auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: '#9f1239' }}>Factory Dashboard &amp; Flow Hub hit an error</h1>
      <pre data-testid="crash-message" style={{ whiteSpace: 'pre-wrap', background: '#FFF1F2', padding: 12, borderRadius: 6, margin: '12px 0' }}>{this.state.error.message}</pre>
      <p>A saved session in this browser may be out of date. Clearing it returns the app to a blank workspace.</p>
      <button style={{ marginTop: 12, padding: '8px 14px', background: '#9f1239', color: '#fff', borderRadius: 6, fontWeight: 600 }} data-testid="crash-clear"
        onClick={() => { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } location.reload(); }}>Clear / Blank Workspace</button></div>;
  }
}
