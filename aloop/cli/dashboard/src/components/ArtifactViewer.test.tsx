import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ArtifactViewer, isImageArtifact, artifactUrl } from './ArtifactViewer';
import type { ArtifactEntry } from './ArtifactViewer';

// ── Helper tests ──

describe('isImageArtifact', () => {
  it('detects image extensions', () => {
    expect(isImageArtifact({ type: 'file', path: 'screenshot.png', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'file', path: 'photo.jpg', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'file', path: 'pic.JPEG', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'file', path: 'anim.gif', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'file', path: 'modern.webp', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'file', path: 'icon.svg', description: '' })).toBe(true);
  });

  it('detects screenshot and visual_diff types', () => {
    expect(isImageArtifact({ type: 'screenshot', path: 'output.bin', description: '' })).toBe(true);
    expect(isImageArtifact({ type: 'visual_diff', path: 'diff.bin', description: '' })).toBe(true);
  });

  it('rejects non-image artifacts', () => {
    expect(isImageArtifact({ type: 'file', path: 'code.ts', description: '' })).toBe(false);
    expect(isImageArtifact({ type: 'file', path: 'data.json', description: '' })).toBe(false);
  });
});

describe('artifactUrl', () => {
  it('constructs correct URL', () => {
    expect(artifactUrl(5, 'screenshot.png')).toBe('/api/artifacts/5/screenshot.png');
  });

  it('encodes special characters', () => {
    expect(artifactUrl(3, 'path with spaces.png')).toBe('/api/artifacts/3/path%20with%20spaces.png');
  });
});

// ── Component tests ──

describe('ArtifactViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders image thumbnail for image artifact', () => {
    const artifact: ArtifactEntry = { type: 'file', path: 'screenshot.png', description: 'A screenshot' };
    render(<ArtifactViewer artifact={artifact} iteration={1} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/artifacts/1/screenshot.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('alt', 'A screenshot');
  });

  it('calls onImageClick when thumbnail is clicked', () => {
    const onClick = vi.fn();
    const artifact: ArtifactEntry = { type: 'file', path: 'screenshot.png', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={2} onImageClick={onClick} />);
    fireEvent.click(screen.getByRole('img'));
    expect(onClick).toHaveBeenCalledWith('/api/artifacts/2/screenshot.png');
  });

  it('handles image load and click without callback', () => {
    const artifact: ArtifactEntry = { type: 'file', path: 'screenshot.png', description: '' };
    const { container } = render(<ArtifactViewer artifact={artifact} iteration={2} />);
    const img = screen.getByRole('img');

    expect(img).toHaveAttribute('alt', 'screenshot.png');
    expect(container.querySelector('svg.animate-spin')).toBeInTheDocument();

    fireEvent.click(img);
    fireEvent.load(img);

    expect(container.querySelector('svg.animate-spin')).not.toBeInTheDocument();
  });

  it('shows error state when image fails to load', async () => {
    const artifact: ArtifactEntry = { type: 'file', path: 'broken.png', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={1} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Failed to load image')).toBeInTheDocument();
  });

  it('fetches and renders code block for non-image artifact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('const x = 1;', { status: 200 })
    );
    const artifact: ArtifactEntry = { type: 'file', path: 'code.ts', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={3} />);

    // Initially shows loading
    expect(screen.getByText(/Loading code\.ts/)).toBeInTheDocument();

    // After fetch resolves, shows content
    await waitFor(() => {
      expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });
  });

  it('uses plaintext language class when file has no extension', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('plain text', { status: 200 })
    );
    const artifact: ArtifactEntry = { type: 'file', path: 'README', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={4} />);

    await waitFor(() => {
      expect(screen.getByText('plain text')).toBeInTheDocument();
    });

    const codeEl = screen.getByText('plain text').closest('code');
    expect(codeEl).toHaveClass('language-plaintext');
  });

  it('shows error state when code fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const artifact: ArtifactEntry = { type: 'file', path: 'code.ts', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={3} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load code\.ts/)).toBeInTheDocument();
    });
  });

  it('shows error state on non-OK HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 404 })
    );
    const artifact: ArtifactEntry = { type: 'file', path: 'missing.json', description: '' };
    render(<ArtifactViewer artifact={artifact} iteration={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load missing\.json/)).toBeInTheDocument();
    });
  });
});
