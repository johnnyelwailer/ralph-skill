import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: 'Type something...', className: 'w-80' },
};

export const WithValue: Story = {
  args: { value: 'Some pre-filled text content.', className: 'w-80', readOnly: true },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled textarea', disabled: true, className: 'w-80' },
};
