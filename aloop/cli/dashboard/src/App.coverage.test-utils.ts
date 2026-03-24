export class MockEventSource {
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

export const baseState = {
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
