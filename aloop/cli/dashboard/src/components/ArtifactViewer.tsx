import { useCallback, useEffect, useState } from 'react';
import { Image, FileText, AlertTriangle, Loader2 } from 'lucide-react';

// ── Types ──

export interface ArtifactEntry {
  type: string;
  path: string;
  description: string;
  metadata?: { baseline?: string; diff_percentage?: number };
}

// ── Helpers ──

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

export function isImageArtifact(a: ArtifactEntry) {
  const ext = a.path.includes('.') ? a.path.slice(a.path.lastIndexOf('.')).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || a.type === 'screenshot' || a.type === 'visual_diff';
}

export function artifactUrl(iter: number, file: string) {
  return `/api/artifacts/${iter}/${encodeURIComponent(file)}`;
}

/** Derive a language class from the file extension for syntax styling. */
function langClass(path: string): string {
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '';
  const map: Record<string, string> = {
    ts: 'language-typescript', tsx: 'language-typescript',
    js: 'language-javascript', jsx: 'language-javascript',
    json: 'language-json', md: 'language-markdown',
    py: 'language-python', sh: 'language-bash', bash: 'language-bash',
    css: 'language-css', html: 'language-html', yaml: 'language-yaml',
    yml: 'language-yaml', xml: 'language-xml', sql: 'language-sql',
    rs: 'language-rust', go: 'language-go', java: 'language-java',
    rb: 'language-ruby', c: 'language-c', cpp: 'language-cpp',
    h: 'language-c', hpp: 'language-cpp',
  };
  return map[ext] || 'language-plaintext';
}

// ── Component ──

export interface ArtifactViewerProps {
  artifact: ArtifactEntry;
  iteration: number;
  /** Called when an image thumbnail is clicked. */
  onImageClick?: (src: string) => void;
}

export function ArtifactViewer({ artifact, iteration, onImageClick }: ArtifactViewerProps) {
  if (isImageArtifact(artifact)) {
    return (
      <ImageThumbnail
        artifact={artifact}
        iteration={iteration}
        onClick={onImageClick}
      />
    );
  }
  return <CodeBlock artifact={artifact} iteration={iteration} />;
}

// ── Image Thumbnail ──

function ImageThumbnail({
  artifact,
  iteration,
  onClick,
}: {
  artifact: ArtifactEntry;
  iteration: number;
  onClick?: (src: string) => void;
}) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const src = artifactUrl(iteration, artifact.path);

  const handleClick = useCallback(() => {
    if (onClick) onClick(src);
  }, [onClick, src]);

  if (error) {
    return (
      <div className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
        <AlertTriangle className="h-3 w-3" />
        <span>Failed to load image</span>
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        loading="lazy"
        src={src}
        alt={artifact.description || artifact.path}
        className="max-w-[150px] rounded border border-border cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-shadow"
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        onClick={handleClick}
      />
    </div>
  );
}

// ── Code Block ──

function CodeBlock({
  artifact,
  iteration,
}: {
  artifact: ArtifactEntry;
  iteration: number;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = artifactUrl(iteration, artifact.path);
    setLoading(true);
    setError(false);
    setContent(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [iteration, artifact.path]);

  if (loading) {
    return (
      <div className="flex items-center gap-1 rounded bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading {artifact.path}…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
        <AlertTriangle className="h-3 w-3" />
        <span>Failed to load {artifact.path}</span>
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded bg-muted/40 p-2 text-[10px] max-h-48 border border-border">
      <code className={langClass(artifact.path)}>
        {content}
      </code>
    </pre>
  );
}
