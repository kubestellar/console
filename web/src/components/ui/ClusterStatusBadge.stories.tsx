import type { Meta, StoryObj } from '@storybook/react'
import { ClusterStatusBadge, ClusterStatusDot } from './ClusterStatusBadge'
import type { ClusterState } from './ClusterStatusBadge'

const meta = {
  title: 'UI/ClusterStatusBadge',
  component: ClusterStatusBadge,
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: [
        'healthy',
        'degraded',
        'unreachable-timeout',
        'unreachable-auth',
        'unreachable-network',
        'unreachable-cert',
        'unreachable-unknown',
      ],
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
    showLabel: { control: 'boolean' },
    nodeCount: { control: 'number' },
    readyNodes: { control: 'number' },
  },
} satisfies Meta<typeof ClusterStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Healthy: Story = {
  args: {
    state: 'healthy',
  },
}

export const Degraded: Story = {
  args: {
    state: 'degraded',
    nodeCount: 5,
    readyNodes: 3,
  },
}

export const UnreachableTimeout: Story = {
  args: {
    state: 'unreachable-timeout',
    lastSeen: new Date(Date.now() - 300000).toISOString(),
  },
}

export const UnreachableAuth: Story = {
  args: {
    state: 'unreachable-auth',
  },
}

export const UnreachableNetwork: Story = {
  args: {
    state: 'unreachable-network',
  },
}

export const UnreachableCert: Story = {
  args: {
    state: 'unreachable-cert',
  },
}

export const UnreachableUnknown: Story = {
  args: {
    state: 'unreachable-unknown',
  },
}

export const MediumSize: Story = {
  args: {
    state: 'healthy',
    size: 'md',
  },
}

export const IconOnly: Story = {
  args: {
    state: 'healthy',
    showLabel: false,
  },
}

const ALL_STATES: ClusterState[] = [
  'healthy',
  'degraded',
  'unreachable-timeout',
  'unreachable-auth',
  'unreachable-network',
  'unreachable-cert',
  'unreachable-unknown',
]

export const AllStates: Story = {
  args: { state: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATES.map((state) => (
        <div key={state} className="flex items-center gap-3">
          <ClusterStatusBadge
            state={state}
            nodeCount={state === 'degraded' ? 5 : undefined}
            readyNodes={state === 'degraded' ? 3 : undefined}
          />
          <span className="text-xs text-muted-foreground font-mono">{state}</span>
        </div>
      ))}
    </div>
  ),
}

export const AllStatesSmall: Story = {
  name: 'All States (sm)',
  args: { state: 'healthy' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ALL_STATES.map((state) => (
        <ClusterStatusBadge key={state} state={state} size="sm" />
      ))}
    </div>
  ),
}

export const StatusDots: Story = {
  name: 'ClusterStatusDot',
  args: { state: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATES.map((state) => (
        <div key={state} className="flex items-center gap-3">
          <ClusterStatusDot state={state} size="sm" />
          <ClusterStatusDot state={state} size="md" />
          <span className="text-xs text-muted-foreground font-mono">{state}</span>
        </div>
      ))}
    </div>
  ),
}
