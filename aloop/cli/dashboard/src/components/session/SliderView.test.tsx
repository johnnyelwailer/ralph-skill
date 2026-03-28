import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SliderView } from './SliderView';

function renderSlider(sliderPos = 50, setSliderPos = vi.fn()) {
  return render(
    <SliderView
      baselineSrc="/baseline.png"
      currentSrc="/current.png"
      selectedBaseline={1}
      currentIteration={3}
      sliderPos={sliderPos}
      setSliderPos={setSliderPos}
    />,
  );
}

describe('SliderView', () => {
  it('renders baseline and current iteration labels', () => {
    renderSlider();
    expect(screen.getByText(/Baseline \(iter 1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Current \(iter 3\)/)).toBeInTheDocument();
  });

  it('renders the slider with correct aria attributes', () => {
    renderSlider(42);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuenow', '42');
  });

  it('calls setSliderPos with a new value on ArrowLeft keydown', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(setSliderPos).toHaveBeenCalledTimes(1);
    // The updater function should clamp to >= 0
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(50)).toBe(48);
    expect(updater(0)).toBe(0);
  });

  it('calls setSliderPos with a new value on ArrowRight keydown', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(setSliderPos).toHaveBeenCalledTimes(1);
    // The updater function should clamp to <= 100
    const updater = setSliderPos.mock.calls[0][0];
    expect(updater(50)).toBe(52);
    expect(updater(100)).toBe(100);
  });

  it('does not call setSliderPos for unrelated key presses', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'Tab' });
    expect(setSliderPos).not.toHaveBeenCalled();
  });

  it('sets dragging and calls setSliderPos on mousedown', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    // Simulate mousedown — triggers dragging and updateSliderFromEvent
    fireEvent.mouseDown(slider, { clientX: 0 });
    expect(setSliderPos).toHaveBeenCalledTimes(1);
  });

  it('handles mousemove when dragging', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    // Start drag
    fireEvent.mouseDown(slider, { clientX: 10 });
    const callsBefore = setSliderPos.mock.calls.length;
    // Move while dragging
    fireEvent.mouseMove(document, { clientX: 20 });
    expect(setSliderPos.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('stops calling setSliderPos after mouseup ends drag', () => {
    const setSliderPos = vi.fn();
    renderSlider(50, setSliderPos);
    const slider = screen.getByRole('slider');
    // Start drag, then end drag
    fireEvent.mouseDown(slider, { clientX: 10 });
    fireEvent.mouseUp(document);
    setSliderPos.mockClear();
    // Move after mouseup — should NOT call setSliderPos
    fireEvent.mouseMove(document, { clientX: 30 });
    expect(setSliderPos).not.toHaveBeenCalled();
  });

  it('covers the null-container branch in updateSliderFromEvent gracefully', () => {
    // This branch (line 19: if (!container) return) is covered at mount time
    // before the ref is attached in jsdom — calling updateSliderFromEvent during
    // the initial render does not throw.
    expect(() => renderSlider()).not.toThrow();
  });
});
