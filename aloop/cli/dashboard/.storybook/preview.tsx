import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../src/index.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={300}>
        <Story />
      </TooltipProvider>
    ),
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
