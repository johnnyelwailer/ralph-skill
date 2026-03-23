import type { Meta, StoryObj } from '@storybook/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';

const meta: Meta = {
  title: 'UI/Resizable',
};

export default meta;
type Story = StoryObj;

export const Horizontal: Story = {
  render: () => (
    <ResizablePanelGroup orientation="horizontal" className="h-40 w-96 rounded border">
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Left panel</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Right panel</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    <ResizablePanelGroup orientation="vertical" className="h-64 w-64 rounded border">
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Top panel</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Bottom panel</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const ThreePanels: Story = {
  render: () => (
    <ResizablePanelGroup orientation="horizontal" className="h-40 w-96 rounded border">
      <ResizablePanel defaultSize={33}>
        <div className="flex h-full items-center justify-center p-4 text-sm">One</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={34}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Two</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={33}>
        <div className="flex h-full items-center justify-center p-4 text-sm">Three</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
