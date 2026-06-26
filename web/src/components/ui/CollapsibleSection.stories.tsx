import type { Meta, StoryObj } from '@storybook/react'
import { CollapsibleSection } from './CollapsibleSection'
import { StatusBadge } from './StatusBadge'

const meta = {
  title: 'UI/CollapsibleSection',
  component: CollapsibleSection,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    defaultOpen: { control: 'boolean' },
  },
} satisfies Meta<typeof CollapsibleSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Cluster Details',
    defaultOpen: true,
    children: (
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-foreground">
        <p>This is the content of the collapsible section.</p>
        <p className="mt-2 text-muted-foreground">It can contain any React nodes.</p>
      </div>
    ),
  },
}

export const Collapsed: Story = {
  args: {
    title: 'Advanced Settings',
    defaultOpen: false,
    children: (
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-foreground">
        <p>This content is hidden by default.</p>
      </div>
    ),
  },
}

export const WithBadge: Story = {
  args: {
    title: 'Compliance Policies',
    defaultOpen: true,
    badge: <StatusBadge color="green" size="xs">12 passing</StatusBadge>,
    children: (
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-foreground">
        <ul className="space-y-1 text-muted-foreground">
          <li>Pod Security Standards: Pass</li>
          <li>Network Policies: Pass</li>
          <li>Resource Limits: Pass</li>
        </ul>
      </div>
    ),
  },
}

export const WithWarningBadge: Story = {
  args: {
    title: 'Security Findings',
    defaultOpen: true,
    badge: <StatusBadge color="yellow" size="xs">3 warnings</StatusBadge>,
    children: (
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-foreground">
        <ul className="space-y-1 text-muted-foreground">
          <li>CVE-2024-1234: Medium severity</li>
          <li>CVE-2024-5678: Low severity</li>
          <li>Deprecated API usage detected</li>
        </ul>
      </div>
    ),
  },
}

export const NestedSections: Story = {
  args: { title: 'Nested Sections', children: null },
  render: () => (
    <div className="space-y-2 max-w-lg">
      <CollapsibleSection title="Cluster: prod-east" defaultOpen>
        <div className="pl-4 space-y-2">
          <CollapsibleSection title="Nodes" badge={<StatusBadge color="blue" size="xs">5</StatusBadge>} defaultOpen={false}>
            <div className="p-2 text-sm text-muted-foreground">5 nodes, all healthy</div>
          </CollapsibleSection>
          <CollapsibleSection title="Workloads" badge={<StatusBadge color="green" size="xs">12</StatusBadge>} defaultOpen={false}>
            <div className="p-2 text-sm text-muted-foreground">12 deployments running</div>
          </CollapsibleSection>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Cluster: staging" defaultOpen={false}>
        <div className="p-2 text-sm text-muted-foreground">Staging cluster details</div>
      </CollapsibleSection>
    </div>
  ),
}
