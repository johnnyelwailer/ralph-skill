import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { DashboardState } from '@/lib/types';

// ---- Mock dependencies ----
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSSEConnection', () => ({
  useSSEConnection: vi.fn(),
}));

vi.mock('@/hooks/useCost', () => ({
  useCost: vi.fn(),
}));

// ---- Imports after mocks ----
import { useDashboardState } from './useDashboardState';
import { useSSEConnection } from './useSSEConnection';
import { useCost } from './useCost';
import { toast } from 'sonner';

// ---- Helpers ----
function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sessionDir: '/tmp/session',
    workdir: '/tmp/workdir',
    runtimeDir: '/tmp/runtime',
    updatedAt: '2026-03-19T12:00:00.000Z',
    status: { state: 'running', phase: 'build', iteration: 3, provider: 'claude', model: 'sonnet', started_at: '2026-03-19T11:58:00.000Z' },
    log: '',
    docs: { 'TODO.md': '- [x] done\n- [ ] todo' },
    activeSessions: [],
    recentSessions: [],
    artifacts: [],
    repoUrl: null,
    meta: null,
    ...overrides,
  };
}

function makeSseResult(overrides: Partial<ReturnType<typeof useSSEConnection>> = {}) {
  return {
    state: null,
    loading: true,
    loadError: null,
    connectionStatus: 'connecting' as const,
    qaCoverageRefreshKey: '',
    ...overrides,
  };
}

