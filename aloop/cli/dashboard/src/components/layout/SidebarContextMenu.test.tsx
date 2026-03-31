import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SidebarContextMenu } from './SidebarContextMenu';

const defaultProps = {
  sessionId: 'sess-001',
  position: { x: 100, y: 200 },
  onSelectSession: vi.fn(),
  onStopSession: vi.fn(),
  onCopySessionId: vi.fn(),
  onClose: vi.fn(),
};

function renderMenu(props: Partial<React.ComponentProps<typeof SidebarContextMenu>> = {}) {
  return render(<SidebarContextMenu {...defaultProps} {...props} />);
}

describe('SidebarContextMenu', () => {
  it('renders at the specified position', () => {
    renderMenu();
    const menu = screen.getByRole('menu');
    expect(menu).toHaveStyle({ left: '100px', top: '200px' });
  });

  it('renders all three action buttons', () => {
    renderMenu();
    expect(screen.getByText('Stop after iteration')).toBeInTheDocument();
    expect(screen.getByText('Kill immediately')).toBeInTheDocument();
    expect(screen.getByText('Copy session ID')).toBeInTheDocument();
  });

  it('"Stop after iteration" calls onSelectSession, onStopSession(false), and onClose', () => {
    const onSelectSession = vi.fn();
    const onStopSession = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onSelectSession, onStopSession, onClose });
    fireEvent.click(screen.getByText('Stop after iteration'));
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
    expect(onStopSession).toHaveBeenCalledWith('sess-001', false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Kill immediately" calls onSelectSession, onStopSession(true), and onClose', () => {
    const onSelectSession = vi.fn();
    const onStopSession = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onSelectSession, onStopSession, onClose });
    fireEvent.click(screen.getByText('Kill immediately'));
    expect(onSelectSession).toHaveBeenCalledWith('sess-001');
    expect(onStopSession).toHaveBeenCalledWith('sess-001', true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Copy session ID" calls onCopySessionId and onClose', () => {
    const onCopySessionId = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onCopySessionId, onClose });
    fireEvent.click(screen.getByText('Copy session ID'));
    expect(onCopySessionId).toHaveBeenCalledWith('sess-001');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses null selectId for "current" session when stopping', () => {
    const onSelectSession = vi.fn();
    const onStopSession = vi.fn();
    renderMenu({ sessionId: 'current', onSelectSession, onStopSession });
    fireEvent.click(screen.getByText('Stop after iteration'));
    expect(onSelectSession).toHaveBeenCalledWith(null);
    expect(onStopSession).toHaveBeenCalledWith(null, false);
  });

  it('passes raw sessionId (not null) to onCopySessionId for "current"', () => {
    const onCopySessionId = vi.fn();
    renderMenu({ sessionId: 'current', onCopySessionId });
    fireEvent.click(screen.getByText('Copy session ID'));
    expect(onCopySessionId).toHaveBeenCalledWith('current');
  });
});
