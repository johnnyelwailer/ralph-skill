import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageLightbox } from './ImageLightbox';

describe('ImageLightbox', () => {
  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="/img/test.png" alt="test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay div is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="/img/test.png" alt="test" onClose={onClose} />);
    const overlay = screen.getByRole('img').parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when a non-Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="/img/test.png" alt="test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose when img itself is clicked (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="/img/test.png" alt="test" onClose={onClose} />);
    const img = screen.getByRole('img');
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });
});
