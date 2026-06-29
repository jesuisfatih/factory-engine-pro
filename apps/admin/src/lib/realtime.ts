import { realtimeInvalidateSchema, type RealtimeInvalidate } from '@factory-engine-pro/contracts';
import { io, type Socket } from 'socket.io-client';
import { adminTokenStore, subscribeSession } from '@/lib/api';

type RealtimeListener = (payload: RealtimeInvalidate) => void;

const listeners = new Set<RealtimeListener>();
let socket: Socket | null = null;
let unsubscribeSession: (() => void) | null = null;

export function subscribeCallCenterRealtime(listener: RealtimeListener) {
  listeners.add(listener);
  ensureSessionWatcher();
  ensureSocket();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      closeSocket();
      unsubscribeSession?.();
      unsubscribeSession = null;
    }
  };
}

function ensureSessionWatcher() {
  if (unsubscribeSession) return;
  unsubscribeSession = subscribeSession(() => {
    closeSocket();
    if (listeners.size > 0) ensureSocket();
  });
}

function ensureSocket() {
  if (socket) return;
  const token = adminTokenStore.getAccessToken();
  if (!token) return;

  const { namespaceUrl, path } = realtimeEndpoint();
  socket = io(namespaceUrl, {
    path,
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  socket.on('call_center.overview.invalidate', (payload: unknown) => {
    const parsed = realtimeInvalidateSchema.safeParse(payload);
    if (!parsed.success) return;
    for (const item of listeners) item(parsed.data);
  });

  socket.on('connect_error', () => undefined);
  socket.on('realtime.error', () => undefined);
}

function closeSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

function realtimeEndpoint() {
  const base = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4120/api/v1';
  const apiUrl = new URL(base, window.location.origin);
  const apiPath = apiUrl.pathname.replace(/\/$/, '');
  return {
    namespaceUrl: `${apiUrl.origin}/call-center`,
    path: `${apiPath}/realtime/socket.io`,
  };
}
