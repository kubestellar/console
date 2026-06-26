import type { Meta, StoryObj } from '@storybook/react'
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonList,
  SkeletonStats,
  SkeletonWithRefresh,
  SkeletonCardWithRefresh,
  SkeletonStatBlock,
  SkeletonStatsSection,
  AnimatedValue,
} from './Skeleton'

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['text', 'circular', 'rectangular', 'rounded'],
    },
    animation: {
      control: 'select',
      options: ['pulse', 'wave', 'none'],
    },
    showRefresh: { control: 'boolean' },
    width: { control: 'text' },
    height: { control: 'text' },
  },
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'text',
    height: '1em',
  },
}

export const TextVariant: Story = {
  args: {
    variant: 'text',
    width: '200px',
    height: '16px',
  },
}

export const Circular: Story = {
  args: {
    variant: 'circular',
    width: 48,
    height: 48,
  },
}

export const Rectangular: Story = {
  args: {
    variant: 'rectangular',
    width: '100%',
    height: 120,
  },
}

export const Rounded: Story = {
  args: {
    variant: 'rounded',
    width: '100%',
    height: 60,
  },
}

export const WithRefreshIcon: Story = {
  args: {
    variant: 'rounded',
    width: '100%',
    height: 80,
    showRefresh: true,
  },
}

export const PulseAnimation: Story = {
  args: {
    variant: 'rounded',
    animation: 'pulse',
    width: '100%',
    height: 60,
  },
}

export const WaveAnimation: Story = {
  args: {
    variant: 'rounded',
    animation: 'wave',
    width: '100%',
    height: 60,
  },
}

export const NoAnimation: Story = {
  args: {
    variant: 'rounded',
    animation: 'none',
    width: '100%',
    height: 60,
  },
}

export const TextBlock: Story = {
  name: 'SkeletonText',
  render: () => (
    <div className="max-w-md">
      <SkeletonText lines={3} />
    </div>
  ),
}

export const TextBlockSingleLine: Story = {
  name: 'SkeletonText (1 line)',
  render: () => (
    <div className="max-w-md">
      <SkeletonText lines={1} />
    </div>
  ),
}

export const CardSkeleton: Story = {
  name: 'SkeletonCard',
  render: () => (
    <div className="max-w-sm border border-border rounded-lg">
      <SkeletonCard />
    </div>
  ),
}

export const ListSkeleton: Story = {
  name: 'SkeletonList',
  render: () => (
    <div className="max-w-md">
      <SkeletonList items={5} />
    </div>
  ),
}

export const StatsSkeleton: Story = {
  name: 'SkeletonStats',
  render: () => (
    <div className="max-w-sm">
      <SkeletonStats />
    </div>
  ),
}

export const WithRefreshMessage: Story = {
  name: 'SkeletonWithRefresh',
  render: () => (
    <div className="max-w-md space-y-4">
      <SkeletonWithRefresh height={120} iconSize="sm" />
      <SkeletonWithRefresh height={160} iconSize="md" message="Loading cluster data..." />
      <SkeletonWithRefresh height={200} iconSize="lg" message="Fetching metrics..." />
    </div>
  ),
}

export const CardWithRefresh: Story = {
  name: 'SkeletonCardWithRefresh',
  render: () => (
    <div className="max-w-sm border border-border rounded-lg">
      <SkeletonCardWithRefresh rows={4} showHeader showStats />
    </div>
  ),
}

export const StatBlock: Story = {
  name: 'SkeletonStatBlock',
  render: () => (
    <div className="max-w-[180px]">
      <SkeletonStatBlock />
    </div>
  ),
}

export const StatsSection: Story = {
  name: 'SkeletonStatsSection',
  render: () => (
    <div className="max-w-4xl">
      <SkeletonStatsSection count={6} columns={3} />
    </div>
  ),
}

export const AnimatedValueStory: Story = {
  name: 'AnimatedValue',
  render: () => (
    <div className="flex gap-4 text-2xl font-bold text-foreground">
      <AnimatedValue value={42} />
      <AnimatedValue value="99.9%" />
      <AnimatedValue value="3/5" />
    </div>
  ),
}
