/** Shared CNCF styling constants used across Marketplace and Mission Browser */

export const CNCF_CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  'Observability': ['#3b82f6', '#06b6d4'],
  'Orchestration': ['#10b981', '#14b8a6'],
  'Runtime': ['#f59e0b', '#f97316'],
  'Provisioning': ['#ec4899', '#f43f5e'],
  'Security': ['#ef4444', '#dc2626'],
  'Service Mesh': ['#06b6d4', '#0ea5e9'],
  'App Definition': ['#8b5cf6', '#6366f1'],
  'Serverless': ['#a855f7', '#7c3aed'],
  'Storage': ['#84cc16', '#22c55e'],
  'Streaming': ['#f97316', '#eab308'],
  'Networking': ['#0ea5e9', '#3b82f6'],
}

export const CNCF_CATEGORY_ICONS: Record<string, string> = {
  'Observability': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'Orchestration': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'Runtime': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  'Provisioning': 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  'Security': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'Service Mesh': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'App Definition': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM2 8h20M8 2v4',
  'Serverless': 'M13 2L3 14h9l-1 8 10-12h-9l1-8',
  'Storage': 'M21 5c0 1.1-4 2-9 2S3 6.1 3 5m18 0c0-1.1-4-2-9-2S3 3.9 3 5m18 0v14c0 1.1-4 2-9 2s-9-.9-9-2V5m18 7c0 1.1-4 2-9 2s-9-.9-9-2',
  'Streaming': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'Networking': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
}

export const MATURITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  graduated: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', label: 'Graduated' },
  incubating: { color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30', label: 'Incubating' },
  sandbox: { color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', label: 'Sandbox' },
}

export const DIFFICULTY_CONFIG: Record<string, { color: string; bg: string }> = {
  beginner: { color: 'text-green-400', bg: 'bg-green-500/10' },
  intermediate: { color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  advanced: { color: 'text-red-400', bg: 'bg-red-500/10' },
}
