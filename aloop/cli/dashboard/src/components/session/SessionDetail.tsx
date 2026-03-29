import { useMemo } from 'react';
import { marked } from 'marked';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { MainPanel } from '@/components/layout/MainPanel';
import type { ArtifactManifest } from '@/lib/types';

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

export function SessionDetail(props: SessionDetailProps) {
  return <MainPanel {...props} />;
}