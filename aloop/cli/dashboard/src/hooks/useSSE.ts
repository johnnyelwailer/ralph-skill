import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, DashboardState } from '../AppView';

export interface UseSSEResult {
  connectionStatus: ConnectionStatus;
  loading: boolean;
  loadError: string | null;
}

export function useSSE(
  selectedSessionId: string | null,
  onStateUpdate: (state: DashboardState) => void,
): UseSSEResult {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onStateUpdateRef = useRef(onStateUpdate);
  onStateUpdateRef.current = onStateUpdate;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;
    let stateListener: ((evt: Event) => void) | null = null;
    let heartbeatListener: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    const sp = selectedSessionId ? `?session=${encodeURIComponent(selectedSessionId)}` : '';

    setLoading(true);
    setLoadError(null);

    async function load() {
      try {
        const r = await fetch(`/api/state${sp}`, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!cancelled) {
          const payload = await r.json() as DashboardState;
          onStateUpdateRef.current(payload);
        }
      } catch (e) { if (!cancelled) setLoadError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }

    function cleanupEventSource() {
      if (!eventSource) return;
      if (stateListener) eventSource.removeEventListener('state', stateListener);
      if (heartbeatListener) eventSource.removeEventListener('heartbeat', heartbeatListener);
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.close();
      eventSource = null;
      stateListener = null;
      heartbeatListener = null;
    }

    function connectSSE() {
      if (cancelled) return;
      setConnectionStatus('connecting');
      eventSource = new EventSource(`/events${sp}`);
      stateListener = (evt: Event) => {
        try {
          const payload = JSON.parse((evt as MessageEvent<string>).data) as DashboardState;
          onStateUpdateRef.current(payload);
          setLoadError(null);
          setConnectionStatus('connected');
          reconnectDelay = 1000;
        } catch (e) { setLoadError((e as Error).message); }
      };
      heartbeatListener = () => { setConnectionStatus('connected'); };
      eventSource.addEventListener('state', stateListener);
      eventSource.addEventListener('heartbeat', heartbeatListener);
      eventSource.onopen = () => { setConnectionStatus('connected'); reconnectDelay = 1000; };
      eventSource.onerror = () => {
        setConnectionStatus('disconnected');
        cleanupEventSource();
        if (!cancelled) {
          reconnectTimer = setTimeout(connectSSE, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      };
    }

    load().catch(() => undefined);
    connectSSE();

    return () => {
      cancelled = true;
      controller.abort();
      cleanupEventSource();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [selectedSessionId]);

  return { connectionStatus, loading, loadError };
}
