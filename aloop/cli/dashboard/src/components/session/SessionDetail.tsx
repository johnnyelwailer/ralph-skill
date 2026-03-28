import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import {
  Activity, ChevronRight, ExternalLink, FileText, Heart,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HealthPanel } from '@/components/health/ProviderHealth';
import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { ActivityPanel } from '@/components/session/ActivityPanel';
import { SteerInput } from '@/components/session/SteerInput';
import type { ArtifactManifest } from '@/lib/types';

// ── Helpers ──

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

export function DocContent({ content, name, wide }: { content: string; name: string; wide?: boolean }) {
  const isSpec = /spec/i.test(name);
  const { rendered, toc } = useMemo(() => {
    if (!content) return { rendered: '', toc: [] as Array<{ level: number; text: string; id: string }> };
    const headings: Array<{ level: number; text: string; id: string }> = [];
    const renderer = new marked.Renderer();
    renderer.heading = ({ tokens, depth }: { tokens: { raw: string }[]; depth: number }) => {
      const text = tokens.map((t) => t.raw).join('');
      const id = slugify(text);
      headings.push({ level: depth, text, id });
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    };
    const html = marked.parse(content, { gfm: true, breaks: true, renderer }) as string;
    return { rendered: html, toc: headings };
  }, [content]);
  if (!content) return <p className="text-xs text-muted-foreground p-3">No content for {name}.</p>;
  const minLevel = toc.length > 0 ? Math.min(...toc.map((h) => h.level)) : 1;
  const hasToc = isSpec && toc.length > 0;
  const tocNav = hasToc ? (
    <nav className="space-y-0.5 text-[11px]">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Table of Contents</span>
      {toc.map((h) => (
        <a key={h.id} href={`#${h.id}`} className="block text-muted-foreground hover:text-foreground transition-colors truncate" style={{ paddingLeft: `${(h.level - minLevel) * 12}px` }}>
          {h.text}
        </a>
      ))}
    </nav>
  ) : null;

  if (wide && hasToc) {
    return (
      <div className="grid h-full" style={{ gridTemplateColumns: 'minmax(160px, 220px) 1fr' }}>
        <div className="border-r border-border overflow-y-auto p-3 pr-2">
          {tocNav}
        </div>
        <ScrollArea className="h-full">
          <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
        </ScrollArea>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {hasToc && (
        <div className="p-3 pb-0">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium uppercase tracking-wider">
              <ChevronRight className="h-3 w-3 collapsible-chevron" /> Table of Contents
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 mb-2 border-l-2 border-border pl-2">
                {tocNav}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
    </ScrollArea>
  );
}

function DocsPanel({ docs, providerHealth, activityCollapsed, repoUrl }: {
  docs: Record<string, string>;
  providerHealth: ProviderHealth[];
  activityCollapsed?: boolean;
  repoUrl?: string | null;
}) {
  const docOrder = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
  const tabLabels: Record<string, string> = { 'TODO.md': 'TODO', 'SPEC.md': 'SPEC', 'RESEARCH.md': 'RESEARCH', 'REVIEW_LOG.md': 'REVIEW LOG', 'STEERING.md': 'STEERING' };

  const availableDocs = docOrder.filter((n) => docs[n] != null && docs[n] !== '');
  const extraDocs = Object.keys(docs).filter((n) => !docOrder.includes(n) && docs[n] != null && docs[n] !== '');
  const allDocs = [...availableDocs, ...extraDocs];

  const MAX_VISIBLE_TABS = 4;
  const visibleTabs = allDocs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = allDocs.slice(MAX_VISIBLE_TABS);

  const defaultTab = allDocs.includes('TODO.md') ? 'TODO.md' : allDocs[0] ?? '_health';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const validTabs = [...allDocs, '_health'];
    if (!validTabs.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, allDocs, defaultTab]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
      <div className="flex items-center shrink-0">
        <TabsList className="h-auto md:h-8 bg-muted/50 flex-nowrap sm:flex-wrap justify-start flex-1 overflow-x-auto whitespace-nowrap">
          {visibleTabs.map((n) => (
            <TabsTrigger key={n} value={n} className="text-[10px] sm:text-[11px] px-2 py-1 md:h-6 data-[state=active]:bg-background">
              {tabLabels[n] ?? n.replace(/\.md$/i, '')}
            </TabsTrigger>
          ))}
          <TabsTrigger value="_health" className="text-[10px] sm:text-[11px] px-2 py-1 md:h-6 data-[state=active]:bg-background">
            <Heart className="h-3 w-3 mr-1" /> Health
          </TabsTrigger>
          {overflowTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="px-2 py-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label="Open overflow document tabs"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px] p-1">
                {overflowTabs.map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onSelect={() => setActiveTab(n)}
                    className="w-full cursor-pointer text-left text-[11px] px-3 py-1.5"
                  >
                    {tabLabels[n] ?? n.replace(/\.md$/i, '')}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TabsList>
        {repoUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={repoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open repo on GitHub" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-6 md:w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors ml-1 shrink-0">
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent><p>Open repo on GitHub</p></TooltipContent>
          </Tooltip>
        )}
      </div>
      {allDocs.map((n) => (
        <TabsContent key={n} value={n} className="flex-1 min-h-0 mt-0">
          <DocContent content={docs[n] ?? ''} name={n} wide={activityCollapsed} />
        </TabsContent>
      ))}
      <TabsContent value="_health" className="flex-1 min-h-0 mt-0">
        <HealthPanel providers={providerHealth} />
      </TabsContent>
    </Tabs>
  );
}

// ── SessionDetail ──

export interface SessionDetailProps {
  docs: Record<string, string>;
  log: string;
  artifacts: ArtifactManifest[];
  repoUrl?: string | null;
  providerHealth: ProviderHealth[];
  activePanel: 'docs' | 'activity';
  setActivePanel: (v: 'docs' | 'activity') => void;
  activityCollapsed: boolean;
  setActivityCollapsed: (v: boolean) => void;
  currentIterationNum: number | null;
  currentPhase: string;
  currentProvider: string;
  isRunning: boolean;
  iterationStartedAt: string;
  steerInstruction: string;
  setSteerInstruction: (v: string) => void;
  onSteer: () => void;
  steerSubmitting: boolean;
  onStop: (force: boolean) => void;
  stopSubmitting: boolean;
  onResume: () => void;
  resumeSubmitting: boolean;
}

export function SessionDetail({
  docs, log, artifacts, repoUrl, providerHealth,
  activePanel, setActivePanel, activityCollapsed, setActivityCollapsed,
  currentIterationNum, currentPhase, currentProvider, isRunning, iterationStartedAt,
  steerInstruction, setSteerInstruction, onSteer, steerSubmitting,
  onStop, stopSubmitting, onResume, resumeSubmitting,
}: SessionDetailProps) {
  const docsPanel = (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'docs' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <DocsPanel docs={docs} providerHealth={providerHealth} activityCollapsed={activityCollapsed} repoUrl={repoUrl} />
      </CardContent>
    </Card>
  );

  const activityPanel = activityCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={`shrink-0 flex-col items-center gap-1 px-1 py-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground transition-colors hidden lg:flex ${activePanel !== 'activity' ? 'hidden lg:flex' : 'flex'}`} onClick={() => setActivityCollapsed(false)}>
          <PanelLeftOpen className="h-4 w-4" />
          <span className="text-[9px] uppercase tracking-wider font-medium [writing-mode:vertical-lr]">Activity</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left"><p>Show activity panel</p></TooltipContent>
    </Tooltip>
  ) : (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'activity' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> Activity</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Collapse activity panel" className="text-muted-foreground hover:text-foreground transition-colors hidden lg:block min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center" onClick={() => setActivityCollapsed(true)}>
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Collapse activity panel</p></TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <ActivityPanel
          log={log}
          artifacts={artifacts}
          currentIteration={isRunning ? currentIterationNum : null}
          currentPhase={currentPhase}
          currentProvider={currentProvider}
          isRunning={isRunning}
          iterationStartedAt={iterationStartedAt}
        />
      </CardContent>
    </Card>
  );

  return (
    <>
      {/* Mobile panel toggle */}
      <div className="lg:hidden flex border-b border-border shrink-0">
        <button
          type="button"
          className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'docs' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActivePanel('docs')}
        >
          <FileText className="h-3.5 w-3.5 inline mr-1" />Documents
        </button>
        <button
          type="button"
          className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'activity' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActivePanel('activity')}
        >
          <Activity className="h-3.5 w-3.5 inline mr-1" />Activity
        </button>
      </div>
      <main className="flex-1 min-h-0 p-2 md:p-3">
        <div className="flex gap-3 h-full">
          {docsPanel}
          {activityPanel}
        </div>
      </main>
      <SteerInput
        steerInstruction={steerInstruction}
        setSteerInstruction={setSteerInstruction}
        onSteer={onSteer}
        steerSubmitting={steerSubmitting}
        onStop={onStop}
        stopSubmitting={stopSubmitting}
        onResume={onResume}
        resumeSubmitting={resumeSubmitting}
        isRunning={isRunning}
      />
    </>
  );
}
