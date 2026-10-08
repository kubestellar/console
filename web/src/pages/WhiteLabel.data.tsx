import {
  Sparkles,
  Palette,
  Layers,
  BarChart3,
  Shield,
  Puzzle } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Named constants — no magic numbers                                */
/* ------------------------------------------------------------------ */

/** Deployment option tab identifiers */
export type DeployTab = 'binary' | 'helm' | 'docker'

/** Ordered list of deployment tabs, used for arrow-key roving-tabindex navigation */
export const DEPLOY_TABS: readonly DeployTab[] = ['binary', 'helm', 'docker']

/* ------------------------------------------------------------------ */
/*  What You Get — feature highlights for white-label                 */
/* ------------------------------------------------------------------ */

export interface HighlightFeature {
  icon: React.ReactNode
  title: string
  description: string
}

export const HIGHLIGHTS: HighlightFeature[] = [
  {
    icon: <Palette className="w-6 h-6 text-purple-400" />,
    title: 'Full Branding Control',
    description: 'App name, logo, favicon, theme color, tagline — all configurable via env vars at runtime. No rebuilding required.' },
  {
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    title: 'Project-Scoped Features',
    description: 'Set CONSOLE_PROJECT to your project ID and only generic K8s dashboards + your project-specific cards appear. KubeStellar features disappear.' },
  {
    icon: <Puzzle className="w-6 h-6 text-purple-400" />,
    title: '150+ Cards, 30 Dashboards',
    description: 'Pods, Deployments, Services, Nodes, GPU, Storage, Network, Security, Cost, GitOps, Helm, Operators — all out of the box.' },
  {
    icon: <Sparkles className="w-6 h-6 text-purple-400" />,
    title: 'AI Missions',
    description: 'Natural-language cluster troubleshooting powered by Claude. Your users ask questions, get kubectl commands they can run.' },
  {
    icon: <BarChart3 className="w-6 h-6 text-purple-400" />,
    title: 'Your Own Analytics',
    description: 'Provide your own GA4 and Umami IDs, or leave them empty to disable telemetry entirely. Zero tracking by default.' },
  {
    icon: <Shield className="w-6 h-6 text-purple-400" />,
    title: 'Production-Ready',
    description: 'Helm chart with PVC persistence, RBAC, network policies, pod disruption budgets, and OpenShift Route support.' },
]

/* ------------------------------------------------------------------ */
/*  What's Included vs Hidden                                         */
/* ------------------------------------------------------------------ */

export interface VisibilityRow {
  feature: string
  universal: boolean
  kubeStellarOnly: boolean
}

export const VISIBILITY_DATA: VisibilityRow[] = [
  { feature: 'Pods, Deployments, Services, Nodes', universal: true, kubeStellarOnly: false },
  { feature: 'GPU Monitoring & Reservations', universal: true, kubeStellarOnly: false },
  { feature: 'Security Posture & Compliance', universal: true, kubeStellarOnly: false },
  { feature: 'Cost Analytics (OpenCost)', universal: true, kubeStellarOnly: false },
  { feature: 'GitOps (ArgoCD / Flux)', universal: true, kubeStellarOnly: false },
  { feature: 'Helm Management', universal: true, kubeStellarOnly: false },
  { feature: 'AI Missions (Claude)', universal: true, kubeStellarOnly: false },
  { feature: 'Operator Management', universal: true, kubeStellarOnly: false },
  { feature: 'Log Viewer', universal: true, kubeStellarOnly: false },
  { feature: 'Network & Storage Dashboards', universal: true, kubeStellarOnly: false },
  { feature: 'Benchmark Cards (llm-d)', universal: false, kubeStellarOnly: true },
  { feature: 'Deploy Missions & Cluster Groups', universal: false, kubeStellarOnly: true },
  { feature: 'Nightly E2E Status', universal: false, kubeStellarOnly: true },
  { feature: 'Kagenti Agent Cards', universal: false, kubeStellarOnly: true },
]

/* ------------------------------------------------------------------ */
/*  Branding env var reference                                        */
/* ------------------------------------------------------------------ */

export interface BrandingVar {
  envVar: string
  helmKey: string
  defaultValue: string
  description: string
}

