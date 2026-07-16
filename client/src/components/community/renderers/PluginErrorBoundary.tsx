import React, { ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  pluginId: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[PluginErrorBoundary] Plugin '${this.props.pluginId}' crashed:`, error, errorInfo);
    // In production, send to Sentry/Datadog here
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-4 my-2 text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
            Unable to render this content.
          </p>
          <p className="text-xs text-red-500/70 dark:text-red-400/70">
            The {this.props.pluginId} plugin encountered an unexpected error.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
