import type { Meta, StoryObj } from '@storybook/react'
import { RotatingTip } from './RotatingTip'

const meta = {
  title: 'UI/RotatingTip',
  component: RotatingTip,
  tags: ['autodocs'],
  argTypes: {
    page: {
      control: 'select',
      options: ['clusters', 'compliance', 'arcade'],
    },
  },
} satisfies Meta<typeof RotatingTip>

export default meta
type Story = StoryObj<typeof meta>

export const Clusters: Story = {
  args: {
    page: 'clusters',
  },
}

export const Compliance: Story = {
  args: {
    page: 'compliance',
  },
}

export const Arcade: Story = {
  args: {
    page: 'arcade',
  },
}

export const AllPages: Story = {
  args: { page: 'clusters' },
  render: () => (
    <div className="flex flex-col gap-3 max-w-xl">
      <div>
        <span className="text-xs text-muted-foreground mb-1 block">clusters page:</span>
        <RotatingTip page="clusters" />
      </div>
      <div>
        <span className="text-xs text-muted-foreground mb-1 block">compliance page:</span>
        <RotatingTip page="compliance" />
      </div>
      <div>
        <span className="text-xs text-muted-foreground mb-1 block">arcade page:</span>
        <RotatingTip page="arcade" />
      </div>
    </div>
  ),
}
