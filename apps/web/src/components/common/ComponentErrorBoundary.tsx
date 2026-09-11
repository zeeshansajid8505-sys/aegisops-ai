'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ComponentErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-xl border border-rose-900/40 bg-slate-950/80 text-center space-y-4 my-3">
          <div className="flex items-center justify-center space-x-2 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            <h4 className="text-sm font-semibold text-slate-200">
              {this.props.fallbackTitle || 'Component Failed to Render'}
            </h4>
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred in this section.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry Section</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

