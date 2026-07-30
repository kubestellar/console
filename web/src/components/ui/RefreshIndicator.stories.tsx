import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { RefreshIndicator, RefreshButton, RefreshSpinner } from './RefreshIndicator'

const meta = {
  title: 'UI/RefreshIndicator',
  component: RefreshIndicator,
  tags: ['autodocs'],
  argTypes: {
    isRefreshing: { control: 'boolean' },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
    showLabel: { control: 'boolean' },
    staleThresholdMinutes: { control: { type: 'number', min: 1, max: 60 } },
  },
} satisfies Meta<typeof RefreshIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(),
  },
}

export const Refreshing: Story = {
  args: {
    isRefreshing: true,
    lastUpdated: new Date(),
  },
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const TEN_MINUTES_MS = 10 * 60 * 1000

export const Stale: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(Date.now() - TEN_MINUTES_MS),
    staleThresholdMinutes: 5,
  },
}

export const NoLastUpdate: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: null,
  },
}

export const ExtraSmall: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(),
    size: 'xs',
  },
}

export const SmallSize: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(),
    size: 'sm',
  },
}

export const MediumSize: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(),
    size: 'md',
  },
}

export const WithoutLabel: Story = {
  args: {
    isRefreshing: false,
    lastUpdated: new Date(),
    showLabel: false,
  },
}

export const AllStates: Story = {
  args: { isRefreshing: false },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing={false} lastUpdated={new Date()} />
        <span className="text-xs text-muted-foreground">Just updated</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing />
        <span className="text-xs text-muted-foreground">Refreshing</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshIndicator
          isRefreshing={false}
          lastUpdated={new Date(Date.now() - TEN_MINUTES_MS)}
          staleThresholdMinutes={5}
        />
        <span className="text-xs text-muted-foreground">Stale (10m ago, threshold 5m)</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing={false} lastUpdated={null} />
        <span className="text-xs text-muted-foreground">No data yet</span>
      </div>
    </div>
  ),
}

export const AllSizes: Story = {
  args: { isRefreshing: false },
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing={false} lastUpdated={new Date()} size="xs" />
        <span className="text-xs text-muted-foreground">xs</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing={false} lastUpdated={new Date()} size="sm" />
        <span className="text-xs text-muted-foreground">sm</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshIndicator isRefreshing={false} lastUpdated={new Date()} size="md" />
        <span className="text-xs text-muted-foreground">md</span>
      </div>
    </div>
  ),
}

// RefreshButton stories

export const ButtonIdle: Story = {
  name: 'RefreshButton - Idle',
  args: { isRefreshing: false },
  render: () => (
    <RefreshButton
      isRefreshing={false}
      lastRefresh={new Date()}
      onRefresh={fn()}
    />
  ),
}

export const ButtonRefreshing: Story = {
  name: 'RefreshButton - Refreshing',
  args: { isRefreshing: true },
  render: () => (
    <RefreshButton
      isRefreshing
      lastRefresh={new Date()}
      onRefresh={fn()}
    />
  ),
}

export const ButtonFailed: Story = {
  name: 'RefreshButton - Failed',
  args: { isRefreshing: false },
  render: () => (
    <RefreshButton
      isRefreshing={false}
      isFailed
      consecutiveFailures={3}
      lastRefresh={new Date(Date.now() - FIVE_MINUTES_MS)}
      onRefresh={fn()}
    />
  ),
}

export const ButtonDisabled: Story = {
  name: 'RefreshButton - Disabled',
  args: { isRefreshing: false },
  render: () => (
    <RefreshButton
      isRefreshing={false}
      disabled
      lastRefresh={new Date()}
      onRefresh={fn()}
    />
  ),
}

export const ButtonAllStates: Story = {
  name: 'RefreshButton - All States',
  args: { isRefreshing: false },
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <RefreshButton isRefreshing={false} lastRefresh={new Date()} onRefresh={fn()} />
        <span className="text-xs text-muted-foreground">Idle</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshButton isRefreshing lastRefresh={new Date()} onRefresh={fn()} />
        <span className="text-xs text-muted-foreground">Refreshing</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshButton isRefreshing={false} isFailed consecutiveFailures={2} lastRefresh={new Date(Date.now() - FIVE_MINUTES_MS)} onRefresh={fn()} />
        <span className="text-xs text-muted-foreground">Failed</span>
      </div>
      <div className="flex items-center gap-3">
        <RefreshButton isRefreshing={false} disabled lastRefresh={new Date()} onRefresh={fn()} />
        <span className="text-xs text-muted-foreground">Disabled</span>
      </div>
    </div>
  ),
}

// RefreshSpinner stories

export const SpinnerActive: Story = {
  name: 'RefreshSpinner - Active',
  args: { isRefreshing: true },
  render: () => (
    <div className="flex items-center gap-2">
      <RefreshSpinner isRefreshing size="md" />
      <span className="text-sm text-foreground">Loading data...</span>
    </div>
  ),
}

export const SpinnerInactive: Story = {
  name: 'RefreshSpinner - Inactive (hidden)',
  args: { isRefreshing: false },
  render: () => (
    <div className="flex items-center gap-2">
      <RefreshSpinner isRefreshing={false} size="md" />
      <span className="text-sm text-muted-foreground">Spinner is hidden when not refreshing</span>
    </div>
  ),
}

export const SpinnerSizes: Story = {
  name: 'RefreshSpinner - Sizes',
  args: { isRefreshing: true },
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <RefreshSpinner isRefreshing size="sm" />
        <span className="text-xs text-muted-foreground">sm</span>
      </div>
      <div className="flex items-center gap-2">
        <RefreshSpinner isRefreshing size="md" />
        <span className="text-xs text-muted-foreground">md</span>
      </div>
    </div>
  ),
}
