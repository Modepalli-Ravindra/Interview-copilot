import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket?.connected) return this.socket;

    this.socket = io('/interview', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected to /interview namespace');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[SocketService] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SocketService] Connection error:', err.message);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
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
