import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostDisplay } from './CostDisplay';

describe('CostDisplay', () => {
  it('renders progress bar with expected indicator color at 50% / 75% / 95%', () => {
    const { container, rerender } = render(
      <CostDisplay totalCost={5} budgetCap={10} budgetUsedPercent={50} />,
    );
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy();

    rerender(<CostDisplay totalCost={7.5} budgetCap={10} budgetUsedPercent={75} />);
    expect(container.querySelector('.bg-yellow-500')).toBeTruthy();

    rerender(<CostDisplay totalCost={9.5} budgetCap={10} budgetUsedPercent={95} />);
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('does not render progress bar when budgetCap is null', () => {
    render(<CostDisplay totalCost={2.5} budgetCap={null} budgetUsedPercent={null} />);
    expect(screen.getByText('Spend')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows unavailable message when opencode is unavailable and no session cost', () => {
    render(
      <CostDisplay
        totalCost={null}
        budgetCap={10}
        budgetUsedPercent={null}
        error="opencode_unavailable"
        sessionCost={0}
      />,
    );
    expect(screen.getByText('Cost data unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows session fallback spend when opencode is unavailable and sessionCost is present', () => {
    const { container } = render(
      <CostDisplay
        totalCost={null}
        budgetCap={10}
        budgetUsedPercent={null}
        error="opencode_unavailable"
        sessionCost={2}
      />,
    );
    expect(screen.getByText('Session Spend')).toBeInTheDocument();
    expect(screen.getByText('$2.00 / $10.00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy();
  });

  it('shows loading state while total cost is pending', () => {
    render(
      <CostDisplay
        totalCost={null}
        budgetCap={10}
        budgetUsedPercent={0}
        isLoading
      />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows warnings and pause threshold metadata', () => {
    render(
      <CostDisplay
        totalCost={3}
        budgetCap={10}
        budgetUsedPercent={30}
        budgetWarnings={[50, 75, 90]}
        budgetPauseThreshold={95}
      />,
    );
    expect(screen.getByText('Warnings: 50% / 75% / 90% · Pause: 95%')).toBeInTheDocument();
  });

  it('renders session spend without progress bar when opencode unavailable with sessionCost but no budgetCap', () => {
    render(
      <CostDisplay
        totalCost={null}
        budgetCap={null}
        budgetUsedPercent={null}
        error="opencode_unavailable"
        sessionCost={3.5}
      />,
    );
    expect(screen.getByText('Session Spend')).toBeInTheDocument();
    expect(screen.getByText('$3.50')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows loading text when isLoading with no budgetCap', () => {
    render(
      <CostDisplay
        totalCost={null}
        budgetCap={null}
        budgetUsedPercent={null}
        isLoading
      />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders warnings without pause threshold', () => {
    render(
      <CostDisplay
        totalCost={3}
        budgetCap={10}
        budgetUsedPercent={30}
        budgetWarnings={[50, 75]}
      />,
    );
    expect(screen.getByText('Warnings: 50% / 75%')).toBeInTheDocument();
  });

  it('renders pause threshold without warnings', () => {
    render(
      <CostDisplay
        totalCost={3}
        budgetCap={10}
        budgetUsedPercent={30}
        budgetPauseThreshold={95}
      />,
    );
    expect(screen.getByText('Pause: 95%')).toBeInTheDocument();
  });
});
