import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/Tooltip',
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>Tooltip content</TooltipContent>
    </Tooltip>
  ),
};

export const TopSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Top tooltip</Button>
      </TooltipTrigger>
      <TooltipContent side="top">Appears on top</TooltipContent>
    </Tooltip>
  ),
};

export const BottomSide: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Bottom tooltip</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Appears on bottom</TooltipContent>
    </Tooltip>
  ),
};
