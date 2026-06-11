/**
 * logger.ts — Centralized Frontend Forensic Logger
 *
 * Replaces the 6 ad-hoc log prefix styles scattered across the codebase:
 *   [Socket Forensic] [SYNC_FORENSICS] [CLIENT_TRACE] [ACCOUNT_FORENSIC]
 *   [CALL_TRACE] [Auth Forensic]
 *
 * PRESERVES ALL EXISTING CONSOLE OUTPUT — this logger wraps console methods
 * rather than replacing them, so every existing log still appears.
 *
 * Window-inspectable:
 *   window.__CHAT_LOGS__        — ring buffer of last 500 entries
 *   window.__CHAT_LOG_COUNTS__  — per-level counters
 *   window.chatLogger           — direct reference to this logger instance
 */

import type { CorrelationId } from './correlationId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'CHAT'
  | 'SOCKET'
  | 'API'
  | 'AUTH'
  | 'STATE'
  | 'SYSTEM'
  | 'CALL';

export interface LogEntry {
  timestamp: string;       // ISO 8601
  level: LogLevel;
  category: LogCategory;
  message: string;
  correlationId?: CorrelationId;
  conversationId?: string;
  userId?: string;
  messageId?: string;
  eventId?: string;
  durationMs?: number;
  data?: unknown;
}

// ── Ring Buffer ───────────────────────────────────────────────────────────────

const RING_BUFFER_SIZE = 500;
const ringBuffer: LogEntry[] = [];

/** Append an entry, dropping the oldest when the buffer is full. */
function appendToBuffer(entry: LogEntry): void {
  if (ringBuffer.length >= RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }
  ringBuffer.push(entry);
}

// ── Window Exposure ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    __CHAT_LOGS__: LogEntry[];
    __CHAT_LOG_COUNTS__: Record<LogLevel, number>;
    chatLogger: typeof logger;
  }
}

const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

if (typeof window !== 'undefined') {
  // Expose the live array reference so DevTools always sees current data
  window.__CHAT_LOGS__ = ringBuffer;
  window.__CHAT_LOG_COUNTS__ = counts;
}

// ── Level Guards ──────────────────────────────────────────────────────────────

const LEVEL_RANKS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Active minimum level.
 * In development: 'debug' (all logs).
 * In production:  'info'  (debug suppressed unless overridden via localStorage).
 */
function getMinLevel(): LogLevel {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('ns_log_level') as LogLevel | null;
    if (override && LEVEL_RANKS[override] !== undefined) return override;
  }
  return import.meta.env.DEV ? 'debug' : 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANKS[level] >= LEVEL_RANKS[getMinLevel()];
}

// ── Color Map (DevTools readability) ─────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #6b7280; font-weight: normal',   // gray
  info:  'color: #10b981; font-weight: bold',      // green
  warn:  'color: #f59e0b; font-weight: bold',      // amber
  error: 'color: #ef4444; font-weight: bold',      // red
};

const CATEGORY_STYLES: Record<LogCategory, string> = {
  CHAT:   'background: #1d4ed8; color: white; padding: 0 4px; border-radius: 3px',
  SOCKET: 'background: #7c3aed; color: white; padding: 0 4px; border-radius: 3px',
  API:    'background: #0891b2; color: white; padding: 0 4px; border-radius: 3px',
  AUTH:   'background: #065f46; color: white; padding: 0 4px; border-radius: 3px',
  STATE:  'background: #b45309; color: white; padding: 0 4px; border-radius: 3px',
  SYSTEM: 'background: #374151; color: white; padding: 0 4px; border-radius: 3px',
  CALL:   'background: #be185d; color: white; padding: 0 4px; border-radius: 3px',
};

// ── Core Emit ─────────────────────────────────────────────────────────────────

function emit(
  level: LogLevel,
  category: LogCategory,
  message: string,
  ctx: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'category' | 'message'>> = {}
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...ctx,
  };

  // 1. Append to ring buffer (always, regardless of log level gate)
  appendToBuffer(entry);
  counts[level]++;

  // 2. Emit to console (respecting level gate)
  if (!shouldLog(level)) return entry;

  const prefix = `%c[NS:${category}]%c %c${level.toUpperCase()}%c`;
  const prefixStyles = [
    CATEGORY_STYLES[category],
    '',
    LEVEL_STYLES[level],
    '',
  ];

  const extras: unknown[] = [];
  if (ctx.correlationId) extras.push(`cid=${ctx.correlationId}`);
  if (ctx.conversationId) extras.push(`conv=${ctx.conversationId.slice(0, 8)}`);
  if (ctx.messageId) extras.push(`msg=${ctx.messageId.slice(0, 8)}`);
  if (ctx.durationMs !== undefined) extras.push(`${ctx.durationMs}ms`);

  const metaSuffix = extras.length > 0 ? ` (${extras.join(' | ')})` : '';

  const consoleFn = level === 'error'
    ? console.error
    : level === 'warn'
    ? console.warn
    : console.log;

  if (ctx.data !== undefined) {
    consoleFn(
      `${prefix} ${message}${metaSuffix}`,
      ...prefixStyles,
      ctx.data
    );
  } else {
    consoleFn(
      `${prefix} ${message}${metaSuffix}`,
      ...prefixStyles
    );
  }

  return entry;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug: (category: LogCategory, message: string, ctx?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'category' | 'message'>>) =>
    emit('debug', category, message, ctx),

  info: (category: LogCategory, message: string, ctx?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'category' | 'message'>>) =>
    emit('info', category, message, ctx),

  warn: (category: LogCategory, message: string, ctx?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'category' | 'message'>>) =>
    emit('warn', category, message, ctx),

  error: (category: LogCategory, message: string, ctx?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'category' | 'message'>>) =>
    emit('error', category, message, ctx),

  /** Returns the full ring buffer snapshot (newest last). */
  getLogs: (): Readonly<LogEntry[]> => ringBuffer,

  /** Returns the last N entries. */
  getRecent: (n = 50): LogEntry[] => ringBuffer.slice(-n),

  /** Returns entries matching a specific correlation ID. */
  getByCorrelationId: (cid: CorrelationId): LogEntry[] =>
    ringBuffer.filter(e => e.correlationId === cid),

  /** Returns entries for a specific conversation. */
  getByConversation: (conversationId: string): LogEntry[] =>
    ringBuffer.filter(e => e.conversationId === conversationId),

  /** Clears the ring buffer (useful in tests, not recommended in production). */
  clear: (): void => { ringBuffer.length = 0; },

  /** Exports the full ring buffer as a JSON string for copy-paste debugging. */
  export: (): string => JSON.stringify(ringBuffer, null, 2),
};

// Expose logger on window for DevTools console access:
//   window.chatLogger.getByCorrelationId('cid_xxx')
if (typeof window !== 'undefined') {
  window.chatLogger = logger;
}

export default logger;