export const BRANDING_VARS: BrandingVar[] = [
  { envVar: 'APP_NAME', helmKey: 'branding.appName', defaultValue: 'KubeStellar Console', description: 'Full app name shown in navbar & title' },
  { envVar: 'APP_SHORT_NAME', helmKey: 'branding.appShortName', defaultValue: 'KubeStellar', description: 'Compact name for sidebar & mobile' },
  { envVar: 'APP_TAGLINE', helmKey: 'branding.tagline', defaultValue: 'multi-cluster first...', description: 'Tagline below the app name' },
  { envVar: 'LOGO_URL', helmKey: 'branding.logoUrl', defaultValue: '/kubestellar-logo.svg', description: 'Logo image path or URL' },
  { envVar: 'FAVICON_URL', helmKey: 'branding.faviconUrl', defaultValue: '/favicon.ico', description: 'Browser tab favicon' },
  { envVar: 'THEME_COLOR', helmKey: 'branding.themeColor', defaultValue: '#7c3aed', description: 'PWA theme color' },
  { envVar: 'DOCS_URL', helmKey: 'branding.docsUrl', defaultValue: 'kubestellar.io/docs/...', description: 'Documentation link in navbar' },
  { envVar: 'COMMUNITY_URL', helmKey: 'branding.communityUrl', defaultValue: 'kubestellar.io/community', description: 'Community/support link' },
  { envVar: 'WEBSITE_URL', helmKey: 'branding.websiteUrl', defaultValue: 'kubestellar.io', description: 'Project website URL' },
  { envVar: 'ISSUES_URL', helmKey: 'branding.issuesUrl', defaultValue: 'github.com/.../issues/new', description: 'Bug report / feedback URL' },
  { envVar: 'REPO_URL', helmKey: 'branding.repoUrl', defaultValue: 'github.com/.../console', description: 'Source code repository' },
  { envVar: 'HOSTED_DOMAIN', helmKey: 'branding.hostedDomain', defaultValue: 'console.kubestellar.io', description: 'Domain for demo mode' },
]

/* ------------------------------------------------------------------ */
/*  Install steps for each deployment mode                            */
/* ------------------------------------------------------------------ */

export interface InstallStep {
  step: number
  title: string
  commands?: string[]
  note?: string
  description: string
}

export const BINARY_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Install and run with branding',
    commands: [
      'curl -sSL \\',
      '  https://raw.githubusercontent.com/kubestellar/console/main/start.sh \\',
      '  | CONSOLE_PROJECT=myproject \\',
      '    APP_NAME="My Project Console" \\',
      '    LOGO_URL="/custom-logos/my-logo.svg" \\',
      '    bash',
    ],
    description: 'Downloads pre-built binaries and starts the console with your branding. All env vars are optional — defaults to KubeStellar branding.' },
]

export const HELM_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Add the Helm repo',
    commands: [
      'helm repo add kubestellar-console https://kubestellar.github.io/console',
      'helm repo update',
    ],
    description: 'One-time setup. The chart is published to GitHub Pages.' },
  {
    step: 2,
    title: 'Install with your branding',
    commands: [
      'helm install my-console kubestellar-console/kubestellar-console \\',
      '  --set consoleProject=myproject \\',
      '  --set branding.appName="My Project Console" \\',
      '  --set branding.appShortName="MyProject" \\',
      '  --set branding.logoUrl="/custom-logos/my-logo.svg" \\',
      '  --set branding.docsUrl="https://docs.myproject.io" \\',
      '  --set branding.themeColor="#2563eb"',
    ],
    description: 'All branding values are optional. Omitted values use KubeStellar defaults. Set consoleProject to hide KubeStellar-specific features.' },
  {
    step: 3,
    title: 'Mount custom logos (optional)',
    commands: [
      '# Create a ConfigMap with your logo files',
      'kubectl create configmap my-logos --from-file=my-logo.svg=./logo.svg',
      '',
      '# Reference it in Helm values',
      'helm upgrade my-console kubestellar-console/kubestellar-console \\',
      '  --set branding.logoConfigMap=my-logos \\',
      '  --set branding.logoUrl="/custom-logos/my-logo.svg"',
    ],
    note: 'Logo files from the ConfigMap are mounted at /app/web/dist/custom-logos/ and served as static assets.',
    description: 'Use a ConfigMap to provide custom logo SVG/PNG files without rebuilding the image.' },
]

export const DOCKER_STEPS: InstallStep[] = [
  {
    step: 1,
    title: 'Run with Docker',
    commands: [
      'docker run -p 8080:8080 \\',
      '  -e CONSOLE_PROJECT=myproject \\',
      '  -e APP_NAME="My Project Console" \\',
      '  -e APP_SHORT_NAME="MyProject" \\',
      '  -e LOGO_URL="/custom-logos/my-logo.svg" \\',
      '  -e DOCS_URL="https://docs.myproject.io" \\',
      '  ghcr.io/kubestellar/console:latest',
    ],
    description: 'All configuration is via env vars. Mount a volume at /app/web/dist/custom-logos for custom logo files.' },
]

/* ------------------------------------------------------------------ */
/*  Helper components                                                 */
/* ------------------------------------------------------------------ */
