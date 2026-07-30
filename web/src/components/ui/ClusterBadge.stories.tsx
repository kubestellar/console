import type { Meta, StoryObj } from '@storybook/react'
import { ClusterBadge } from './ClusterBadge'

const meta = {
  title: 'UI/ClusterBadge',
  component: ClusterBadge,
  tags: ['autodocs'],
  argTypes: {
    cluster: { control: 'text' },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    showIcon: { control: 'boolean' },
  },
} satisfies Meta<typeof ClusterBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    cluster: 'prod-east',
  },
}

export const Small: Story = {
  args: {
    cluster: 'prod-east',
    size: 'sm',
  },
}

export const Medium: Story = {
  args: {
    cluster: 'prod-east',
    size: 'md',
  },
}

export const Large: Story = {
  args: {
    cluster: 'prod-east',
    size: 'lg',
  },
}

export const WithoutIcon: Story = {
  args: {
    cluster: 'prod-east',
    showIcon: false,
  },
}

export const ProductionCluster: Story = {
  args: {
    cluster: 'prod-us-east-1',
  },
}

export const StagingCluster: Story = {
  args: {
    cluster: 'staging-eu-west-1',
  },
}

export const DevCluster: Story = {
  args: {
    cluster: 'dev-local',
  },
}

export const KnownClusters: Story = {
  args: { cluster: 'prod-east' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ClusterBadge cluster="vllm-d" />
      <ClusterBadge cluster="prod-east" />
      <ClusterBadge cluster="prod-west" />
      <ClusterBadge cluster="staging" />
      <ClusterBadge cluster="ops" />
      <ClusterBadge cluster="prow" />
    </div>
  ),
}

export const EnvironmentDetection: Story = {
  args: { cluster: 'prod-east' },
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="my-prod-cluster" />
        <span className="text-xs text-muted-foreground">Detected: Production</span>
      </div>
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="staging-api" />
        <span className="text-xs text-muted-foreground">Detected: Staging</span>
      </div>
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="dev-team-alpha" />
        <span className="text-xs text-muted-foreground">Detected: Development</span>
      </div>
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="test-e2e" />
        <span className="text-xs text-muted-foreground">Detected: Test</span>
      </div>
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="edge-site-01" />
        <span className="text-xs text-muted-foreground">Detected: Edge</span>
      </div>
      <div className="flex items-center gap-3">
        <ClusterBadge cluster="generic-cluster" />
        <span className="text-xs text-muted-foreground">Detected: Default</span>
      </div>
    </div>
  ),
}

export const AllSizes: Story = {
  args: { cluster: 'prod-east' },
  render: () => (
    <div className="flex items-center gap-3">
      <ClusterBadge cluster="prod-east" size="sm" />
      <ClusterBadge cluster="prod-east" size="md" />
      <ClusterBadge cluster="prod-east" size="lg" />
    </div>
  ),
}

export const LongClusterName: Story = {
  args: {
    cluster: 'my-very-long-cluster-name-that-might-overflow-us-east-1a',
    size: 'sm',
  },
  decorators: [
    (Story) => (
      <div className="max-w-[200px]">
        <Story />
      </div>
    ),
  ],
}
