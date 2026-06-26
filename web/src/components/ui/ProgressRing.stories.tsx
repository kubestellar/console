import type { Meta, StoryObj } from '@storybook/react'
import { ProgressRing } from './ProgressRing'

const meta = {
  title: 'UI/ProgressRing',
  component: ProgressRing,
  tags: ['autodocs'],
  argTypes: {
    progress: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    size: { control: { type: 'number', min: 8, max: 120 } },
    strokeWidth: { control: { type: 'number', min: 1, max: 10 } },
  },
} satisfies Meta<typeof ProgressRing>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    progress: 0.65,
  },
}

export const Empty: Story = {
  args: {
    progress: 0,
  },
}

export const Quarter: Story = {
  args: {
    progress: 0.25,
  },
}

export const Half: Story = {
  args: {
    progress: 0.5,
  },
}

export const ThreeQuarters: Story = {
  args: {
    progress: 0.75,
  },
}

export const Full: Story = {
  args: {
    progress: 1,
  },
}

export const LargeSize: Story = {
  args: {
    progress: 0.7,
    size: 64,
    strokeWidth: 4,
  },
}

export const ExtraLarge: Story = {
  args: {
    progress: 0.85,
    size: 120,
    strokeWidth: 8,
  },
}

export const ThinStroke: Story = {
  args: {
    progress: 0.6,
    size: 48,
    strokeWidth: 1,
  },
}

export const ThickStroke: Story = {
  args: {
    progress: 0.4,
    size: 48,
    strokeWidth: 6,
  },
}

export const AllProgressLevels: Story = {
  args: { progress: 0.5 },
  render: () => (
    <div className="flex items-center gap-4">
      {[0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => (
        <div key={p} className="flex flex-col items-center gap-1">
          <ProgressRing progress={p} size={32} strokeWidth={3} />
          <span className="text-xs text-muted-foreground">{Math.round(p * 100)}%</span>
        </div>
      ))}
    </div>
  ),
}

export const DifferentSizes: Story = {
  args: { progress: 0.65 },
  render: () => (
    <div className="flex items-center gap-4">
      {[16, 24, 32, 48, 64].map((s) => (
        <div key={s} className="flex flex-col items-center gap-1">
          <ProgressRing progress={0.65} size={s} strokeWidth={Math.max(2, s / 12)} />
          <span className="text-xs text-muted-foreground">{s}px</span>
        </div>
      ))}
    </div>
  ),
}
