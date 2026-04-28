import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Network,
  Globe,
  Terminal,
  ShieldAlert,
  ExternalLink,
  Sparkles,
  Layers,
  Cpu,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Card descriptions                                                  */
/* ------------------------------------------------------------------ */

interface CardInfo {
  icon: React.ReactNode
  title: string
  tool: string
  description: string
  dashboard: string
}

const CARDS: CardInfo[] = [
  {
    icon: <Network className="w-5 h-5 text-blue-400" />,
    title: 'Network Trace',
    tool: 'trace_tcp',
    description: 'Real-time pod-to-pod TCP connections. See source/destination pods, ports, bytes transferred, and protocol — enriched with Kubernetes metadata.',
    dashboard: 'Network',
  },
  {
    icon: <Globe className="w-5 h-5 text-green-400" />,
    title: 'DNS Trace',
    tool: 'trace_dns',
    description: 'DNS query monitoring per pod with response codes and latency. Instantly spot NXDOMAIN failures, slow lookups, and misconfigured service discovery.',
    dashboard: 'Network',
  },
  {
    icon: <Terminal className="w-5 h-5 text-yellow-400" />,
    title: 'Process Trace',
    tool: 'trace_exec',
    description: 'Process execution events with binary paths, arguments, and UIDs. Detect unexpected binaries running inside containers.',
    dashboard: 'Security & Events',
  },
  {
    icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
    title: 'Security Audit',
    tool: 'audit_seccomp',
    description: 'Seccomp violations and Linux capability checks. See which syscalls are being denied and which pods are attempting privileged operations.',
    dashboard: 'Security & Events',
  },
]

/* ------------------------------------------------------------------ */
/*  How it works section                                               */
/* ------------------------------------------------------------------ */

interface Step {
  number: number
  title: string
  description: string
}

const HOW_IT_WORKS: Step[] = [
  {
    number: 1,
    title: 'Inspektor Gadget runs as a DaemonSet',
    description: 'IG deploys eBPF programs on each node to capture kernel-level events — syscalls, network connections, DNS lookups, process executions — all enriched with pod/namespace/container metadata automatically.',
  },
  {
    number: 2,
    title: 'ig-mcp-server bridges to the console',
    description: 'The console connects to ig-mcp-server via the same MCP protocol used for kubestellar-ops and kubestellar-deploy. Each IG gadget becomes a callable tool.',
  },
  {
    number: 3,
    title: 'Dashboard cards visualize eBPF data',
    description: 'Four dedicated cards surface network traces, DNS queries, process executions, and security audit events — with real-time updates, cluster filtering, and demo data fallback.',
  },
  {
    number: 4,
    title: 'Investigation runbooks use IG as evidence',
    description: 'When AI diagnosis runs on an alert, runbooks can include optional IG evidence steps (DNS traces, process traces) alongside kubectl data — giving the LLM kernel-level context for root cause analysis.',
  },
]

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export function FeatureInspektorGadget() {
  useEffect(() => {
    document.title = 'KubeStellar Console — Inspektor Gadget Integration'
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            <Cpu className="w-4 h-4" />
            Powered by Inspektor Gadget
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            eBPF observability{' '}
            <span className="bg-linear-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              in your dashboard
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
            KubeStellar Console integrates with{' '}
            <a href="https://inspektor-gadget.io" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
              Inspektor Gadget
            </a>
            {' '}to surface kernel-level network, DNS, process, and security data —
            with zero application instrumentation.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
            >
              See it in action
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/inspektor-gadget/inspektor-gadget"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
            >
              Inspektor Gadget
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* What it surfaces */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Dashboard cards powered by eBPF
        </h2>
        <p className="text-slate-400 text-center mb-12">
          Each card uses a specific Inspektor Gadget tool via the MCP bridge.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {CARDS.map(({ icon, title, tool, description, dashboard }) => (
            <div key={title} className="p-6 rounded-xl border border-slate-700/50 bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                {icon}
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <span className="text-xs text-slate-500 font-mono">{tool}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-3">{description}</p>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Layers className="w-3 h-3" />
                {dashboard} dashboard
              </span>
            </div>
          ))}
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
              <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-bold text-sm flex items-center justify-center shrink-0">
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

      {/* Why this matters */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="p-8 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <h2 className="text-2xl font-bold mb-4">Why eBPF in your dashboard?</h2>
          <div className="space-y-3 text-sm text-slate-400">
            <p>
              Traditional dashboards show Kubernetes API-level state: pods, events, deployments.
              But many failures happen below that layer — TCP connection timeouts, DNS resolution failures,
              unexpected process executions, syscall violations.
            </p>
            <p>
              Inspektor Gadget captures these kernel-level events using eBPF and enriches them with
              Kubernetes metadata (pod names, namespaces, labels). The console surfaces this data
              alongside your existing monitoring — giving you full-stack visibility from kernel to application.
            </p>
            <p>
              Best of all: zero instrumentation. eBPF works on any binary, any language, any container —
              including third-party images you can't modify.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-blue-500 text-white font-medium text-lg hover:bg-blue-600 transition-colors"
        >
          <Sparkles className="w-5 h-5" />
          Open the Console
        </Link>
      </section>
    </div>
  )
}
