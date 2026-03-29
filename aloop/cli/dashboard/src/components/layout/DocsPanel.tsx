import { useEffect, useState } from 'react';
import {
  ExternalLink, Heart, MoreHorizontal,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HealthPanel } from '@/components/health/ProviderHealth';
import { DocContent } from '@/components/session/SessionDetail';
import type { ProviderHealth } from '@/components/health/ProviderHealth';

export interface DocsPanelProps {
  docs: Record<string, string>;
  providerHealth: ProviderHealth[];
  activityCollapsed?: boolean;
  repoUrl?: string | null;
}

export function DocsPanel({ docs, providerHealth, activityCollapsed, repoUrl }: DocsPanelProps) {
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