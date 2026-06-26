import type { Meta, StoryObj } from '@storybook/react'
import { LimitedAccessWarning } from './LimitedAccessWarning'

const meta = {
  title: 'UI/LimitedAccessWarning',
  component: LimitedAccessWarning,
  tags: ['autodocs'],
  argTypes: {
    hasError: { control: 'boolean' },
    unreachableCount: { control: { type: 'number', min: 0 } },
    totalCount: { control: { type: 'number', min: 0 } },
    message: { control: 'text' },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
} satisfies Meta<typeof LimitedAccessWarning>

export default meta
type Story = StoryObj<typeof meta>

export const DemoDataMode: Story = {
  args: {
    hasError: true,
  },
}

export const SingleClusterOffline: Story = {
  args: {
    unreachableCount: 1,
  },
}

export const MultipleClustersOffline: Story = {
  args: {
    unreachableCount: 3,
    totalCount: 8,
  },
}

export const CustomMessage: Story = {
  args: {
    message: 'Authentication token expired. Please re-authenticate.',
  },
}

export const SmallSize: Story = {
  args: {
    hasError: true,
    size: 'sm',
  },
}

export const MediumSize: Story = {
  args: {
    hasError: true,
    size: 'md',
  },
}

export const NoConditions: Story = {
  name: 'Hidden (no conditions)',
  args: {
    hasError: false,
    unreachableCount: 0,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <LimitedAccessWarning hasError />
        <span className="text-xs text-muted-foreground">hasError=true</span>
      </div>
      <div className="flex items-center gap-3">
        <LimitedAccessWarning unreachableCount={1} />
        <span className="text-xs text-muted-foreground">1 cluster offline</span>
      </div>
      <div className="flex items-center gap-3">
        <LimitedAccessWarning unreachableCount={3} totalCount={8} />
        <span className="text-xs text-muted-foreground">3 of 8 offline</span>
      </div>
      <div className="flex items-center gap-3">
        <LimitedAccessWarning message="Custom warning message" />
        <span className="text-xs text-muted-foreground">custom message</span>
      </div>
    </div>
  ),
}

export const BothSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <LimitedAccessWarning hasError size="sm" />
        <span className="text-xs text-muted-foreground">sm</span>
      </div>
      <div className="flex items-center gap-3">
        <LimitedAccessWarning hasError size="md" />
        <span className="text-xs text-muted-foreground">md</span>
      </div>
    </div>
  ),
}
