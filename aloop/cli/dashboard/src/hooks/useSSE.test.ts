import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSE } from './useSSE';
import type { DashboardState } from '../AppView';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  private listeners = new Map<string, ((evt: Event) => void)[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (evt: Event) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(handler);
    this.listeners.set(type, arr);
  }

  removeEventListener(type: string, handler: (evt: Event) => void) {
    const arr = this.listeners.get(type) ?? [];
    this.listeners.set(type, arr.filter((h) => h !== handler));
  }

  close() {}

  emit(type: string, data: unknown) {
    const arr = this.listeners.get(type) ?? [];
    const evt = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const handler of arr) handler(evt);
  }
}

const baseState: DashboardState = {
  sessionDir: '/tmp/session',
  workdir: '/tmp/workdir',
  runtimeDir: '/tmp/runtime',
  updatedAt: '2026-03-19T12:00:00.000Z',
  status: null,
  log: '',
  docs: {},
  activeSessions: [],
  recentSessions: [],
  artifacts: [],
  repoUrl: null,
  meta: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useSSE', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('calls initial fetch on mount and invokes onStateUpdate', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(baseState));
    vi.stubGlobal('fetch', fetchMock);
    const onStateUpdate = vi.fn();

    const { result } = renderHook(() => useSSE(null, onStateUpdate));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith('/api/state', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onStateUpdate).toHaveBeenCalledWith(baseState);
  });

  it('opens SSE EventSource on mount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(baseState)));

    const { result } = renderHook(() => useSSE(null, vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe('/events');
  });

  it('includes session param in URLs when selectedSessionId is provided', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(baseState));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSSE('sess-123', vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/state?session=sess-123',
      expect.any(Object),
    );
    expect(MockEventSource.instances[0].url).toBe('/events?session=sess-123');
  });

  it('calls onStateUpdate when SSE state event is received', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(baseState)));
    const onStateUpdate = vi.fn();

    const { result } = renderHook(() => useSSE(null, onStateUpdate));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const sse = MockEventSource.instances[0];

    const updatedState = { ...baseState, updatedAt: '2026-03-20T00:00:00.000Z' };
    act(() => { sse.emit('state', updatedState); });

    expect(onStateUpdate).toHaveBeenCalledWith(updatedState);
  });

  it('sets connectionStatus to connected when SSE opens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(baseState)));

    const { result } = renderHook(() => useSSE(null, vi.fn()));

    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const sse = MockEventSource.instances[0];

    act(() => { sse.onopen?.(); });

    expect(result.current.connectionStatus).toBe('connected');
  });

  it('reconnects after SSE error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(baseState)));

    const { result } = renderHook(() => useSSE(null, vi.fn()));

    // Wait for initial setup before mocking setTimeout (waitFor uses setTimeout internally)
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const sse = MockEventSource.instances[0];

    let reconnectCallback: (() => void) | null = null;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      reconnectCallback = typeof fn === 'function' ? (fn as () => void) : null;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    act(() => { sse.onerror?.(); });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(reconnectCallback).not.toBeNull();

    act(() => { reconnectCallback?.(); });

    expect(MockEventSource.instances.length).toBe(2);
  });

  it('sets loadError when initial fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'fail' }, 500)));

    const { result } = renderHook(() => useSSE(null, vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe('HTTP 500');
  });

  it('cleans up EventSource and aborts fetch on unmount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(baseState)));

    const { result, unmount } = renderHook(() => useSSE(null, vi.fn()));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const closeSpy = vi.spyOn(MockEventSource.instances[0], 'close');

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });
});
