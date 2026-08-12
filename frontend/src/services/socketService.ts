import { io, Socket } from 'socket.io-client';
import { getBackendUrl, getAuthToken, clearAuthToken } from '../lib/api';

export type SocketErrorType = 'AUTH_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';

export interface SocketConnectionError {
  type: SocketErrorType;
  message: string;
}

function classifyErrorMessage(message: string): SocketConnectionError {
  const m = (message || '').toLowerCase();
  if (
    m.includes('unauthorized') ||
    m.includes('not your session') ||
    m.includes('invalid token') ||
    m.includes('token') ||
    m.includes('auth') ||
    m.includes('jwt')
  ) {
    return { type: 'AUTH_ERROR', message: 'Authentication failed. Please sign in again.' };
  }
  if (
    /connect|network|websocket|xhr|polling|timeout|econnrefused|enotfound|aborted|fetch|upgrade|unsupported/i.test(
      m,
    )
  ) {
    return { type: 'NETWORK_ERROR', message: 'Cannot reach the interview server. Check your network.' };
  }
  return { type: 'UNKNOWN_ERROR', message: message || 'Unexpected connection error.' };
}

export function classifySocketError(err: unknown): SocketConnectionError {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message || '')
      : String(err || '');
  return classifyErrorMessage(message);
}

/** Classify server-emitted `error` events (e.g. "Unauthorized", "Session not found"). */
export function classifyServerEventError(payload: unknown): SocketConnectionError {
  const message =
    typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message: unknown }).message || '')
      : '';
  return classifyErrorMessage(message);
}

class SocketService {
  private socket: Socket | null = null;

  /**
   * Connect to the /interview namespace. Returns the socket so callers can
   * attach their own handlers. `onError` is called with a structured
   * SocketConnectionError whenever the transport fails (connect_error).
   */
  connect(onError?: (err: SocketConnectionError) => void): Socket {
    if (this.socket?.connected) return this.socket;

    const token = getAuthToken();
    if (!token) {
      const authErr = { type: 'AUTH_ERROR' as const, message: 'No authentication token found. Cannot connect.' };
      setTimeout(() => onError?.(authErr), 0);
      throw new Error('No authentication token found. Cannot connect.');
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const backend = getBackendUrl();
    const url = backend ? `${backend}/interview` : '/interview';
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: 6,
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected to /interview namespace');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[SocketService] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SocketService] Connection error:', err.message);
      const classified = classifySocketError(err);
      if (classified.type === 'AUTH_ERROR') {
        clearAuthToken();
        window.localStorage.removeItem('interviewpilot_user');
        window.location.href = '/';
      }
      onError?.(classified);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.warn('[SocketService] Cannot emit — socket not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (...args: unknown[]) => void): void {
    this.socket?.off(event, handler);
  }
}

export const socketService = new SocketService();
