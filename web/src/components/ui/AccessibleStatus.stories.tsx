import type { Meta, StoryObj } from '@storybook/react'
import {
  AccessibleStatusBadge,
  AccessibleStatusDot,
  AccessibleStatusText,
  StatusIcon,
} from './AccessibleStatus'

const meta = {
  title: 'UI/AccessibleStatus',
  component: AccessibleStatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['healthy', 'success', 'warning', 'error', 'critical', 'info', 'unknown', 'pending', 'loading'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    showIcon: { control: 'boolean' },
    showLabel: { control: 'boolean' },
    label: { control: 'text' },
  },
} satisfies Meta<typeof AccessibleStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    status: 'healthy',
  },
}

export const Healthy: Story = {
  args: {
    status: 'healthy',
  },
}

export const Warning: Story = {
  args: {
    status: 'warning',
  },
}

export const Error: Story = {
  args: {
    status: 'error',
  },
}

export const Critical: Story = {
  args: {
    status: 'critical',
  },
}

export const Info: Story = {
  args: {
    status: 'info',
  },
}

export const Pending: Story = {
  args: {
    status: 'pending',
  },
}

export const Loading: Story = {
  args: {
    status: 'loading',
  },
}

export const CustomLabel: Story = {
  args: {
    status: 'healthy',
    label: 'All Systems Operational',
  },
}

export const IconOnly: Story = {
  args: {
    status: 'error',
    showLabel: false,
  },
}

const ALL_STATUSES = ['healthy', 'success', 'warning', 'error', 'critical', 'info', 'unknown', 'pending', 'loading'] as const

export const AllStatuses: Story = {
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATUSES.map((status) => (
        <div key={status} className="flex items-center gap-3">
          <AccessibleStatusBadge status={status} />
          <span className="text-xs text-muted-foreground font-mono w-20">{status}</span>
        </div>
      ))}
    </div>
  ),
}

export const AllSizes: Story = {
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <AccessibleStatusBadge status="healthy" size="sm" />
        <span className="text-xs text-muted-foreground">sm</span>
      </div>
      <div className="flex items-center gap-3">
        <AccessibleStatusBadge status="healthy" size="md" />
        <span className="text-xs text-muted-foreground">md</span>
      </div>
      <div className="flex items-center gap-3">
        <AccessibleStatusBadge status="healthy" size="lg" />
        <span className="text-xs text-muted-foreground">lg</span>
      </div>
    </div>
  ),
}

export const StatusDots: Story = {
  name: 'AccessibleStatusDot',
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATUSES.map((status) => (
        <div key={status} className="flex items-center gap-3">
          <AccessibleStatusDot status={status} size="sm" />
          <AccessibleStatusDot status={status} size="md" />
          <AccessibleStatusDot status={status} size="lg" />
          <span className="text-xs text-muted-foreground font-mono">{status}</span>
        </div>
      ))}
    </div>
  ),
}

export const StatusDotsWithIcons: Story = {
  name: 'AccessibleStatusDot (forced icons)',
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATUSES.map((status) => (
        <div key={status} className="flex items-center gap-3">
          <AccessibleStatusDot status={status} size="sm" showIcon />
          <AccessibleStatusDot status={status} size="md" showIcon />
          <AccessibleStatusDot status={status} size="lg" showIcon />
          <span className="text-xs text-muted-foreground font-mono">{status}</span>
        </div>
      ))}
    </div>
  ),
}

export const StatusTexts: Story = {
  name: 'AccessibleStatusText',
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-2">
      {ALL_STATUSES.map((status) => (
        <AccessibleStatusText key={status} status={status} />
      ))}
    </div>
  ),
}

export const StatusIcons: Story = {
  name: 'StatusIcon',
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-col gap-3">
      {ALL_STATUSES.map((status) => (
        <div key={status} className="flex items-center gap-3">
          <StatusIcon status={status} size="sm" />
          <StatusIcon status={status} size="md" />
          <StatusIcon status={status} size="lg" />
          <span className="text-xs text-muted-foreground font-mono">{status}</span>
        </div>
      ))}
    </div>
  ),
}

export const StringStatusNormalization: Story = {
  name: 'String Status Normalization',
  args: { status: 'healthy' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <AccessibleStatusBadge status="Ready" />
      <AccessibleStatusBadge status="Running" />
      <AccessibleStatusBadge status="Failed" />
      <AccessibleStatusBadge status="Pending" />
      <AccessibleStatusBadge status="Unknown" />
    </div>
  ),
}
