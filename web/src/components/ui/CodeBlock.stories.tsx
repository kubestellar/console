import type { Meta, StoryObj } from '@storybook/react'
import { CodeBlock } from './CodeBlock'

const meta = {
  title: 'UI/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  argTypes: {
    language: { control: 'text' },
    fontSize: {
      control: 'select',
      options: ['sm', 'base', 'lg'],
    },
  },
} satisfies Meta<typeof CodeBlock>

export default meta
type Story = StoryObj<typeof meta>

const SAMPLE_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx`

const SAMPLE_BASH = `kubectl get pods -n kube-system
kubectl apply -f deployment.yaml
kubectl rollout status deployment/nginx-deployment`

const SAMPLE_JSON = `{
  "cluster": "prod-east",
  "status": "healthy",
  "nodes": 5,
  "readyNodes": 5,
  "provider": "eks"
}`

const SAMPLE_GO = `func main() {
    ctx := context.Background()
    client, err := kubernetes.NewForConfig(config)
    if err != nil {
        log.Fatal(err)
    }
    pods, err := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
    fmt.Printf("Found %d pods\\n", len(pods.Items))
}`

export const Default: Story = {
  args: {
    children: SAMPLE_YAML,
    language: 'yaml',
  },
}

export const YAML: Story = {
  args: {
    children: SAMPLE_YAML,
    language: 'yaml',
  },
}

export const Bash: Story = {
  args: {
    children: SAMPLE_BASH,
    language: 'bash',
  },
}

export const JSON: Story = {
  args: {
    children: SAMPLE_JSON,
    language: 'json',
  },
}

export const Go: Story = {
  args: {
    children: SAMPLE_GO,
    language: 'go',
  },
}

export const SmallFont: Story = {
  args: {
    children: SAMPLE_BASH,
    language: 'bash',
    fontSize: 'sm',
  },
}

export const BaseFont: Story = {
  args: {
    children: SAMPLE_BASH,
    language: 'bash',
    fontSize: 'base',
  },
}

export const LargeFont: Story = {
  args: {
    children: SAMPLE_BASH,
    language: 'bash',
    fontSize: 'lg',
  },
}

export const LongContent: Story = {
  args: {
    children: Array.from({ length: 20 }, (_, i) => `line ${i + 1}: kubectl get pods -o wide --namespace=very-long-namespace-name-that-causes-horizontal-scroll`).join('\n'),
    language: 'bash',
    fontSize: 'sm',
  },
}
