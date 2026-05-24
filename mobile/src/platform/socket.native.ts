/**
 * SocketLifecycleManager — Native Platform (socket.native.ts)
 *
 * React Native / Expo equivalent of socket.web.ts.
 *
 * Key differences from the web version:
 * - Uses AsyncStorage-aware token retrieval
 * - No `import.meta.env` (uses `process.env.EXPO_PUBLIC_*`)
 * - App state listener to handle foreground/background reconnect cycles
 * - Aggressive stale listener cleanup on AppState change
 *
 * NEVER import directly — always use '@/platform/socket'.
 */
import { io, Socket } from 'socket.io-client';
import { AppState, AppStateStatus } from 'react-native';

const GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || 'https://realtime-gateway-gsb5.onrender.com';

type Listener = { event: string; handler: (...args: any[]) => void };

class NativeSocketLifecycleManager {
  private socket: Socket | null = null;
  private listeners: Listener[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_BACKOFF_MS = 30000;
  private readonly HEARTBEAT_INTERVAL_MS = 20000; // Shorter for mobile
  private isConnecting = false;
  private currentToken: string | null = null;
  private currentUserId: string | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  connect(token: string, userId: string): Socket | null {
    // Singleton enforcement
    if (this.socket?.connected && this.currentUserId === userId) {
      return this.socket;
    }

    if (this.isConnecting && this.currentUserId === userId) {
      return this.socket;
    }

    // User changed — full reset
    if (this.currentUserId && this.currentUserId !== userId) {
      console.log('[SocketLifecycle:Native] User changed — resetting socket');
      this._cleanup(true);
    } else if (this.socket) {
      this._cleanup(false);
    }

    this.currentToken = token;
    this.currentUserId = userId;
    this.isConnecting = true;

    console.log(`[SocketLifecycle:Native] Creating socket for user ${userId}`);

    const socket = io(GATEWAY_URL, {
      auth: { token },
      transports: ['websocket'], // Native WebSocket only — no XHR polling on mobile
      reconnection: false,       // Managed manually with AppState awareness
      timeout: 60000,
    });

    socket.on('connect', () => {
      console.log('[SocketLifecycle:Native] ✓ Connected');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this._startHeartbeat(socket);
      this._reattachListeners(socket);
      this._registerAppStateListener();
    });

    socket.on('disconnect', (reason) => {
      console.warn(`[SocketLifecycle:Native] Disconnected: ${reason}`);
      this._stopHeartbeat();
      this.isConnecting = false;

      if (reason !== 'io client disconnect') {
        // Only reconnect if app is in foreground
        const state = AppState.currentState;
        if (state === 'active') {
          this._scheduleReconnect();
        } else {
          console.log('[SocketLifecycle:Native] App in background — deferring reconnect');
        }
      }
    });

    socket.on('connect_error', (err) => {
      console.error(`[SocketLifecycle:Native] Connect error: ${err.message}`);
      this.isConnecting = false;
      this._scheduleReconnect();
    });

    this.socket = socket;
    return socket;
  }

  disconnect() {
    console.log('[SocketLifecycle:Native] Explicit disconnect');
    this._cancelReconnect();
    this._removeAppStateListener();
    this._cleanup(true);
    this.currentToken = null;
    this.currentUserId = null;
  }

  on(event: string, handler: (...args: any[]) => void) {
    const isDuplicate = this.listeners.some(l => l.event === event && l.handler === handler);
    if (!isDuplicate) {
      this.listeners.push({ event, handler });
    }
    this.socket?.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.handler === handler));
    this.socket?.off(event, handler);
  }

  offEvent(event: string) {
    this.listeners = this.listeners.filter(l => l.event !== event);
    this.socket?.removeAllListeners(event);
  }

  emit(event: string, data?: any) {
    if (!this.socket?.connected) {
      console.warn(`[SocketLifecycle:Native] Dropping emit — not connected: ${event}`);
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
      socket.off(event, handler);
      socket.on(event, handler);
    }
    console.log(`[SocketLifecycle:Native] Re-attached ${this.listeners.length} listeners`);
  }

  private _scheduleReconnect() {
    if (!this.currentToken || !this.currentUserId) return;
    this._cancelReconnect();
    const delay = Math.min(1000 * (2 ** this.reconnectAttempts), this.MAX_BACKOFF_MS);
    this.reconnectAttempts++;
    console.log(`[SocketLifecycle:Native] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentToken && this.currentUserId && AppState.currentState === 'active') {
        this.connect(this.currentToken, this.currentUserId);
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

  private _registerAppStateListener() {
    this._removeAppStateListener();
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[SocketLifecycle:Native] App foregrounded — checking socket');
        if (!this.socket?.connected && this.currentToken && this.currentUserId) {
          this.reconnectAttempts = 0; // Reset backoff on foreground
          this.connect(this.currentToken, this.currentUserId);
        }
      } else {
        console.log('[SocketLifecycle:Native] App backgrounded — cancelling reconnect timer');
        this._cancelReconnect();
        // Optionally disconnect to save battery/bandwidth
        // this._stopHeartbeat();
      }
    });
  }

  private _removeAppStateListener() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
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
      this._removeAppStateListener();
    }
    this.isConnecting = false;
  }
}

export const socketManager = new NativeSocketLifecycleManager();
