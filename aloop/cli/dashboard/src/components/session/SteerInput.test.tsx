import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SteerInput, type SteerInputProps } from './SteerInput';

function renderInput(overrides: Partial<SteerInputProps> = {}) {
  const props: SteerInputProps = {
    steerInstruction: '',
    setSteerInstruction: vi.fn(),
    onSteer: vi.fn(),
    steerSubmitting: false,
    onStop: vi.fn(),
    stopSubmitting: false,
    onResume: vi.fn(),
    resumeSubmitting: false,
    isRunning: true,
    ...overrides,
  };
  return {
    ...render(
      <TooltipProvider>
        <SteerInput {...props} />
      </TooltipProvider>,
    ),
    props,
  };
}

describe('SteerInput', () => {
  describe('stop/resume button', () => {
    it('renders Stop dropdown when isRunning is true', () => {
      renderInput({ isRunning: true });
      expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
    });

    it('does not render Resume button when isRunning is true', () => {
      renderInput({ isRunning: true });
      expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    });

    it('renders Resume button when isRunning is false', () => {
      renderInput({ isRunning: false });
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    });

    it('does not render Stop dropdown when isRunning is false', () => {
      renderInput({ isRunning: false });
      expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument();
    });
  });

  describe('Send button', () => {
    it('is disabled when steerInstruction is empty string', () => {
      renderInput({ steerInstruction: '' });
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });

    it('is disabled when steerInstruction is only whitespace', () => {
      renderInput({ steerInstruction: '   ' });
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });

    it('is enabled when steerInstruction has text', () => {
      renderInput({ steerInstruction: 'do something' });
      expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled();
    });

    it('is disabled when steerSubmitting is true', () => {
      renderInput({ steerInstruction: 'go', steerSubmitting: true });
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });
  });

  describe('keyboard', () => {
    it('calls onSteer when Enter is pressed without Shift', () => {
      const { props } = renderInput({ steerInstruction: 'run this' });
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(props.onSteer).toHaveBeenCalledTimes(1);
    });

    it('does not call onSteer when Shift+Enter is pressed', () => {
      const { props } = renderInput({ steerInstruction: 'run this' });
      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(props.onSteer).not.toHaveBeenCalled();
    });
  });

  describe('Resume interactions', () => {
    it('calls onResume when Resume button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderInput({ isRunning: false });
      await user.click(screen.getByRole('button', { name: /resume/i }));
      expect(props.onResume).toHaveBeenCalledTimes(1);
    });

    it('Resume button is disabled when resumeSubmitting is true', () => {
      renderInput({ isRunning: false, resumeSubmitting: true });
      const buttons = screen.getAllByRole('button');
      const resumeBtn = buttons.find((b) => b.querySelector('svg.lucide-play'));
      expect(resumeBtn).toBeTruthy();
      expect(resumeBtn).toBeDisabled();
    });
  });

  describe('Stop interactions', () => {
    it('calls onStop(false) when "Stop after iteration" menu item is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderInput({ isRunning: true });
      await user.click(screen.getByRole('button', { name: /stop/i }));
      // Radix portals the menu; use findByText to find rendered items
      const menuItem = await screen.findByText('Stop after iteration');
      await user.click(menuItem);
      expect(props.onStop).toHaveBeenCalledWith(false);
    });

    it('calls onStop(true) when "Kill immediately" menu item is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderInput({ isRunning: true });
      await user.click(screen.getByRole('button', { name: /stop/i }));
      const menuItem = await screen.findByText('Kill immediately');
      await user.click(menuItem);
      expect(props.onStop).toHaveBeenCalledWith(true);
    });

    it('Stop button is disabled when stopSubmitting is true', () => {
      renderInput({ isRunning: true, stopSubmitting: true });
      expect(screen.getByRole('button', { name: /stop/i })).toBeDisabled();
    });
  });
});
