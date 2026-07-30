import { MS_PER_HOUR } from '../../../lib/constants/time'
import { RSS_UI_STRINGS } from './strings'
import type { FeedConfig, FeedItem } from './types'

const now = new Date()
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * MS_PER_HOUR)

export function getDemoRSSItems(): FeedItem[] {
  return [
    { id: 'demo-1', title: 'Kubernetes 1.32: What You Need to Know', link: '#', description: 'The latest Kubernetes release brings improvements to pod scheduling, enhanced GPU support, and new security features for multi-tenant clusters.', pubDate: hoursAgo(1), author: 'CNCF Blog', sourceName: 'Kubernetes Blog', sourceIcon: '⎈', sourceUrl: 'demo:kubernetes-blog' },
    { id: 'demo-2', title: 'KubeStellar: Multi-Cluster Management Made Simple', link: '#', description: 'How KubeStellar simplifies deploying and managing workloads across multiple Kubernetes clusters with its innovative control plane architecture.', pubDate: hoursAgo(3), author: 'KubeStellar Team', sourceName: 'KubeStellar Blog', sourceIcon: '🌟', sourceUrl: 'demo:kubestellar-blog' },
    { id: 'demo-3', title: 'Building Production-Ready AI Pipelines on Kubernetes', link: '#', description: 'A comprehensive guide to deploying ML models at scale using Kubernetes, covering GPU scheduling, model serving, and monitoring best practices.', pubDate: hoursAgo(6), author: 'Tech Blog', sourceName: 'Hacker News', sourceIcon: '🔶', sourceUrl: 'demo:hacker-news' },
    { id: 'demo-4', title: 'The State of Cloud Native Security in 2026', link: '#', description: 'Annual survey results reveal trends in container security, supply chain protection, and zero-trust architectures across enterprise Kubernetes deployments.', pubDate: hoursAgo(12), author: 'Security Weekly', sourceName: 'InfoQ', sourceIcon: '📰', sourceUrl: 'demo:infoq' },
    { id: 'demo-5', title: 'GitOps Best Practices: Lessons from 1000 Deployments', link: '#', description: 'Real-world insights from managing thousands of GitOps-driven deployments, including drift detection, rollback strategies, and multi-environment workflows.', pubDate: hoursAgo(18), author: 'DevOps Digest', sourceName: 'r/kubernetes', sourceIcon: '🔴', subreddit: 'kubernetes', sourceUrl: 'demo:reddit-kubernetes' },
    { id: 'demo-6', title: 'WebAssembly on Kubernetes: Beyond Containers', link: '#', description: 'Exploring how Wasm workloads can complement containers in Kubernetes environments, with benchmarks and use cases for edge computing.', pubDate: hoursAgo(24), author: 'Cloud Native Weekly', sourceName: 'The New Stack', sourceIcon: '📰', sourceUrl: 'demo:new-stack' },
    { id: 'demo-7', title: 'eBPF-Powered Observability: A Deep Dive', link: '#', description: 'How eBPF is revolutionizing Kubernetes observability with zero-instrumentation monitoring, network policies, and security enforcement.', pubDate: hoursAgo(36), author: 'Observability Hub', sourceName: 'Hacker News', sourceIcon: '🔶', sourceUrl: 'demo:hacker-news' },
    { id: 'demo-8', title: 'Cost Optimization Strategies for Multi-Cloud K8s', link: '#', description: 'Practical strategies for reducing cloud costs when running Kubernetes across AWS, GCP, and Azure, including spot instances and resource right-sizing.', pubDate: hoursAgo(48), author: 'FinOps Community', sourceName: 'r/devops', sourceIcon: '🔴', subreddit: 'devops', sourceUrl: 'demo:reddit-devops' },
  ]
}

export const RSS_DEMO_FEEDS: FeedConfig[] = [
  { url: 'demo:kubernetes-blog', name: 'Kubernetes Blog', icon: '⎈', category: 'cloud-native' },
  { url: 'demo:hacker-news', name: 'Hacker News', icon: '🔶', category: 'tech-news' },
  { url: 'demo:reddit-kubernetes', name: 'r/kubernetes', icon: '🔴', category: 'reddit' },
  {
    url: 'demo:aggregate',
    name: RSS_UI_STRINGS.demoAggregateName,
    icon: '📚',
    isAggregate: true,
    sourceUrls: ['demo:kubernetes-blog', 'demo:hacker-news', 'demo:reddit-kubernetes'],
    filter: { includeTerms: ['kubernetes', 'cloud'], excludeTerms: ['spam'] },
  },
]

export const RSS_DEMO_ACTIVE_FEED = RSS_DEMO_FEEDS[0]
export const RSS_DEMO_ITEMS = getDemoRSSItems()
export const RSS_DEMO_SOURCE_INFO = RSS_DEMO_FEEDS
  .filter((feed): feed is FeedConfig & { icon: string } => !feed.isAggregate && Boolean(feed.icon))
  .map((feed) => ({ url: feed.url, name: feed.name, icon: feed.icon }))
