import type { DiagnosticTelemetry } from '../types/feedback';

// Redact sensitive patterns (passwords, auth tokens, bearer headers, credit card numbers, PINs)
export function sanitizeSensitiveData<T>(data: T): T {
  if (!data) return data;
  
  if (typeof data === 'string') {
    let sanitized = data;
    // Bearer token / JWT pattern
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, 'Bearer [REDACTED_JWT]');
    // Password fields
    sanitized = sanitized.replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"[REDACTED]"');
    // Credit card 16 digit pattern
    sanitized = sanitized.replace(/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, '[REDACTED_CARD]');
    // PIN pattern
    sanitized = sanitized.replace(/"pin"\s*:\s*"[^"]+"/gi, '"pin":"[REDACTED]"');
    return sanitized as unknown as T;
  }

  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(item => sanitizeSensitiveData(item)) as unknown as T;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('pin') ||
        lowerKey.includes('cardnumber')
      ) {
        result[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        result[key] = sanitizeSensitiveData(value);
      }
    }
    return result as T;
  }

  return data;
}

// Global console log ring buffer to attach recent logs to telemetry
const consoleLogBuffer: string[] = [];
const MAX_LOG_BUFFER = 25;

if (typeof window !== 'undefined') {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    try {
      const logStr = `[LOG ${new Date().toISOString()}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
      consoleLogBuffer.push(sanitizeSensitiveData(logStr).substring(0, 300));
      if (consoleLogBuffer.length > MAX_LOG_BUFFER) consoleLogBuffer.shift();
    } catch (err) {
      void err;
    }
    originalLog.apply(console, args as [any, ...any[]]);
  };

  console.error = (...args: unknown[]) => {
    try {
      const logStr = `[ERROR ${new Date().toISOString()}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
      consoleLogBuffer.push(sanitizeSensitiveData(logStr).substring(0, 300));
      if (consoleLogBuffer.length > MAX_LOG_BUFFER) consoleLogBuffer.shift();
    } catch (err) {
      void err;
    }
    originalError.apply(console, args as [any, ...any[]]);
  };

  console.warn = (...args: unknown[]) => {
    try {
      const logStr = `[WARN ${new Date().toISOString()}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
      consoleLogBuffer.push(sanitizeSensitiveData(logStr).substring(0, 300));
      if (consoleLogBuffer.length > MAX_LOG_BUFFER) consoleLogBuffer.shift();
    } catch (err) {
      void err;
    }
    originalWarn.apply(console, args as [any, ...any[]]);
  };
}

// User Agent parser helper
function parseBrowserAndOS() {
  const ua = navigator.userAgent;
  let browserName = 'Unknown Browser';
  let browserVersion = '';
  let osName = 'Unknown OS';
  let osVersion = '';

  if (ua.includes('Firefox/')) {
    browserName = 'Firefox';
    browserVersion = ua.split('Firefox/')[1]?.split(' ')[0] || '';
  } else if (ua.includes('Chrome/')) {
    browserName = 'Chrome';
    browserVersion = ua.split('Chrome/')[1]?.split(' ')[0] || '';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browserName = 'Safari';
    browserVersion = ua.split('Version/')[1]?.split(' ')[0] || '';
  } else if (ua.includes('Edg/')) {
    browserName = 'Edge';
    browserVersion = ua.split('Edg/')[1]?.split(' ')[0] || '';
  }

  if (ua.includes('Windows NT')) {
    osName = 'Windows';
    osVersion = ua.split('Windows NT ')[1]?.split(';')[0] || '';
  } else if (ua.includes('Mac OS X')) {
    osName = 'macOS';
    osVersion = ua.split('Mac OS X ')[1]?.split(')')[0]?.replace(/_/g, '.') || '';
  } else if (ua.includes('Android')) {
    osName = 'Android';
    osVersion = ua.split('Android ')[1]?.split(';')[0] || '';
  } else if (ua.includes('iPhone OS') || ua.includes('iPad')) {
    osName = 'iOS';
    osVersion = ua.split('OS ')[1]?.split(' ')[0]?.replace(/_/g, '.') || '';
  } else if (ua.includes('Linux')) {
    osName = 'Linux';
  }

  return { browserName, browserVersion, osName, osVersion };
}

export function collectTelemetry(
  contextEnrichment?: {
    walletContext?: DiagnosticTelemetry['walletContext'];
    chatContext?: DiagnosticTelemetry['chatContext'];
    communityContext?: DiagnosticTelemetry['communityContext'];
  },
  errorContext?: {
    errorMessage?: string;
    errorName?: string;
    stackTrace?: string;
    failedApiEndpoint?: string;
    httpStatus?: number;
    requestDurationMs?: number;
  }
): DiagnosticTelemetry {
  const { browserName, browserVersion, osName, osVersion } = parseBrowserAndOS();
  const connection = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;

  return {
    appVersion: 'v1.0.5-enterprise',
    buildNumber: '2026.08.05.1',
    deviceModel: window.screen.width < 768 ? 'Mobile Device' : 'Desktop / Laptop',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    browserName,
    browserVersion,
    operatingSystem: osName,
    osVersion,
    sessionId: sessionStorage.getItem('note_session_id') || `sess_${Math.random().toString(36).substring(2, 9)}`,
    currentRoute: window.location.pathname + window.location.search,
    lastAction: sessionStorage.getItem('note_last_action') || 'Navigation',
    networkType: connection?.effectiveType || (navigator.onLine ? 'online' : 'offline'),
    isOnline: navigator.onLine,
    apiTraceId: `trace_${Math.random().toString(36).substring(2, 12)}`,
    requestId: `req_${Date.now()}`,
    featureFlags: {
      enterpriseFeedbackV2: true,
      aiAssistEnabled: true,
      walletDirectTransfer: true,
      chatAgoraRtc: true,
    },
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

    walletContext: sanitizeSensitiveData(contextEnrichment?.walletContext || {}),
    chatContext: sanitizeSensitiveData(contextEnrichment?.chatContext || {}),
    communityContext: sanitizeSensitiveData(contextEnrichment?.communityContext || {}),

    errorMessage: errorContext?.errorMessage ? sanitizeSensitiveData(errorContext.errorMessage) : undefined,
    errorName: errorContext?.errorName,
    stackTrace: errorContext?.stackTrace ? sanitizeSensitiveData(errorContext.stackTrace) : undefined,
    consoleLogs: [...consoleLogBuffer],
    failedApiEndpoint: errorContext?.failedApiEndpoint,
    httpStatus: errorContext?.httpStatus,
    requestDurationMs: errorContext?.requestDurationMs,
  };
}
