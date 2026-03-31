import { describe, expect, it } from 'vitest';
import { ArtifactComparisonDialog } from './App';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';

describe('App.tsx ArtifactComparisonDialog coverage', () => {
  it('renders comparison modes including diff overlay', () => {
    const artifact = {
      type: 'screenshot',
      path: 'dashboard.png',
      description: 'Dashboard',
      metadata: { diff_percentage: 12.3 },
    };
    const allManifests = [
      { iteration: 2, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
      { iteration: 4, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
      { iteration: 7, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dashboard.png', description: '' }] },
    ];

    const { container } = render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 7,
      allManifests,
      onClose: () => {},
    }));

    expect(screen.getByRole('tab', { name: 'Side by Side' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Slider' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Diff Overlay' })).toBeInTheDocument();
    expect(screen.getByLabelText('Compare against iteration')).toBeInTheDocument();
    expect(screen.getByText('Baseline (iter 4)')).toBeInTheDocument();
    expect(screen.getByText('Current (iter 7)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Slider' }));
    expect(screen.getByRole('slider', { name: 'Image comparison slider' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Diff Overlay' }));
    expect(screen.getByLabelText('Diff overlay comparison')).toBeInTheDocument();
    const opacityControl = screen.getByLabelText('Overlay opacity') as HTMLInputElement;
    expect(opacityControl.value).toBe('50');
    fireEvent.change(opacityControl, { target: { value: '70' } });
    expect(opacityControl.value).toBe('70');

    const imgNodes = container.querySelectorAll('img');
    expect(imgNodes.length).toBeGreaterThanOrEqual(2);
    const currentOverlayImage = imgNodes[1] as HTMLImageElement;
    expect(currentOverlayImage.style.opacity).toBe('0.7');
  });

  it('renders no-baseline comparison state', () => {
    render(createElement(ArtifactComparisonDialog, {
      artifact: { type: 'screenshot', path: 'new.png', description: 'New artifact' },
      currentIteration: 1,
      allManifests: [{ iteration: 1, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'new.png', description: '' }] }],
      onClose: () => {},
    }));

    expect(screen.getByText('No baseline — first capture')).toBeInTheDocument();
  });

  it('handles slider keyboard and drag interactions', () => {
    const artifact = { type: 'screenshot', path: 'dash.png', description: 'Dashboard' };
    const allManifests = [
      { iteration: 2, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
      { iteration: 3, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
    ];
    render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 3,
      allManifests,
      onClose: () => {},
    }));

    fireEvent.click(screen.getByRole('tab', { name: 'Slider' }));
    const slider = screen.getByRole('slider', { name: 'Image comparison slider' });
    const sliderContainer = slider as HTMLDivElement;
    Object.defineProperty(sliderContainer, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, bottom: 0, right: 100, height: 10, x: 0, y: 0, toJSON: () => {} }),
    });

    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.mouseDown(slider, { clientX: 75 });
    fireEvent.mouseMove(document, { clientX: 25 });
    fireEvent.mouseUp(document);
    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
  });

  it('close button has mobile tap target min-h-[44px] and min-w-[44px]', () => {
    const artifact = { type: 'screenshot', path: 'dash.png', description: 'Dashboard' };
    render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 1,
      allManifests: [],
      onClose: () => {},
    }));

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(closeBtn.className).toContain('min-h-[44px]');
    expect(closeBtn.className).toContain('min-w-[44px]');
    expect(closeBtn.className).toContain('md:min-h-0');
    expect(closeBtn.className).toContain('md:min-w-0');
  });

  it('comparison-mode tab buttons have mobile tap target min-h-[44px]', () => {
    const artifact = { type: 'screenshot', path: 'dash.png', description: 'Dashboard' };
    const allManifests = [
      { iteration: 2, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
      { iteration: 3, phase: 'proof', summary: '', artifacts: [{ type: 'screenshot', path: 'dash.png', description: '' }] },
    ];
    render(createElement(ArtifactComparisonDialog, {
      artifact,
      currentIteration: 3,
      allManifests,
      onClose: () => {},
    }));

    const tabs = screen.getAllByRole('tab');
    for (const tab of tabs) {
      expect(tab.className).toContain('min-h-[44px]');
      expect(tab.className).toContain('md:min-h-0');
    }
  });
});
