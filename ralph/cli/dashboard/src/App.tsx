import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const navItems = ['Progress', 'Docs', 'Log', 'Steer', 'Stop'] as const;
type NavItem = (typeof navItems)[number];

export function App() {
  const [activeView, setActiveView] = useState<NavItem>('Progress');
  const sessions = useMemo(
    () => [
      { id: 'sess-72d0', name: 'feature/dashboard-sse', status: 'running', elapsed: '08m', iterations: 2 },
      { id: 'sess-a9f3', name: 'fix/setup-discovery', status: 'complete', elapsed: '27m', iterations: 5 },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Aloop Dashboard</h1>
      </header>
      <main className="grid min-h-[calc(100vh-73px)] grid-cols-1 gap-4 p-4 md:grid-cols-[1.1fr_180px_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Active and recent loop sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-md border p-3">
                <p className="font-medium">{session.name}</p>
                <p className="text-sm text-muted-foreground">
                  {session.status} • {session.elapsed} • iter {session.iterations}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Views</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {navItems.map((item) => (
              <Button
                key={item}
                variant={activeView === item ? 'default' : 'ghost'}
                className="justify-start"
                onClick={() => setActiveView(item)}
              >
                {item}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{activeView}</CardTitle>
            <CardDescription>Live panel content for the selected dashboard section.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeView === 'Progress' && <ProgressView />}
            {activeView === 'Docs' && <DocsView />}
            {activeView === 'Log' && <LogView />}
            {activeView === 'Steer' && <SteerView />}
            {activeView === 'Stop' && <StopView />}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ProgressView() {
  return (
    <Tabs defaultValue="timeline">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="space-y-2">
        <p className="text-sm">Iteration 2 running: implementing dashboard frontend workspace.</p>
        <p className="text-sm text-muted-foreground">Last update received 12s ago.</p>
      </TabsContent>
      <TabsContent value="summary" className="space-y-2">
        <p className="text-sm">Plan: complete</p>
        <p className="text-sm">Build: in progress</p>
      </TabsContent>
    </Tabs>
  );
}

function DocsView() {
  return (
    <div className="space-y-2">
      <p className="text-sm">Document viewer placeholder for TODO.md, SPEC.md, and session docs.</p>
      <pre className="rounded-md bg-muted p-3 text-xs"># TODO.md{'\n'}- [ ] Implement dashboard server SSE transport</pre>
    </div>
  );
}

function LogView() {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
      {`[12:00:00] dashboard: startup\n[12:00:02] loop: plan phase complete\n[12:00:08] loop: build phase started`}
    </pre>
  );
}

function SteerView() {
  return (
    <div className="space-y-3">
      <Textarea placeholder="Enter steering guidance to write STEERING.md..." />
      <Button>Submit steering instruction</Button>
    </div>
  );
}

function StopView() {
  return (
    <div className="space-y-3">
      <p className="text-sm">Stop the selected running session with a graceful shutdown request.</p>
      <Button variant="destructive">Stop session</Button>
    </div>
  );
}
