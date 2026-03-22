import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  App,
  ArtifactComparisonDialog,
  artifactUrl,
  computeAvgDuration,
  deriveProviderHealth,
  extractIterationUsage,
  extractModelFromOutput,
  formatDateKey,
  formatDuration,
  formatSecs,
  formatTime,
  formatTimeShort,
  formatTokenCount,
  isImageArtifact,
  isRecord,
  numStr,
  parseAnsiSegments,
  parseDurationSeconds,
  parseLogLine,
  parseManifest,
  relativeTime,
  renderAnsiToHtml,
  rgbStr,
  slugify,
  str,
  stripAnsi,
  toSession,
  Sidebar,
  ActivityPanel,
  DocContent,
  HealthPanel,
} from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { TooltipProvider } from './components/ui/tooltip';

describe('App.tsx helper coverage', () => {
  it('covers ansi helpers', () => {
    expect(stripAnsi('\u001b[31merror\u001b[0m ok')).toBe('error ok');
    expect(rgbStr(1, 2, 3)).toBe('1,2,3');

    const segments = parseAnsiSegments('a\u001b[1;31mB\u001b[22;39mC');
    expect(segments.length).toBe(3);
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();

    const html = renderAnsiToHtml('**x**');
    expect(html).toContain('<strong>x</strong>');

    const styledHtml = renderAnsiToHtml('\u001b[3;4mmd\u001b[0m');
    expect(styledHtml).toContain('font-style:italic');
    expect(styledHtml).toContain('text-decoration:underline');
  });

  it('covers additional ansi and parser edge branches', () => {
    const segments = parseAnsiSegments(
      'A\u001b[2;3;4;90;100mB\u001b[21;22;23;24;39;49mC\u001b[38;5;300mD\u001b[48;2;999;2;3mE\u001b[0mF',
    );
    expect(segments.length).toBeGreaterThan(2);
    expect(segments[1].style.faint).toBe(true);
    expect(segments[1].style.italic).toBe(true);
    expect(segments[1].style.underline).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();
    expect(segments[1].style.bg).toBeTruthy();

    const resetSeg = segments.find((s) => s.text === 'C');
    expect(resetSeg?.style.fg).toBeUndefined();
    expect(resetSeg?.style.bg).toBeUndefined();
    expect(resetSeg?.style.italic).toBe(false);
    expect(resetSeg?.style.underline).toBe(false);

    const noStyled = renderAnsiToHtml('\u001b[0mplain', { gfm: false, breaks: false });
    expect(noStyled).toContain('plain');
  });

  it('covers truecolor and 256-color ansi branches', () => {
    const out = parseAnsiSegments('\u001b[38;5;200mX\u001b[48;2;1;2;3mY\u001b[0m');
    expect(out[1].style.fg).toBeTruthy();
    expect(out[1].style.bg).toBe('1,2,3');
  });

  it('covers record/string/number extraction helpers', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);

    expect(str({ a: ' ', b: 'x' }, ['a', 'b'])).toBe('x');
    expect(str({}, ['a'], 'fb')).toBe('fb');

    expect(numStr({ a: Number.POSITIVE_INFINITY, b: ' 42 ' }, ['a', 'b'])).toBe('42');
    expect(numStr({ a: 5 }, ['a'])).toBe('5');
    expect(numStr({}, ['a'], 'n/a')).toBe('n/a');
  });

  it('covers toSession fallbacks', () => {
    const s = toSession({ status: 'running', iteration: 2, stuck_count: 3 }, 'proj-12', true);
    expect(s.id).toBe('proj-12');
    expect(s.projectName).toBe('proj');
    expect(s.status).toBe('running');
    expect(s.iterations).toBe('2');
    expect(s.stuckCount).toBe(3);
    expect(s.isActive).toBe(true);
  });

  it('covers date/time formatting', () => {
    expect(formatTime('')).toBe('');
    expect(formatTimeShort('')).toBe('');

    expect(formatSecs(10)).toBe('10s');
    expect(formatSecs(65)).toBe('1m 5s');
    expect(formatSecs(120)).toBe('2m');

    expect(formatDuration('61s')).toBe('1m 1s');
    expect(formatDuration('n/a')).toBe('n/a');

    expect(formatDateKey('')).toBe('Unknown');
  });

  it('covers relativeTime branches', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 20_000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 8 * 60_000).toISOString())).toBe('8m ago');
    expect(relativeTime(new Date(now - 2 * 60 * 60_000).toISOString())).toBe('2h ago');
    expect(relativeTime(new Date(now - 3 * 24 * 60 * 60_000).toISOString())).toBe('3d ago');
    expect(relativeTime('')).toBe('');
  });

  it('covers parseLogLine json and plain text branches', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-14T10:30:00Z',
      event: 'iteration_error',
      phase: 'build',
      provider: 'claude',
      model: 'sonnet',
      duration: '45s',
      iteration: '7',
      error: 'boom',
      files_changed: [{ file: 'a.ts', status: 'modified', additions: 1, deletions: 2 }],
      message: '\u001b[31mfailed\u001b[0m',
    });
    const parsed = parseLogLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.iteration).toBe(7);
    expect(parsed?.isError).toBe(true);
    expect(parsed?.message).toBe('failed');
    expect(parsed?.filesChanged[0]).toMatchObject({ path: 'a.ts', type: 'M' });
    expect(parsed?.resultDetail).toBe('boom');

    const verdict = parseLogLine(JSON.stringify({ event: 'review_verdict_read', verdict: 'reject' }));
    expect(verdict?.resultDetail).toBe('reject');

    const commit = parseLogLine(JSON.stringify({ event: 'iteration_complete', commit: 'abcdef12345' }));
    expect(commit?.resultDetail).toBe('abcdef1');

    const text = parseLogLine('\u001b[31mstderr\u001b[0m');
    expect(text?.isSignificant).toBe(false);
    expect(text?.message).toBe('stderr');

    expect(parseLogLine('   ')).toBeNull();
  });

  it('covers log parsing and provider health edge branches', () => {
    const parsed = parseLogLine(JSON.stringify({
      type: 'iteration_complete',
      iteration: 'not-a-number',
      files: [{ status: 1 }, 'skip'],
    }));
    expect(parsed?.event).toBe('iteration_complete');
    expect(parsed?.iteration).toBeNull();
    expect(parsed?.filesChanged[0]).toMatchObject({ path: '?', type: 'M' });

    const avg = computeAvgDuration([
      JSON.stringify([]),
      JSON.stringify({ event: 'iteration_complete', duration: '0s' }),
      '{"bad"',
    ].join('\n'));
    expect(avg).toBe('');

    const health = deriveProviderHealth([
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', timestamp: '2026-03-19T10:00:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'codex', timestamp: '2026-03-19T10:01:00Z' }),
      JSON.stringify({ event: 'iteration_error', provider: '', timestamp: '2026-03-19T10:02:00Z' }),
    ].join('\n'));
    expect(health.find((h) => h.name === 'codex')?.status).toBe('cooldown');
  });

  it('covers duration parsing and average computation', () => {
    expect(parseDurationSeconds('50ms')).toBe(0.05);
    expect(parseDurationSeconds('2.5s')).toBe(2.5);
    expect(parseDurationSeconds('1m 1.5s')).toBe(61.5);
    expect(parseDurationSeconds('42')).toBe(42);
    expect(parseDurationSeconds('x')).toBeNull();

    const log = [
      JSON.stringify({ event: 'iteration_complete', duration: '30s' }),
      JSON.stringify({ event: 'iteration_complete', elapsed: '90s' }),
      JSON.stringify({ event: 'iteration_complete', took: '0s' }),
      JSON.stringify({ event: 'other', duration: '999s' }),
      'not-json',
    ].join('\n');
    expect(computeAvgDuration(log)).toBe('1m');
    expect(computeAvgDuration('')).toBe('');
  });

  it('covers provider health derivation branches', () => {
    const log = [
      JSON.stringify({ event: 'provider_cooldown', provider: 'codex', timestamp: '2026-03-14T10:00:00Z', reason: 'rate_limit', consecutive_failures: 2, cooldown_until: '2026-03-14T10:02:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-14T10:01:00Z' }),
      JSON.stringify({ event: 'iteration_error', provider: 'gemini', timestamp: '2026-03-14T10:03:00Z' }),
      JSON.stringify({ event: 'provider_recovered', provider: 'codex', timestamp: '2026-03-14T10:05:00Z' }),
      'bad-line',
    ].join('\n');

    const health = deriveProviderHealth(log);
    expect(health.map((h) => h.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(health.find((h) => h.name === 'codex')?.status).toBe('healthy');
    expect(health.find((h) => h.name === 'gemini')?.status).toBe('healthy');
  });

  it('covers artifact helpers and manifest parsing', () => {
    expect(isImageArtifact({ type: 'proof', path: 'img.png', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'visual_diff', path: 'noext', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'proof', path: 'notes.txt', description: '' })).toBe(false);

    expect(artifactUrl(8, 'a b.txt')).toBe('/api/artifacts/8/a%20b.txt');

    const parsed = parseManifest({
      iteration: 9,
      outputHeader: '> build · model/x',
      manifest: {
        phase: 'proof',
        summary: 'ok',
        artifacts: [
          { type: 'screenshot', path: 'screen.png', description: 'cap', metadata: { baseline: 'base.png', diff_percentage: 1.2 } },
          { bad: true },
        ],
      },
    });
    expect(parsed?.artifacts).toHaveLength(2);
    expect(parsed?.artifacts[0].metadata?.baseline).toBe('base.png');

    const fallback = parseManifest({ iteration: 10, outputHeader: '> qa · model/y', manifest: null });
    expect(fallback?.phase).toBe('proof');

    expect(parseManifest({ iteration: 11, manifest: null })).toBeNull();
  });

  it('covers model extraction and slugify', () => {
    expect(extractModelFromOutput('> build · openrouter/hunter-alpha')).toBe('openrouter/hunter-alpha');
    expect(extractModelFromOutput('line\n> qa · model/z')).toBe('model/z');
    expect(extractModelFromOutput('nope')).toBe('');
    expect(extractModelFromOutput(undefined)).toBe('');

    expect(slugify(' Hello,  World!  -- ')).toBe('-hello-world-');
  });

  it('covers extractIterationUsage', () => {
    // Returns null when rawObj is null
    expect(extractIterationUsage(null)).toBeNull();

    // Returns null when no cost_usd field
    expect(extractIterationUsage({ event: 'iteration_complete', provider: 'claude' })).toBeNull();

    // Returns null when cost_usd is 0
    expect(extractIterationUsage({ cost_usd: 0, tokens_input: 100 })).toBeNull();

    // Returns usage when cost_usd is a number
    const usage = extractIterationUsage({
      tokens_input: 15200,
      tokens_output: 3400,
      tokens_cache_read: 48000,
      cost_usd: 0.0034,
    });
    expect(usage).not.toBeNull();
    expect(usage!.tokens_input).toBe(15200);
    expect(usage!.tokens_output).toBe(3400);
    expect(usage!.tokens_cache_read).toBe(48000);
    expect(usage!.cost_usd).toBe(0.0034);

    // Handles string cost_usd (from bash write_log_entry)
    const strUsage = extractIterationUsage({
      tokens_input: '5000',
      tokens_output: '1000',
      tokens_cache_read: '0',
      cost_usd: '0.002',
    });
    expect(strUsage).not.toBeNull();
    expect(strUsage!.tokens_input).toBe(5000);
    expect(strUsage!.cost_usd).toBe(0.002);
  });

  it('covers formatTokenCount', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(15200)).toBe('15.2k');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('renders comparison modes including diff overlay', () => {
    const artifact = {
      type: 'screenshot',
      path: 'dashboard.png',
      description: 'Dashboard',
      metadata: { diff_percentage: 12.3 },
    };
    const allManifests = [
      { iteration: 2, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
      { iteration: 4, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
      { iteration: 7, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
    ];

    const { container } = render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 7,
      allManifests,
      onClose: () => {},
    }));

    expect(screen.getByRole('tab', { name: 'Side by Side' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Slider' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Diff Overlay' })).toBeInTheDocument();
    expect(screen.getByLabelText('Compare against iteration')).toBeInTheDocument();
    expect(screen.getByText('Baseline (iter 4)')).toBeInTheDocument();
    expect(screen.getByText('Current (iter 7)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Slider' }));
    expect(screen.getByRole('slider', { name: 'Image comparison slider' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Diff Overlay' }));
    expect(screen.getByLabelText('Diff overlay comparison')).toBeInTheDocument();
    const opacityControl = screen.getByLabelText('Overlay opacity') as HTMLInputElement;
    expect(opacityControl.value).toBe('50');
    fireEvent.change(opacityControl, { target: { value: '70' } });
    expect(opacityControl.value).toBe('70');

    const imgNodes = container.querySelectorAll('img');
    expect(imgNodes.length).toBeGreaterThanOrEqual(2);
    const currentOverlayImage = imgNodes[1] as HTMLImageElement;
    expect(currentOverlayImage.style.opacity).toBe('0.7');
  });

  it('renders no-baseline comparison state', () => {
    render(createElement(ArtifactComparisonDialog, {
      artifact: { type: 'screenshot', path: 'new.png', description: 'New artifact' },
      currentIteration: 1,
      allManifests: [{ iteration: 1, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'new.png', description: '' }] }],
      onClose: () => {},
    }));

    expect(screen.getByText('No baseline — first capture')).toBeInTheDocument();
  });

  it('handles slider keyboard and drag interactions', () => {
    const artifact = { type: 'screenshot', path: 'dash.png', description: 'Dashboard' };
    const allManifests = [
      { iteration: 2, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
      { iteration: 3, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
    ];
    render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 3,
      allManifests,
      onClose: () => {},
    }));

    fireEvent.click(screen.getByRole('tab', { name: 'Slider' }));
    const slider = screen.getByRole('slider', { name: 'Image comparison slider' });
    const sliderContainer = slider as HTMLDivElement;
    Object.defineProperty(sliderContainer, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, bottom: 0, right: 100, height: 10, x: 0, y: 0, toJSON: () => {} }),
    });

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.mouseDown(slider, { clientX: 75 });
    fireEvent.mouseMove(document, { clientX: 25 });
    fireEvent.mouseUp(document);
    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
  });
});

