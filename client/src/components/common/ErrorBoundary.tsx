import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        
        // Handle chunk load errors (often due to new deployments)
        const isChunkLoadError = 
            error.name === 'ChunkLoadError' || 
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Loading chunk');

        if (isChunkLoadError) {
            // Check if we've already tried reloading to avoid infinite loops
            const hasReloaded = sessionStorage.getItem('last_chunk_load_error_reload');
            const now = Date.now();
            
            // If we haven't reloaded in the last 10 seconds, reload.
            if (!hasReloaded || (now - parseInt(hasReloaded)) > 10000) {
                sessionStorage.setItem('last_chunk_load_error_reload', now.toString());
                window.location.reload();
                return;
            }
        }

        // Show toast notification
        toast.error(`Something went wrong: ${error.message}`);
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0a0a] p-4 w-full max-w-full">
                    <div className="max-w-md w-full bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-lg p-8 text-center">
                        <div className="mb-4">
                            <svg
                                className="mx-auto h-12 w-12 text-red-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Oops! Something went wrong
                        </h1>
                        <p className="text-gray-400 mb-6">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={this.handleReset}
                                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Go Home
                            </button>
                        </div>
                        {import.meta.env.DEV && this.state.error && (
                            <details className="mt-6 text-left">
                                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
                                    Error Details (Dev Only)
                                </summary>
                                <pre className="mt-2 text-xs text-red-400 overflow-auto bg-black/50 p-3 rounded">
                                    {this.state.error.stack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
