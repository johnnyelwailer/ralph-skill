import { useEffect, useState } from 'react';
import { Image, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  isImageArtifact,
  artifactUrl,
  findBaselineIterations,
  type ArtifactEntry,
  type ManifestPayload,
} from '../../AppView';

export { type ArtifactEntry, type ManifestPayload };

export function diffBadgeClass(pct: number): string {
  if (pct < 5) return 'bg-green-500/20 text-green-500';
  if (pct < 20) return 'bg-yellow-500/20 text-yellow-500';
  return 'bg-red-500/20 text-red-500';
}

function NonImageArtifact({ url, ext }: { url: string; ext: string }) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent('(error loading)'));
  }, [url]);
  return (
    <pre className={`language-${ext} text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-auto`}>
      {content ?? 'Loading…'}
    </pre>
  );
}

export interface ArtifactViewerProps {
  manifest: ManifestPayload;
  allManifests: ManifestPayload[];
  onLightbox: (src: string) => void;
  onComparison: (artifact: ArtifactEntry, iteration: number) => void;
}

export function ArtifactViewer({ manifest, allManifests, onLightbox, onComparison }: ArtifactViewerProps) {
  if (manifest.artifacts.length === 0) return null;
  return (
    <div className="border-l-2 border-amber-500/30 pl-2 py-1 space-y-1 mt-1">
      <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
        <Image className="h-3 w-3" />
        {manifest.artifacts.length} artifact{manifest.artifacts.length !== 1 ? 's' : ''}
      </span>
      {manifest.summary && <p className="text-muted-foreground italic text-[10px]">{manifest.summary}</p>}
      <div className="flex flex-wrap gap-2">
        {manifest.artifacts.map((a) => {
          const url = artifactUrl(manifest.iteration, a.path);
          const isImg = isImageArtifact(a);
          const hasBaseline =
            a.metadata?.baseline != null ||
            findBaselineIterations(a.path, manifest.iteration, allManifests).length > 0;
          const ext = a.path.includes('.')
            ? a.path.slice(a.path.lastIndexOf('.') + 1).toLowerCase()
            : 'txt';
          const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (hasBaseline) onComparison(a, manifest.iteration);
            else onLightbox(url);
          };
          return (
            <div key={a.path} className="flex flex-col gap-0.5">
              {isImg ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={handleClick} className="relative self-start">
                      <img
                        src={url}
                        alt={a.path}
                        className="max-w-[200px] rounded"
                        loading="lazy"
                      />
                      {a.metadata?.diff_percentage !== undefined && (
                        <span
                          className={`absolute bottom-1 right-1 text-[9px] px-1 rounded ${diffBadgeClass(a.metadata.diff_percentage)}`}
                        >
                          {a.metadata.diff_percentage.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-lg">
                    <p className="break-all">{a.path}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-start gap-1">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <span className="text-foreground/80 text-[10px] font-mono block">{a.path}</span>
                    <NonImageArtifact url={url} ext={ext} />
                  </div>
                </div>
              )}
              {a.description && (
                <span className="text-muted-foreground/60 text-[10px] truncate">{a.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
