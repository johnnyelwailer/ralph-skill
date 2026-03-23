import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content.</p>
      </CardContent>
    </Card>
  ),
};

export const WithoutDescription: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>No Description</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Content without description.</p>
      </CardContent>
    </Card>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardContent className="pt-6">
        <p>Content only, no header.</p>
      </CardContent>
    </Card>
  ),
};
