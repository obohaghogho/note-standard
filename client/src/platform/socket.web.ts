/**
 * SocketLifecycleManager — Web Platform (socket.web.ts)
 *
 * Enforces:
 * - Singleton socket instance (no module-scope io() calls)
 * - Reconnect throttling with exponential backoff
 * - Listener deduplication (safely re-registers on reconnect)
 * - Stale listener cleanup on disconnect
 * - Heartbeat monitoring
 * - Transport downgrade fallback (websocket → polling)
 *
 * NEVER import this file directly. Always import from '@/platform/socket'
 * which resolves to .web.ts on web and .native.ts on mobile.
 */
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// ── Process-Level Singleton Registry ─────────────────────────────────────────
// Prevents double-initialization under React Strict Mode (which unmounts/remounts
// effects twice in development). By registering on the module object itself,
// we guarantee only ONE SocketLifecycleManager exists per browser tab session.
declare global {
  interface Window {
    __SOCKET_REGISTRY__?: SocketLifecycleManager;
  }
}

type Listener = { event: string; handler: (...args: unknown[]) => void };

class SocketLifecycleManager {
  private socket: Socket | null = null;
  private listeners: Listener[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_BACKOFF_MS = 30000;
  private readonly HEARTBEAT_INTERVAL_MS = 25000;
  private isConnecting = false;
  private currentToken: string | null = null;
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;
  private currentDeviceId: string | null = null;
  private onRevokedCallback: (() => void) | null = null;

  /** Connect with a valid auth token. Idempotent — safe to call multiple times. */
  connect(token: string, userId: string, sessionId?: string, deviceId?: string): Socket {
    // ── HARD SINGLETON LOCK ──────────────────────────────────────────────────
    const now = Date.now();
    const self = this as unknown as { _lastConnectAttemptAt?: number };
    if (self._lastConnectAttemptAt && now - self._lastConnectAttemptAt < 500) {
      console.log('[SocketLifecycle:Web] Strict Mode double-invoke guard triggered — skipping duplicate connect');
      return this.socket!;
    }
    self._lastConnectAttemptAt = now;

    // Singleton enforcement: reuse connected socket for same session
    if (this.socket?.connected && this.currentUserId === userId && this.currentSessionId === sessionId) {
      return this.socket;
    }

    // Prevent duplicate connection attempts during auth hydration
    if (this.isConnecting && this.currentUserId === userId) {
      return this.socket!;
    }

    // If user changed, do a full reset first
    if (this.currentUserId && this.currentUserId !== userId) {
      console.log(`[SocketLifecycle:Web] User changed — resetting socket`);
      this._cleanup(true);
    } else if (this.socket) {
      this._cleanup(false);
    }

    this.currentToken = token;
    this.currentUserId = userId;
    this.currentSessionId = sessionId ?? null;
    this.currentDeviceId = deviceId ?? null;
    this.isConnecting = true;

    console.log(`[SocketLifecycle:Web] Creating socket for user ${userId} session ${sessionId}`);

    const socket = io(SOCKET_URL, {
      auth: { token, sessionId, deviceId },
      transports: ['polling', 'websocket'], // polling first — ensures auth token validated in HTTP handshake
      reconnection: false, // We manage reconnects ourselves for backoff control
      timeout: 60000,
    });

    socket.on('connect', () => {
      const engine = (socket.io as unknown as { engine: { transport: { name: string }; on: (event: string, cb: (t: { name: string }) => void) => void } }).engine;
      console.log(`[SocketLifecycle:Web] ✓ Connected via ${engine.transport.name}`);
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this._startHeartbeat(socket);
      this._reattachListeners(socket);

      engine.on('upgrade', (t: { name: string }) => {
        console.log(`[SocketLifecycle:Web] ↑ Upgraded transport to ${t.name}`);
      });
    });

    socket.on('disconnect', (reason) => {
      console.warn(`[SocketLifecycle:Web] Disconnected: ${reason}`);
      this._stopHeartbeat();
      this.isConnecting = false;

      // Only auto-reconnect for server-side or network drops
      if (reason !== 'io client disconnect') {
        this._scheduleReconnect();
      }
    });

    socket.on('connect_error', (err) => {
      console.error(`[SocketLifecycle:Web] Connect error: ${err.message}`);
      this.isConnecting = false;
      this._scheduleReconnect();
    });

    // Session revocation — gateway tells us this socket's session has been killed
    socket.on('auth:revoked', () => {
      console.warn('[SocketLifecycle:Web] 🛑 Session revoked by server — disconnecting');
      this.disconnect();
      if (this.onRevokedCallback) this.onRevokedCallback();
    });

    // Soft replacement — a newer socket took over this session on another tab
    socket.on('session:replaced', () => {
      console.warn('[SocketLifecycle:Web] ♻️ Session replaced by newer connection — disconnecting');
      this.disconnect();
      if (this.onRevokedCallback) this.onRevokedCallback();
    });

    this.socket = socket;
    return socket;
  }

  /** Disconnect and fully clean up. Call on logout or user change. */
  disconnect() {
    console.log('[SocketLifecycle:Web] Explicit disconnect requested');
    this._cancelReconnect();
    this._cleanup(true);
    this.currentToken = null;
    this.currentUserId = null;
    this.currentSessionId = null;
    this.currentDeviceId = null;
  }

  /** Register a callback to be called when the session is server-revoked. */
  onRevoked(callback: () => void) {
    this.onRevokedCallback = callback;
  }

  /**
   * Register a lifecycle-persistent listener.
   * Deduplicates: calling this twice with the same event+handler is a no-op.
   */
  on(event: string, handler: (...args: unknown[]) => void) {
    const isDuplicate = this.listeners.some(l => l.event === event && l.handler === handler);
    if (!isDuplicate) {
      this.listeners.push({ event, handler });
    }
    this.socket?.on(event, handler);
  }

  /** Remove a listener by event + handler reference. */
  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.handler === handler));
    this.socket?.off(event, handler);
  }

  /** Remove ALL listeners for an event. Use on component unmount. */
  offEvent(event: string) {
    this.listeners = this.listeners.filter(l => l.event !== event);
    this.socket?.removeAllListeners(event);
  }

  emit(event: string, data?: unknown) {
    if (!this.socket?.connected) {
      console.warn(`[SocketLifecycle:Web] Dropping emit — not connected: ${event}`);
      return;
    }
    this.socket.emit(event, data);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get instance(): Socket | null {
    return this.socket;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _reattachListeners(socket: Socket) {
    for (const { event, handler } of this.listeners) {
      socket.off(event, handler); // Remove stale binding first
      socket.on(event, handler);  // Re-register fresh
    }
    console.log(`[SocketLifecycle:Web] Re-attached ${this.listeners.length} listeners after reconnect`);
  }

  private _scheduleReconnect() {
    if (!this.currentToken || !this.currentUserId) return;
    this._cancelReconnect();
    const delay = Math.min(1000 * (2 ** this.reconnectAttempts), this.MAX_BACKOFF_MS);
    this.reconnectAttempts++;
    console.log(`[SocketLifecycle:Web] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentToken && this.currentUserId) {
        this.connect(this.currentToken, this.currentUserId, this.currentSessionId ?? undefined, this.currentDeviceId ?? undefined);
      }
    }, delay);
  }

  private _cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _startHeartbeat(socket: Socket) {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { ts: Date.now() });
      } else {
        this._stopHeartbeat();
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _cleanup(fullReset: boolean) {
    this._stopHeartbeat();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    if (fullReset) {
      this.listeners = [];
      this.reconnectAttempts = 0;
    }
    this.isConnecting = false;
  }
}

// ── Module-Level Singleton Export ─────────────────────────────────────────────
// Reuse the same manager instance across React HMR reloads in development.
// `window.__SOCKET_REGISTRY__` persists across React component tree remounts.
if (!window.__SOCKET_REGISTRY__) {
  window.__SOCKET_REGISTRY__ = new SocketLifecycleManager();
}
export const socketManager = window.__SOCKET_REGISTRY__;
