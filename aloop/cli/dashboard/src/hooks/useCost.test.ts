import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCost } from './useCost';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useCost', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('aggregates sessionCost from iteration_complete log lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ total_usd: 0 })));

    const log = [
      JSON.stringify({ event: 'iteration_complete', cost_usd: 0.12 }),
      JSON.stringify({ event: 'iteration_complete', cost_usd: '0.38' }),
      JSON.stringify({ event: 'iteration_complete', cost_usd: -1 }),
      JSON.stringify({ event: 'iteration_error', cost_usd: 9.99 }),
      'not json',
    ].join('\n');

    const { result } = renderHook(() => useCost({ log, meta: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessionCost).toBeCloseTo(0.5, 8);
  });

  it('fetches aggregate cost successfully and computes budget percentage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ total_usd: '2.5' })));

    const { result } = renderHook(() =>
      useCost({
        log: '',
        meta: { budget_cap_usd: '10' },
      }),
    );

    await waitFor(() => expect(result.current.totalCost).toBe(2.5));
    expect(result.current.error).toBeNull();
    expect(result.current.budgetCap).toBe(10);
    expect(result.current.budgetUsedPercent).toBe(25);
  });

  it('handles opencode_unavailable gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'opencode_unavailable' })),
    );

    const { result } = renderHook(() => useCost({ log: '', meta: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalCost).toBeNull();
    expect(result.current.error).toBe('opencode_unavailable');
    expect(result.current.budgetUsedPercent).toBeNull();
  });

  it('reports HTTP errors from aggregate endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'fail' }, 503)));

    const { result } = renderHook(() => useCost({ log: '', meta: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('HTTP 503');
    expect(result.current.totalCost).toBeNull();
  });

  it('uses cost_poll_interval_minutes from meta for polling', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ total_usd: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    let intervalCallback: (() => void) | null = null;
    const setIntervalSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((handler: TimerHandler, _timeout?: number) => {
        intervalCallback = handler as () => void;
        return 123 as unknown as number;
      });

    const { result } = renderHook(() =>
      useCost({
        log: '',
        meta: { cost_poll_interval_minutes: '2' },
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120000);

    expect(intervalCallback).toEqual(expect.any(Function));
  });

  it('guards against concurrent fetches using inFlightRef', async () => {
    const first = deferred<Response>();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => first.promise);
    vi.stubGlobal('fetch', fetchMock);

    let intervalCallback: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation((handler: TimerHandler, _timeout?: number) => {
      intervalCallback = handler as () => void;
      return 123 as unknown as number;
    });

    const { result } = renderHook(() => useCost({ log: '', meta: null }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      intervalCallback?.();
      intervalCallback?.();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(jsonResponse({ total_usd: 1 }));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalCost).toBe(1);
  });

  it('skips state updates when request resolves after unmount (cancelled=true path)', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(async () => await pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useCost({ log: '', meta: null }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      pending.resolve(jsonResponse({ error: 'opencode_unavailable' }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips error state updates when request rejects after unmount (cancelled=true catch path)', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(async () => await pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useCost({ log: '', meta: null }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      pending.reject(new Error('network down'));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats NaN-producing numeric strings as null via toNumber', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ total_usd: 2.5 })));

    const { result } = renderHook(() =>
      useCost({
        log: '',
        meta: { budget_cap_usd: 'abc-not-a-number' },
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.totalCost).toBe(2.5);
    expect(result.current.budgetCap).toBeNull();
    expect(result.current.budgetUsedPercent).toBeNull();
  });
});
