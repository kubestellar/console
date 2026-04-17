import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../config/routes'
import {
  ArrowRight,
  ExternalLink,
  Sparkles,
  MessageSquare,
  Wrench,
  CloudOff,
  GitBranch,
} from 'lucide-react'
import { emitPageView } from '../lib/analytics'

/* ------------------------------------------------------------------ */
/*  How it works steps                                                 */
/* ------------------------------------------------------------------ */

interface Step {
  number: number
  title: string
  description: string
}

const HOW_IT_WORKS: Step[] = [
  {
    number: 1,
    title: 'Install kagent in your cluster',
    description: 'Deploy kagent via Helm. It runs as a Kubernetes-native controller that manages AI agent lifecycles, tools, and model configurations as custom resources.',
  },
  {
    number: 2,
    title: 'Define agents with CRDs',
    description: 'Create Agent custom resources that specify which LLM to use, which tools to attach (kubectl, Helm, Prometheus, Istio), and how agents collaborate.',
  },
  {
    number: 3,
    title: 'Console auto-detects kagent',
    description: 'The console discovers kagent agents via the A2A (Agent-to-Agent) protocol. No manual configuration needed — agents appear automatically in the chat interface.',
  },
  {
    number: 4,
    title: 'Chat with agents from the console',
    description: 'Stream conversations with kagent agents directly through the console. Agents execute Kubernetes operations, query metrics, and coordinate with other agents on your behalf.',
  },
]

/* ------------------------------------------------------------------ */
/*  Capabilities grid                                                  */
/* ------------------------------------------------------------------ */

interface Capability {
  icon: React.ReactNode
  title: string
  description: string
}

const CAPABILITIES: Capability[] = [
  {
    icon: <MessageSquare className="w-5 h-5 text-purple-400" />,
    title: 'Agent Chat via A2A',
    description: 'Stream conversations with kagent agents through the console. The A2A protocol provides standardized agent discovery, task management, and streaming responses.',
  },
  {
    icon: <Wrench className="w-5 h-5 text-purple-400" />,
    title: '253+ Kubernetes Tools',
    description: 'Built-in kubectl-mcp-server provides comprehensive Kubernetes access. Agents can run kubectl commands, manage Helm releases, query Prometheus, and configure Istio.',
  },
  {
    icon: <CloudOff className="w-5 h-5 text-purple-400" />,
    title: 'No Local Agent Required',
    description: 'Run AI missions without kc-agent on your machine. Kagent agents live in the cluster, so the console connects remotely — ideal for shared environments and CI/CD.',
  },
  {
    icon: <GitBranch className="w-5 h-5 text-purple-400" />,
    title: 'Multi-Agent Orchestration',
    description: 'Agents can call other agents as tools. Define specialized agents for monitoring, deployment, and security — then orchestrate them from a single conversation.',
  },
]

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export function FeatureKagent() {
  useEffect(() => {
    document.title = 'KubeStellar Console — Kagent Integration'
    emitPageView('/feature-kagent')
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            CNCF Sandbox Project
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Kagent{' '}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Integration
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
            Connect the console to{' '}
            <a href="https://kagent.dev" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
              kagent
            </a>
            {' '} — a Kubernetes-native AI agent framework that brings intelligent
            automation directly into your cluster. Define agents as CRDs, equip them
            with 253+ k8s tools, and chat with them from the console.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to={ROUTES.SETTINGS}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition-colors"
            >
              Configure in Settings
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://kagent.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-muted-foreground font-medium hover:bg-secondary transition-colors"
            >
              kagent.dev
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          How the integration works
        </h2>
        <div className="space-y-6">
          {HOW_IT_WORKS.map(({ number, title, description }) => (
            <div key={number} className="flex gap-4 p-5 rounded-xl border border-slate-700/50 bg-slate-900/30">
              <span className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 font-bold text-sm flex items-center justify-center flex-shrink-0">
                {number}
              </span>
              <div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-slate-400">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities grid */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Capabilities
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Kagent brings Kubernetes-native AI agents to the console.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {CAPABILITIES.map(({ icon, title, description }) => (
            <div key={title} className="p-6 rounded-xl border border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                {icon}
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            to={ROUTES.SETTINGS}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-purple-500 text-white font-medium text-lg hover:bg-purple-600 transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            Configure Kagent
          </Link>
          <a
            href="https://kagent.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg border border-slate-700 text-slate-300 font-medium text-lg hover:bg-slate-800 transition-colors"
          >
            Read the Docs
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </section>
    </div>
  )
}
