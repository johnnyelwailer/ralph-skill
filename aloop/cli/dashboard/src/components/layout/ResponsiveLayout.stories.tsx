import type { Meta, StoryObj } from '@storybook/react';
import { ResponsiveLayout, useResponsiveLayout } from './ResponsiveLayout';

const meta: Meta<typeof ResponsiveLayout> = {
  title: 'Components/ResponsiveLayout',
  component: ResponsiveLayout,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ResponsiveLayout>;

const LayoutShowcase = () => {
  const { breakpoint, isMobile, isTablet, isDesktop, sidebarOpen } = useResponsiveLayout();
  return (
    <div className="p-4 space-y-2">
      <div className="text-lg font-semibold">Responsive Layout Demo</div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>Breakpoint: <span className="font-mono font-bold">{breakpoint}</span></p>
        <p>isMobile: {isMobile ? 'true' : 'false'}</p>
        <p>isTablet: {isTablet ? 'true' : 'false'}</p>
        <p>isDesktop: {isDesktop ? 'true' : 'false'}</p>
        <p>Sidebar open: {sidebarOpen ? 'true' : 'false'}</p>
      </div>
    </div>
  );
};

export const Desktop: Story = {
  render: () => (
    <ResponsiveLayout>
      <LayoutShowcase />
    </ResponsiveLayout>
  ),
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const Tablet: Story = {
  render: () => (
    <ResponsiveLayout>
      <LayoutShowcase />
    </ResponsiveLayout>
  ),
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
};

export const Mobile: Story = {
  render: () => (
    <ResponsiveLayout>
      <LayoutShowcase />
    </ResponsiveLayout>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const DarkMode: Story = {
  render: () => (
    <ResponsiveLayout>
      <LayoutShowcase />
    </ResponsiveLayout>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};