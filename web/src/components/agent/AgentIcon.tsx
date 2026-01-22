import type { AgentProvider } from '../../types/agent'

interface AgentIconProps {
  provider: AgentProvider | string
  className?: string
}

export function AgentIcon({ provider, className = 'w-5 h-5' }: AgentIconProps) {
  switch (provider) {
    case 'anthropic':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Claude/Anthropic icon - stylized A */}
          <path d="M12.04 2L1 22h5.48l2.49-4.71h6.06L17.52 22H23L12.04 2zm-.09 5.65l2.67 5.05H9.28l2.67-5.05z" fill="#D97706" />
        </svg>
      )
    case 'openai':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* OpenAI icon - simplified logo */}
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#10A37F" />
        </svg>
      )
    case 'google':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Google/Gemini icon - simplified star */}
          <path d="M12 2L9.19 9.19L2 12l7.19 2.81L12 22l2.81-7.19L22 12l-7.19-2.81L12 2z" fill="#4285F4" />
          <path d="M12 8l1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5L12 8z" fill="#34A853" />
        </svg>
      )
    default:
      // Generic AI/robot icon
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <circle cx="9" cy="14" r="2" />
          <circle cx="15" cy="14" r="2" />
          <path d="M9 4h6" />
          <path d="M12 4v4" />
        </svg>
      )
  }
}

// Export a component to show the agent name with icon
interface AgentBadgeProps {
  provider: AgentProvider | string
  name: string
  className?: string
}

export function AgentBadge({ provider, name, className = '' }: AgentBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 ${className}`}>
      <AgentIcon provider={provider} className="w-3.5 h-3.5" />
      {name}
    </span>
  )
}
