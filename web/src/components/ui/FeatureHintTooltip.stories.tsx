import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { FeatureHintTooltip } from './FeatureHintTooltip'

const meta = {
  title: 'UI/FeatureHintTooltip',
  component: FeatureHintTooltip,
  tags: ['autodocs'],
  argTypes: {
    message: { control: 'text' },
    placement: {
      control: 'select',
      options: ['top', 'bottom', 'bottom-right', 'left', 'right'],
    },
  },
  args: {
    onDismiss: fn(),
  },
  decorators: [
    (Story) => (
      <div className="relative flex min-h-[200px] items-center justify-center p-20">
        <div className="relative inline-block">
          <div className="px-4 py-2 bg-secondary rounded-lg text-sm text-foreground border border-border">
            Anchor Element
          </div>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof FeatureHintTooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    message: 'Try clicking here to explore the new cluster overview feature!',
    placement: 'bottom',
  },
}

export const Top: Story = {
  args: {
    message: 'This feature was recently added.',
    placement: 'top',
  },
}

export const Bottom: Story = {
  args: {
    message: 'Click to see compliance details for this cluster.',
    placement: 'bottom',
  },
}

export const BottomRight: Story = {
  args: {
    message: 'New GPU metrics are available for this cluster.',
    placement: 'bottom-right',
  },
}

export const Left: Story = {
  args: {
    message: 'Expand to see node-level details.',
    placement: 'left',
  },
}

export const Right: Story = {
  args: {
    message: 'Drag to reorder your dashboard cards.',
    placement: 'right',
  },
}

export const LongMessage: Story = {
  args: {
    message: 'You can now view GPU utilization, memory allocation, and NVIDIA operator status directly from the cluster dashboard without switching views.',
    placement: 'bottom',
  },
}

export const AllPlacements: Story = {
  args: { message: 'Hint tooltip' },
  render: () => (
    <div className="grid grid-cols-2 gap-16 p-[120px]">
      {(['top', 'bottom', 'left', 'right'] as const).map((placement) => (
        <div key={placement} className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground mb-4">{placement}</span>
          <div className="relative inline-block">
            <div className="px-4 py-2 bg-secondary rounded-lg text-sm text-foreground border border-border">
              Anchor
            </div>
            <FeatureHintTooltip
              message={`Hint positioned ${placement}`}
              placement={placement}
              onDismiss={fn()}
            />
          </div>
        </div>
      ))}
    </div>
  ),
}