function makeCostResult(overrides = {}) {
  return {
    sessionCost: 0,
    totalCost: null,
    budgetCap: null,
    budgetUsedPercent: null,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// ---- Setup ----
const mockUseSSEConnection = useSSEConnection as Mock;
const mockUseCost = useCost as Mock;
const mockToast = toast as unknown as Mock & { success: Mock; error: Mock; info: Mock };

describe('useDashboardState', () => {
  beforeEach(() => {
    mockUseSSEConnection.mockReturnValue(makeSseResult());
    mockUseCost.mockReturnValue(makeCostResult());
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    // Reset location to no session param
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '', href: 'http://localhost/' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // ---- Initial state ----
  describe('initial state', () => {
    it('returns loading=true and no state when SSE hook says loading', () => {
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.loading).toBe(true);
      expect(result.current.state).toBeNull();
      expect(result.current.selectedSessionId).toBeNull();
      expect(result.current.commandOpen).toBe(false);
      expect(result.current.activePanel).toBe('docs');
    });

    it('reads initial session from URL search params', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { search: '?session=my-session', href: 'http://localhost/?session=my-session' },
      });
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.selectedSessionId).toBe('my-session');
    });

    it('returns default sessions list when state is null', () => {
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].id).toBe('current');
      expect(result.current.sessions[0].status).toBe('unknown');
    });
  });

  // ---- sessions useMemo branches ----
  describe('sessions computation', () => {
    it('returns active + recent sessions when combined is non-empty', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({
          activeSessions: [{ session_id: 'a-1', project_name: 'proj', state: 'running', phase: 'build', iteration: 2 }],
          recentSessions: [{ session_id: 'r-1', state: 'stopped', phase: 'review', iteration: 5 }],
        }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      const ids = result.current.sessions.map((s) => s.id);
      expect(ids).toContain('a-1');
      expect(ids).toContain('r-1');
    });

    it('falls back to status record as single session when no active/recent', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ activeSessions: [], recentSessions: [] }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.sessions).toHaveLength(1);
    });

    it('falls back to workdir-named session when status is not a record', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ activeSessions: [], recentSessions: [], status: null }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.sessions[0].name).toBe('/tmp/workdir');
    });

    it('ignores non-record entries in activeSessions', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ activeSessions: ['not-a-record', null, 42], recentSessions: [] }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      // none of the non-record entries become sessions, falls back to status record
      expect(result.current.sessions).toHaveLength(1);
    });
  });

  // ---- Derived status fields ----
  describe('derived status fields', () => {
    it('extracts currentPhase, currentState, currentIteration from statusRecord', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: { state: 'running', phase: 'build', iteration: 7, provider: 'claude', model: 'sonnet', started_at: 'ts' } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.currentPhase).toBe('build');
      expect(result.current.currentState).toBe('running');
      expect(result.current.currentIteration).toBe('7');
      expect(result.current.isRunning).toBe(true);
    });

    it('returns empty/unknown values when statusRecord is null', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: null }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.currentPhase).toBe('');
      expect(result.current.currentState).toBe('unknown');
      expect(result.current.currentIteration).toBe('--');
      expect(result.current.isRunning).toBe(false);
      expect(result.current.currentIterationNum).toBeNull();
      expect(result.current.stuckCount).toBe(0);
    });

    it('extracts stuckCount from statusRecord', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: { stuck_count: 3, state: 'running', phase: 'build' } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.stuckCount).toBe(3);
    });

    it('returns null maxIterations when meta is null or missing', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ meta: null }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.maxIterations).toBeNull();
    });

    it('extracts maxIterations from meta', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ meta: { max_iterations: 20 } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.maxIterations).toBe(20);
    });
  });

  // ---- currentSessionName ----
  describe('currentSessionName', () => {
    it('returns name of first session when selectedSessionId is null', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({
          activeSessions: [{ session_id: 'a-1', project_name: 'proj', state: 'running', phase: 'build', iteration: 1 }],
        }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.currentSessionName).toBe('a-1');
    });

    it('returns "No session" when session not found', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ activeSessions: [{ session_id: 's-1', state: 'running', phase: 'build', iteration: 1 }] }),
        loading: false,
      }));
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { search: '?session=nonexistent', href: 'http://localhost/?session=nonexistent' },
      });
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.currentSessionName).toBe('No session');
    });
  });

  // ---- budgetWarnings ----
  describe('budgetWarnings', () => {
    it('returns empty array when metaRecord is null', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: null }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetWarnings).toEqual([]);
    });

    it('returns empty array when budget_warnings is not an array', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_warnings: 'oops' } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetWarnings).toEqual([]);
    });

    it('filters out non-positive and non-finite values', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ meta: { budget_warnings: [0.5, '1.0', -1, 'bad', null, Infinity] } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetWarnings).toEqual([0.5, 1.0]);
    });
  });

  // ---- budgetPauseThreshold ----
  describe('budgetPauseThreshold', () => {
    it('returns null when metaRecord is null', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: null }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBeNull();
    });

    it('returns numeric value when budget_pause_threshold is a positive number', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_pause_threshold: 5.0 } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBe(5.0);
    });

    it('parses string value for budget_pause_threshold', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_pause_threshold: '3.5' } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBe(3.5);
    });

    it('returns null for non-positive number', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_pause_threshold: 0 } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBeNull();
    });

    it('returns null for empty string budget_pause_threshold', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_pause_threshold: '' } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBeNull();
    });

    it('returns null for invalid string budget_pause_threshold', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: { budget_pause_threshold: 'bad' } }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.budgetPauseThreshold).toBeNull();
    });
  });

  // ---- configuredProviders ----
  describe('configuredProviders (via providerHealth)', () => {
    it('returns empty array when metaRecord is null', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({ state: makeState({ meta: null }), loading: false }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.providerHealth).toEqual([]);
    });

    it('reads enabled_providers from meta', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ meta: { enabled_providers: ['claude', 'openai'] } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.providerHealth).toEqual([
        { name: 'claude', status: 'unknown', lastEvent: '' },
        { name: 'openai', status: 'unknown', lastEvent: '' },
      ]);
    });

    it('falls back to round_robin_order when enabled_providers is absent', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ meta: { round_robin_order: ['claude'] } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.providerHealth).toEqual([
        { name: 'claude', status: 'unknown', lastEvent: '' },
      ]);
    });
  });

  // ---- selectSession ----
  describe('selectSession', () => {
    it('updates URL with session param when id is provided', () => {
      const { result } = renderHook(() => useDashboardState());
      act(() => { result.current.selectSession('session-abc'); });
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(result.current.selectedSessionId).toBe('session-abc');
    });

    it('removes session param from URL when id is null', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { search: '?session=old', href: 'http://localhost/?session=old' },
      });
      const { result } = renderHook(() => useDashboardState());
      act(() => { result.current.selectSession(null); });
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(result.current.selectedSessionId).toBeNull();
    });
  });

  // ---- commandOpen ----
  describe('commandOpen toggle', () => {
    it('starts closed and can be toggled', () => {
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.commandOpen).toBe(false);
      act(() => { result.current.setCommandOpen(true); });
      expect(result.current.commandOpen).toBe(true);
      act(() => { result.current.setCommandOpen((p) => !p); });
      expect(result.current.commandOpen).toBe(false);
    });
  });

  // ---- phase-change toast ----
  describe('phase-change toast', () => {
    it('fires toast when phase changes', async () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: { state: 'running', phase: 'build' } }),
        loading: false,
      }));
      const { rerender } = renderHook(() => useDashboardState());

      // Change phase to 'review'
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: { state: 'running', phase: 'review', iteration: 4 } }),
        loading: false,
      }));
      rerender();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.stringContaining('build'),
          expect.any(Object),
        );
      });
    });

    it('does not fire toast on initial phase set', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ status: { state: 'running', phase: 'build' } }),
        loading: false,
      }));
      renderHook(() => useDashboardState());
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  // ---- handleSteer ----
  describe('handleSteer', () => {
    it('does nothing when instruction is empty', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleSteer(); });
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('submits instruction and shows success toast', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ ok: true })));
      const { result } = renderHook(() => useDashboardState());
      act(() => { result.current.setSteerInstruction('do something'); });
      await act(async () => { await result.current.handleSteer(); });
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/steer', expect.any(Object));
      expect(mockToast.success).toHaveBeenCalledWith('Steering instruction queued.');
      expect(result.current.steerInstruction).toBe('');
    });

    it('shows error toast on HTTP error response', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ error: 'bad request' }, 400)));
      const { result } = renderHook(() => useDashboardState());
      act(() => { result.current.setSteerInstruction('steer me'); });
      await act(async () => { await result.current.handleSteer(); });
      expect(mockToast.error).toHaveBeenCalledWith('bad request');
    });

    it('shows HTTP status in error when API has no error field', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({}, 503)));
      const { result } = renderHook(() => useDashboardState());
      act(() => { result.current.setSteerInstruction('steer me'); });
      await act(async () => { await result.current.handleSteer(); });
      expect(mockToast.error).toHaveBeenCalledWith('HTTP 503');
    });
  });

  // ---- handleStop ----
  describe('handleStop', () => {
    it('sends graceful stop (force=false) and shows info toast with signal', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ signal: 'SIGTERM' })));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleStop(false); });
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/stop', expect.objectContaining({ body: '{}' }));
      expect(mockToast.info).toHaveBeenCalledWith('Stop requested (SIGTERM).');
    });

    it('sends force stop (force=true)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ signal: 'SIGKILL' })));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleStop(true); });
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/stop', expect.objectContaining({
        body: JSON.stringify({ force: true }),
      }));
    });

    it('uses SIGTERM fallback when signal is absent in response', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({})));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleStop(false); });
      expect(mockToast.info).toHaveBeenCalledWith('Stop requested (SIGTERM).');
    });

    it('shows error toast on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ error: 'not allowed' }, 403)));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleStop(false); });
      expect(mockToast.error).toHaveBeenCalledWith('not allowed');
    });
  });

  // ---- handleResume ----
  describe('handleResume', () => {
    it('resumes loop and shows success toast with PID', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ pid: 4567 })));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleResume(); });
      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/resume', expect.any(Object));
      expect(mockToast.success).toHaveBeenCalledWith('Loop resumed (PID 4567).');
    });

    it('shows error toast on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ error: 'session not found' }, 404)));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleResume(); });
      expect(mockToast.error).toHaveBeenCalledWith('session not found');
    });

    it('shows HTTP status in error when API has no error field', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResp({}, 500)));
      const { result } = renderHook(() => useDashboardState());
      await act(async () => { await result.current.handleResume(); });
      expect(mockToast.error).toHaveBeenCalledWith('HTTP 500');
    });
  });

  // ---- todo progress ----
  describe('todo progress', () => {
    it('computes tasks from TODO.md', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ docs: { 'TODO.md': '- [x] a\n- [x] b\n- [ ] c' } }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.tasksCompleted).toBe(2);
      expect(result.current.tasksTotal).toBe(3);
      expect(result.current.progressPercent).toBe(67);
    });

    it('returns 0% progress when no tasks', () => {
      mockUseSSEConnection.mockReturnValue(makeSseResult({
        state: makeState({ docs: {} }),
        loading: false,
      }));
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.progressPercent).toBe(0);
    });
  });

  // ---- activity panel ----
  describe('activity panel', () => {
    it('toggles activePanel', () => {
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.activePanel).toBe('docs');
      act(() => { result.current.setActivePanel('activity'); });
      expect(result.current.activePanel).toBe('activity');
    });

    it('toggles activityCollapsed', () => {
      const { result } = renderHook(() => useDashboardState());
      expect(result.current.activityCollapsed).toBe(false);
      act(() => { result.current.setActivityCollapsed(true); });
      expect(result.current.activityCollapsed).toBe(true);
    });
  });
});
