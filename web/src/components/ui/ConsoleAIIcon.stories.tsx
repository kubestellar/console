import type { Meta, StoryObj } from '@storybook/react'
import { ConsoleAIIcon } from './ConsoleAIIcon'

const meta = {
  title: 'UI/ConsoleAIIcon',
  component: ConsoleAIIcon,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof ConsoleAIIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    size: 'md',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <ConsoleAIIcon size="sm" />
        <span className="text-xs text-muted-foreground">sm</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ConsoleAIIcon size="md" />
        <span className="text-xs text-muted-foreground">md</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ConsoleAIIcon size="lg" />
        <span className="text-xs text-muted-foreground">lg</span>
      </div>
    </div>
  ),
}

export const InlineWithText: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-foreground">
      <ConsoleAIIcon size="md" />
      <span className="text-sm font-medium">Console AI</span>
    </div>
  ),
}
