import type { Meta, StoryObj } from '@storybook/react'
import { CloudProviderIcon } from './CloudProviderIcon'
import type { CloudProvider } from './CloudProviderIcon'

const meta = {
  title: 'UI/CloudProviderIcon',
  component: CloudProviderIcon,
  tags: ['autodocs'],
  argTypes: {
    provider: {
      control: 'select',
      options: [
        'eks', 'gke', 'aks', 'openshift', 'oci', 'alibaba',
        'digitalocean', 'rancher', 'coreweave', 'kind',
        'minikube', 'k3s', 'kubernetes',
      ],
    },
    size: { control: { type: 'number', min: 8, max: 64 } },
  },
} satisfies Meta<typeof CloudProviderIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    provider: 'kubernetes',
    size: 24,
  },
}

export const EKS: Story = {
  args: {
    provider: 'eks',
    size: 24,
  },
}

export const GKE: Story = {
  args: {
    provider: 'gke',
    size: 24,
  },
}

export const AKS: Story = {
  args: {
    provider: 'aks',
    size: 24,
  },
}

export const OpenShift: Story = {
  args: {
    provider: 'openshift',
    size: 24,
  },
}

export const OCI: Story = {
  args: {
    provider: 'oci',
    size: 24,
  },
}

export const CoreWeave: Story = {
  args: {
    provider: 'coreweave',
    size: 24,
  },
}

const ALL_PROVIDERS: CloudProvider[] = [
  'eks', 'gke', 'aks', 'openshift', 'oci', 'alibaba',
  'digitalocean', 'rancher', 'coreweave', 'kind',
  'minikube', 'k3s', 'kubernetes',
]

export const AllProviders: Story = {
  args: { provider: 'kubernetes' },
  render: () => (
    <div className="grid grid-cols-4 gap-6">
      {ALL_PROVIDERS.map((provider) => (
        <div key={provider} className="flex flex-col items-center gap-2">
          <CloudProviderIcon provider={provider} size={32} />
          <span className="text-xs text-muted-foreground">{provider}</span>
        </div>
      ))}
    </div>
  ),
}

export const SmallIcons: Story = {
  args: { provider: 'kubernetes' },
  render: () => (
    <div className="flex flex-wrap gap-3">
      {ALL_PROVIDERS.map((provider) => (
        <div key={provider} className="flex items-center gap-1.5" title={provider}>
          <CloudProviderIcon provider={provider} size={16} />
          <span className="text-xs text-muted-foreground">{provider}</span>
        </div>
      ))}
    </div>
  ),
}

export const LargeIcons: Story = {
  args: { provider: 'kubernetes' },
  render: () => (
    <div className="grid grid-cols-4 gap-8">
      {ALL_PROVIDERS.map((provider) => (
        <div key={provider} className="flex flex-col items-center gap-2">
          <CloudProviderIcon provider={provider} size={48} />
          <span className="text-xs text-muted-foreground">{provider}</span>
        </div>
      ))}
    </div>
  ),
}

export const CloudProviders: Story = {
  name: 'Cloud Providers Only',
  args: { provider: 'eks' },
  render: () => (
    <div className="flex gap-6">
      {(['eks', 'gke', 'aks', 'oci', 'alibaba', 'digitalocean', 'coreweave'] as CloudProvider[]).map((provider) => (
        <div key={provider} className="flex flex-col items-center gap-2">
          <CloudProviderIcon provider={provider} size={32} />
          <span className="text-xs text-muted-foreground">{provider}</span>
        </div>
      ))}
    </div>
  ),
}

export const LocalClusters: Story = {
  name: 'Local Development Clusters',
  args: { provider: 'kind' },
  render: () => (
    <div className="flex gap-6">
      {(['kind', 'minikube', 'k3s'] as CloudProvider[]).map((provider) => (
        <div key={provider} className="flex flex-col items-center gap-2">
          <CloudProviderIcon provider={provider} size={32} />
          <span className="text-xs text-muted-foreground">{provider}</span>
        </div>
      ))}
    </div>
  ),
}

export const InlineWithText: Story = {
  args: { provider: 'eks' },
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <CloudProviderIcon provider="eks" size={16} />
        <span>prod-us-east-1 (AWS EKS)</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <CloudProviderIcon provider="gke" size={16} />
        <span>staging-eu-west (Google GKE)</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <CloudProviderIcon provider="openshift" size={16} />
        <span>ocp-prod (OpenShift)</span>
      </div>
    </div>
  ),
}
