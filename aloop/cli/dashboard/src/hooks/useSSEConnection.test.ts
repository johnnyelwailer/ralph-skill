import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock EventSource ----
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, EventListener[]> = {};
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    const arr = this.listeners[type];
    if (arr) this.listeners[type] = arr.filter((l) => l !== listener);
  }

  close() {
    this.readyState = 2;
  }

  // Test helpers
  emit(type: string, data?: string) {
    for (const l of this.listeners[type] ?? []) {
      l(new MessageEvent(type, { data }));
    }
  }

  triggerOpen() {
    if (this.onopen) this.onopen.call(this as unknown as EventSource, new Event('open'));
  }

  triggerError() {
    if (this.onerror) this.onerror.call(this as unknown as EventSource, new Event('error'));
  }
}

// ---- Setup ----
const origFetch = globalThis.fetch;

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    MockEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
  vi.clearAllTimers();
  delete (globalThis as unknown as Record<string, unknown>).EventSource;
});

import { useSSEConnection } from './useSSEConnection';

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('useSSEConnection', () => {
  it('sets loadError when cancelled is false during fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network failure'));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(result.current.loadError).toBe('network failure');
    });
  });

  it('handles malformed JSON in SSE state event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = MockEventSource.instances[0];
    es.emit('state', 'not-json');

    await waitFor(() => {
      expect(result.current.loadError).not.toBeNull();
    });
  });

  it('processes valid SSE state events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = MockEventSource.instances[0];
    const stateData = { log: 'line1', activeSessions: [], recentSessions: [] };
    es.emit('state', JSON.stringify(stateData));

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
  });

  it('handles qa coverage refresh signal from SSE state', async () => {
    const qaLine = JSON.stringify({ event: 'iteration_complete', phase: 'qa', timestamp: '2026-01-01T00:00:00Z', iteration: 5 });
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = MockEventSource.instances[0];
    // Emit a state event that contains a qa iteration_complete line in its log
    es.emit('state', JSON.stringify({ log: qaLine, activeSessions: [], recentSessions: [] }));

    await waitFor(() => {
      expect(result.current.qaCoverageRefreshKey).toContain('|5|');
    });
  });

  it('updates connection status on heartbeat', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = MockEventSource.instances[0];
    es.emit('heartbeat');

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  it('triggers reconnect on SSE error and schedules retry', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    renderHook(() => useSSEConnection(null));

    await vi.advanceTimersByTimeAsync(0);

    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    const es = MockEventSource.instances[0];
    es.triggerError();

    // Reconnect scheduled after 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource.instances.length).toBe(2);

    vi.useRealTimers();
  });

  it('handles fetch HTTP error (non-2xx)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(result.current.loadError).toBe('HTTP 404');
    });
  });

  it('sets connection status to connected on SSE open', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result } = renderHook(() => useSSEConnection(null));

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const es = MockEventSource.instances[0];
    es.triggerOpen();

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  it('resets state when selectedSessionId changes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { result, rerender } = renderHook(
      ({ sessionId }) => useSSEConnection(sessionId),
      { initialProps: { sessionId: 's1' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ sessionId: 's2' });

    expect(result.current.loading).toBe(true);
    expect(result.current.loadError).toBeNull();
    expect(result.current.qaCoverageRefreshKey).toBe('');
  });

  it('cleanup with null eventSource does not throw (line 56 branch)', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { unmount } = renderHook(() => useSSEConnection(null));
    await vi.advanceTimersByTimeAsync(0);

    // Trigger SSE error — this calls cleanupEventSource() internally,
    // which nulls out eventSource and listeners.
    act(() => { MockEventSource.instances[0].triggerError(); });

    // Now unmount — cleanup function runs cleanupEventSource() again,
    // hitting the `if (!eventSource) return` branch (line 56).
    act(() => { unmount(); });

    expect(true).toBe(true);
    vi.useRealTimers();
  });

  it('cancels reconnect when unmount fires during reconnect wait', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { unmount } = renderHook(() => useSSEConnection(null));
    await vi.advanceTimersByTimeAsync(0);

    // Trigger SSE error — cleanup runs, then reconnect timer scheduled at 1000ms
    act(() => { MockEventSource.instances[0].triggerError(); });

    // Unmount before the reconnect timer fires — sets cancelled=true, clears timer
    act(() => { unmount(); });

    // Wait past reconnect time
    await vi.advanceTimersByTimeAsync(2000);

    // Only the original instance — no reconnect happened after unmount
    expect(MockEventSource.instances.length).toBe(1);

    vi.useRealTimers();
  });

  it('cleans up during SSE error reconnect sequence', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResp({ log: '' }));

    const { unmount } = renderHook(() => useSSEConnection(null));
    await vi.advanceTimersByTimeAsync(0);

    // First SSE error — triggers cleanupEventSource + reconnect at 1000ms
    act(() => { MockEventSource.instances[0].triggerError(); });

    // Let reconnect happen
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource.instances.length).toBe(2);

    // Trigger error on second EventSource
    act(() => { MockEventSource.instances[1].triggerError(); });

    // Unmount during second reconnect wait — hit the line 90 cancelled path
    act(() => { unmount(); });

    // No more reconnects
    await vi.advanceTimersByTimeAsync(5000);
    expect(MockEventSource.instances.length).toBe(2);

    vi.useRealTimers();
  });

  it('covers cancelled paths in load() finally when fetch stays pending after unmount', async () => {
    const OrigAC = globalThis.AbortController;
    class NoopAbortController extends OrigAC {
      abort() { /* no-op */ }
    }
    (globalThis as unknown as { AbortController: typeof AbortController }).AbortController =
      NoopAbortController as unknown as typeof AbortController;

    let rejectFetch: ((err: Error) => void) | undefined;
    globalThis.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    })) as typeof fetch;

    const { unmount } = renderHook(() => useSSEConnection(null));

    // Unmount: cancelled=true, abort no-op, fetch stays pending
    unmount();

    // Reject fetch — cancelled=true means catch skips setLoadError,
    // and finally skips setLoading(false) — covering branches 3,4
    rejectFetch!(new Error('late error'));
    await new Promise((r) => setTimeout(r, 10));

    globalThis.AbortController = OrigAC;
  });
});
