import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OpenChess render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('openchess_') || k.startsWith('crownline_'))) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch {
      // ignore storage access issues
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#1A1917] text-white flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-[#262421] border border-white/10 p-6 space-y-4 shadow-2xl">
            <h1 className="text-lg font-extrabold text-white">Unable to display OpenChess</h1>
            <p className="text-xs text-[#C8C4BC] leading-relaxed">
              Something interrupted rendering ({this.state.message}). You can reload the page or reset cached app data.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2.5 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-white cursor-pointer"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="px-4 py-2.5 rounded-xl bg-[#383530] hover:bg-[#46423C] text-xs font-bold text-[#DEDAD2] cursor-pointer"
              >
                Reset Local Cache &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
