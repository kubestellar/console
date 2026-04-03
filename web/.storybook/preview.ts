import type { Preview } from '@storybook/react'
import { ThemeDecorator } from './ThemeDecorator'
import '../src/index.css'
import '../src/lib/i18n'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Theme selector',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'kubestellar', title: 'KubeStellar (Dark)' },
          { value: 'kubestellar-classic', title: 'KubeStellar Classic' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'kubestellar',
  },
  decorators: [ThemeDecorator],
}

export default preview
