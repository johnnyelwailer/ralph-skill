import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { ChevronRight, ExternalLink, Heart, MoreHorizontal, Circle, Pause, XCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { relativeTime } from '@/lib/formatters';
import { slugify } from '@/lib/log';
import type { ProviderHealth } from '@/lib/log';

export function DocsPanel({ docs, providerHealth, activityCollapsed, repoUrl }: { docs: Record<string, string>; providerHealth: ProviderHealth[]; activityCollapsed?: boolean; repoUrl?: string | null }) {
  const docOrder = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
  const tabLabels: Record<string, string> = { 'TODO.md': 'TODO', 'SPEC.md': 'SPEC', 'RESEARCH.md': 'RESEARCH', 'REVIEW_LOG.md': 'REVIEW LOG', 'STEERING.md': 'STEERING' };

  const availableDocs = docOrder.filter((n) => docs[n] != null && docs[n] !== '');
  const extraDocs = Object.keys(docs).filter((n) => !docOrder.includes(n) && docs[n] != null && docs[n] !== '');
  const allDocs = [...availableDocs, ...extraDocs];

  const MAX_VISIBLE_TABS = 4;
  const visibleTabs = allDocs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = allDocs.slice(MAX_VISIBLE_TABS);

  // Always add Health as a special tab
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

  // Wide mode: TOC as sticky sidebar, doc as main content
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

  // Normal mode: collapsible TOC above doc
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

export function HealthPanel({ providers }: { providers: ProviderHealth[] }) {
  if (providers.length === 0) {
    return <p className="text-xs text-muted-foreground p-3">No provider data yet.</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {providers.map((p) => (
          <Tooltip key={p.name}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent/30 cursor-default">
                {p.status === 'healthy' && <Circle className="h-3 w-3 text-green-500 fill-green-500" />}
                {p.status === 'cooldown' && <Pause className="h-3 w-3 text-orange-500" />}
                {p.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                {p.status === 'unknown' && <Circle className="h-3 w-3 text-muted-foreground" />}
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground ml-auto">
                  {p.status === 'cooldown' && p.cooldownUntil ? (() => {
                    const remaining = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000));
                    if (remaining <= 0) return 'cooldown ending…';
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    return `cooldown for ${h > 0 ? `${h}h ` : ''}${m}min`;
                  })() : p.status === 'unknown' ? 'no activity' : p.status}
                </span>
                <span className="text-muted-foreground text-[10px]">{relativeTime(p.lastEvent)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                <p>Provider: {p.name}</p>
                <p>Status: {p.status}</p>
                {p.reason && <p>Reason: {p.reason}</p>}
                {p.consecutiveFailures && <p>Failures: {p.consecutiveFailures}</p>}
                {p.cooldownUntil && <p>Cooldown until: {new Date(p.cooldownUntil).toLocaleTimeString()} ({(() => { const r = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000)); const h = Math.floor(r / 3600); const m = Math.floor((r % 3600) / 60); return r <= 0 ? 'ending' : `${h > 0 ? `${h}h ` : ''}${m}min left`; })()})</p>}
                {p.lastEvent && <p>Last event: {new Date(p.lastEvent).toLocaleString()}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </ScrollArea>
  );
}
