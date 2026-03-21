import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import { createElement } from 'react';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/index.css';

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'light',
      parentSelector: 'html',
    }),
    (Story) => createElement(TooltipProvider, { delayDuration: 300 }, createElement(Story)),
  ],
};

export default preview;