describe('App.tsx AppView integration coverage', () => {
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

  const baseState = {
    sessionDir: '/tmp/session',
    workdir: '/tmp/workdir',
    runtimeDir: '/tmp/runtime',
    updatedAt: '2026-03-19T12:00:00.000Z',
    status: {
      state: 'running',
      phase: 'build',
      iteration: 3,
      provider: 'claude',
      model: 'sonnet',
      started_at: '2026-03-19T11:58:00.000Z',
    },
    log: `${JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-19T12:00:00.000Z', duration: '30s' })}\n`,
    docs: {
      'TODO.md': '- [x] done\n- [ ] todo',
      'SPEC.md': '# Spec',
    },
    activeSessions: [{ session_id: 'sess-1', project_name: 'proj', state: 'running', phase: 'build', iteration: 3 }],
    recentSessions: [],
    artifacts: [],
    repoUrl: null,
  };

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses yellow QA badge styling for 50-79% coverage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        return new Response(JSON.stringify({
          coverage_percent: 55,
          total_features: 2,
          tested_features: 1,
          passed: 1,
          failed: 0,
          untested: 1,
          available: true,
          features: [
            { feature: 'Login', component: 'auth', last_tested: '2026-03-20', commit: 'abc1234', status: 'PASS', criteria_met: '2/2', notes: '' },
            { feature: 'Export', component: 'reporting', last_tested: '', commit: '', status: 'UNTESTED', criteria_met: '', notes: 'pending' },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    const badge = await screen.findByRole('button', { name: /qa 55%/i });
    expect(badge.className).toContain('border-yellow-500/40');
  });

  it('renders structured QA feature statuses in expanded badge view', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        return new Response(JSON.stringify({
          coverage_percent: 67,
          total_features: 3,
          tested_features: 2,
          passed: 1,
          failed: 1,
          untested: 1,
          available: true,
          features: [
            { feature: 'Login', component: 'auth', last_tested: '2026-03-20', commit: 'abc1234', status: 'PASS', criteria_met: '2/2', notes: '' },
            { feature: 'Dashboard health', component: 'dashboard', last_tested: '2026-03-20', commit: 'def5678', status: 'FAIL', criteria_met: '1/2', notes: 'missing empty state' },
            { feature: 'Export', component: 'reporting', last_tested: '', commit: '', status: 'UNTESTED', criteria_met: '', notes: 'pending' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    const badge = await screen.findByRole('button', { name: /qa 67%/i });
    fireEvent.click(badge);

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Dashboard health')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAIL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNTESTED').length).toBeGreaterThan(0);
  });

  it('refreshes QA coverage only for iteration_complete events in qa phase', async () => {
    let qaCoverageCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.startsWith('/api/qa-coverage')) {
        qaCoverageCalls += 1;
        return new Response(JSON.stringify({
          coverage_percent: 55,
          total_features: 2,
          tested_features: 1,
          passed: 1,
          failed: 0,
          untested: 1,
          available: true,
          features: [],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /qa 55%/i });
    expect(qaCoverageCalls).toBe(1);

    const sse = MockEventSource.instances[0];
    expect(sse).toBeTruthy();

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:10.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'build', provider: 'claude', timestamp: '2026-03-19T12:00:10.000Z' })}\n`,
    });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(qaCoverageCalls).toBe(1);

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:20.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'qa', provider: 'claude', timestamp: '2026-03-19T12:00:20.000Z', iteration: 9 })}\n`,
    });
    await waitFor(() => expect(qaCoverageCalls).toBe(2));

    sse.emit('state', {
      ...baseState,
      updatedAt: '2026-03-19T12:00:30.000Z',
      log: `${JSON.stringify({ event: 'iteration_complete', phase: 'review', provider: 'claude', timestamp: '2026-03-19T12:00:30.000Z' })}\n`,
    });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(qaCoverageCalls).toBe(2);
  });

  it('renders app and supports steer + stop + command stop', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(baseState), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/steer') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/stop') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify({ signal: body.force ? 'SIGKILL' : 'SIGTERM' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    const steerInput = screen.getByPlaceholderText('Steer...');
    expect(steerInput).toHaveClass('min-h-[44px]');
    expect(steerInput).toHaveClass('md:min-h-[32px]');
    expect(steerInput).toHaveClass('h-auto');
    expect(steerInput).toHaveClass('md:h-8');

    fireEvent.change(screen.getByPlaceholderText('Steer...'), { target: { value: 'Adjust scope' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/steer', expect.any(Object));
    });

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByText('Stop session (graceful)'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stop', expect.objectContaining({ method: 'POST' }));
    });

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByText('Force stop (SIGKILL)'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stop', expect.objectContaining({
        body: JSON.stringify({ force: true }),
      }));
    });
  });

  it('shows resume path and handles state-load error/disconnect', async () => {
    let stateCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        stateCalls += 1;
        if (stateCalls === 1) {
          return new Response(JSON.stringify({ ...baseState, status: { ...baseState.status, state: 'stopped' } }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('fail', { status: 500 });
      }
      if (url === '/api/resume') {
        return new Response(JSON.stringify({ pid: 1234 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(createElement(App));
    await screen.findByRole('button', { name: /resume/i });

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/resume', expect.any(Object));
    });

    const sse = MockEventSource.instances[0];
    expect(sse).toBeTruthy();
    sse.emit('state', { ...baseState, updatedAt: '2026-03-19T12:00:10.000Z' });
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    sse.onerror?.();
    await waitFor(() => expect(screen.getByText('Disconnected')).toBeInTheDocument());
    unmount();
  });

  it('covers panel toggles, sidebar shortcut, and session switching', async () => {
    const state = {
      ...baseState,
      activeSessions: [{ session_id: 'sess-1', project_name: 'proj', state: 'running', phase: 'build', iteration: 3 }],
      recentSessions: [{ session_id: 'sess-2', project_name: 'proj', state: 'stopped', phase: 'review', iteration: 9 }],
      repoUrl: 'https://example.com/repo',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(createElement(App));
    await screen.findByRole('button', { name: /stop/i });

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });

    fireEvent.click(screen.getByRole('button', { name: /^activity$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^documents$/i }));

    const collapseBtn = container.querySelector('button .lucide-panel-left-close')?.closest('button') as HTMLButtonElement | null;
    expect(collapseBtn).not.toBeNull();
    fireEvent.click(collapseBtn!);
    const expandBtn = container.querySelector('button .lucide-panel-left-open')?.closest('button') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    fireEvent.click(expandBtn!);

    const mobileMenuBtn = container.querySelector('button .lucide-menu')?.closest('button') as HTMLButtonElement | null;
    expect(mobileMenuBtn).not.toBeNull();
    fireEvent.click(mobileMenuBtn!);
    const mobileOverlay = container.querySelector('.fixed.inset-0.z-40') as HTMLDivElement | null;
    expect(mobileOverlay).not.toBeNull();
    fireEvent.click(mobileOverlay!);

    fireEvent.click(screen.getAllByText('sess-1')[0]);
    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith('/api/state?session=sess-1', expect.any(Object));
    });
  });

  it('covers older-session grouping and docs overflow branches', async () => {
    const state = {
      ...baseState,
      status: null,
      activeSessions: [],
      recentSessions: [
        {
          session_id: 'old-1',
          project_name: 'legacy',
          state: 'exited',
          phase: 'review',
          iteration: 12,
          started_at: '2020-01-01T00:00:00.000Z',
          ended_at: '2020-01-01T01:00:00.000Z',
        },
      ],
      docs: {
        'TODO.md': '# TODO',
        'SPEC.md': '# SPEC',
        'RESEARCH.md': '# RESEARCH',
        'REVIEW_LOG.md': '# REVIEW',
        'STEERING.md': '# STEER',
        'EXTRA.md': '# EXTRA DOC CONTENT',
      },
      repoUrl: 'https://example.com/repo',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/state')) {
        return new Response(JSON.stringify(state), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(createElement(App));
    await screen.findByText('Older');
    fireEvent.click(screen.getByText('Older'));

    const repoLink = screen.getByRole('link', { name: /open repo on github/i });
    expect(repoLink).not.toBeNull();

    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    const collapsedSessionBtn = container.querySelector('aside .mt-3 button');
    expect(collapsedSessionBtn).not.toBeNull();
    fireEvent.click(collapsedSessionBtn!);
    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalled();
    });

    fireEvent.pointerDown(screen.getByRole('button', { name: /open overflow document tabs/i }));
    fireEvent.click(await screen.findByText('STEERING'));
    await screen.findByRole('heading', { name: 'STEER' });

    fireEvent.pointerDown(screen.getByRole('button', { name: /open overflow document tabs/i }));
    fireEvent.click(await screen.findByText('EXTRA'));
    await screen.findByRole('heading', { name: 'EXTRA DOC CONTENT' });
  });

  it('covers Sidebar exhaustive', () => {
    const sessions = [
      { id: 's1', name: 's1', projectName: 'p1', status: 'running', phase: 'build', iteration: '1', isActive: true, branch: 'b1', startedAt: 't', endedAt: '', pid: '1', provider: 'c', workDir: 'w', stuckCount: 0 },
      { id: 's2', name: 's2', projectName: 'p1', status: 'exited', phase: 'build', iteration: '1', isActive: false, branch: 'b1', startedAt: 't', endedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), pid: '2', provider: 'c', workDir: 'w', stuckCount: 0 },
    ];
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(createElement(TooltipProvider as any, {}, createElement(Sidebar, {
      sessions: sessions as any[],
      selectedSessionId: 's1',
      onSelectSession: onSelect,
      collapsed: false,
      onToggle: onToggle,
      sessionCost: 0.1234,
    })));
    expect(screen.getByText('p1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('s1'));
    expect(onSelect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Older/i));
    expect(screen.getByText('s2')).toBeInTheDocument();
  });

  it('covers ActivityPanel and LogEntryRow exhaustive', async () => {
    const log = JSON.stringify({
      event: 'iteration_complete',
      provider: 'c',
      iteration: 1,
      timestamp: new Date().toISOString(),
      message: 'built something',
      files: [{ path: 'f1.ts', status: 'M', additions: 10, deletions: 5 }],
      metadata: { some: 'data' },
    });
    const artifacts = [{
      iteration: 1,
      manifest: {
        phase: 'build',
        artifacts: [
          { path: 'a.png', type: 'screenshot', description: 'desc' },
          { path: 'b.txt', type: 'file', description: 'desc', metadata: { diff_percentage: 10 } },
        ],
      },
    }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('build output', { status: 200 })));
    render(createElement(TooltipProvider as any, {}, createElement(ActivityPanel, {
      log,
      artifacts: artifacts as any[],
      currentIteration: 2,
      currentPhase: 'build',
      currentProvider: 'c',
      isRunning: true,
    })));
    const row = screen.getByText('built something').closest('div');
    if (row) fireEvent.click(row);
    expect(await screen.findByText('a.png')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.png'));
    fireEvent.click(screen.getByText('b.txt'));
  });

  it('covers DocContent and HealthPanel', () => {
    render(createElement(DocContent, { content: '# H1\n## H2', name: 'SPEC.md', wide: true }));
    expect(screen.getByText(/Table of Contents/i)).toBeInTheDocument();
    render(createElement(DocContent, { content: '', name: 'Empty.md' }));
    expect(screen.getByText(/No content/i)).toBeInTheDocument();
    const providers = [{ name: 'p1', status: 'cooldown', lastEvent: 't', cooldownUntil: new Date(Date.now() + 100000).toISOString() }];
    render(createElement(TooltipProvider as any, {}, createElement(HealthPanel, { providers: providers as any[] })));
    expect(screen.getByText('p1')).toBeInTheDocument();
  });
});
