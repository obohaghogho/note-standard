import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const IS_PROD = import.meta.env.PROD;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.info('[Observability] Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || (IS_PROD ? 'production' : 'development'),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Tracing
    tracesSampleRate: IS_PROD ? 0.2 : 1.0,
    
    // Session Replay
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    // Data Scrubbing to protect user privacy and credentials
    beforeSend(event) {
      if (event.request && event.request.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Filter out noisy network aborts / offline errors
      if (event.exception?.values) {
        const firstVal = event.exception.values[0];
        if (
          firstVal?.value?.includes('Failed to fetch') ||
          firstVal?.value?.includes('NetworkError') ||
          firstVal?.value?.includes('Load failed')
        ) {
          event.level = 'warning';
        }
      }

      return event;
    },

    // Breadcrumb filtering
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        const url = String(breadcrumb.data?.url || '');
        if (url.includes('auth') || url.includes('password') || url.includes('token') || url.includes('key')) {
          if (breadcrumb.data) {
            delete breadcrumb.data.body;
          }
        }
      }
      return breadcrumb;
    }
  });

  console.info('[Observability] Sentry initialized successfully.');
}

/**
 * Sets user identity on the active Sentry scope
 */
export function setSentryUser(user: { id: string; email?: string; username?: string } | null) {
  if (!SENTRY_DSN) return;
  if (!user) {
    Sentry.setUser(null);
  } else {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  }
}

/**
 * Captures custom handled exceptions with structured tags
 */
export function captureAppError(error: Error | unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) {
    console.error('[AppError]', error, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(String(error), 'error');
    }
  });
}

export { Sentry };
