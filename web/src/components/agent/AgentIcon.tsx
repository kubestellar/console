import type { AgentProvider } from '../../types/agent'
import { useTranslation } from 'react-i18next'

interface AgentIconProps {
  provider: AgentProvider | string
  className?: string
}

export function AgentIcon({ provider, className = 'w-5 h-5' }: AgentIconProps) {
  const { t: _t } = useTranslation()
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
    case 'openai-cli':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Codex - OpenAI logo with terminal indicator */}
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z" fill="#10A37F" />
          <circle cx="18" cy="6" r="4" fill="#F59E0B" />
          <text x="18" y="8" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">&gt;</text>
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
    case 'google-cli':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Gemini CLI - star with terminal */}
          <path d="M12 2L9.19 9.19L2 12l7.19 2.81L12 22l2.81-7.19L22 12l-7.19-2.81L12 2z" fill="#4285F4" />
          <circle cx="18" cy="6" r="4" fill="#34A853" />
          <text x="18" y="8" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">&gt;</text>
        </svg>
      )
    case 'google-ag':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Antigravity - upward arrow with Google colors */}
          <path d="M12 2L9.19 9.19L2 12l7.19 2.81L12 22l2.81-7.19L22 12l-7.19-2.81L12 2z" fill="#EA4335" />
          <path d="M12 7l2 5h-4l2-5z" fill="white" />
        </svg>
      )
    case 'github':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* GitHub Copilot icon */}
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" fill="currentColor" />
        </svg>
      )
    case 'anysphere':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Cursor icon - stylized cursor/pointer */}
          <path d="M5 3l14 9-6 2-4 8-4-19z" fill="#6366F1" />
          <path d="M13 14l4-2-8-5 4 11 2-4h2z" fill="#818CF8" />
        </svg>
      )
    case 'microsoft':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* VS Code icon - simplified */}
          <path d="M17.583 2L7.258 10.2L3 7.608V16.392l4.258-2.592L17.583 22 21 20.4V3.6L17.583 2zM17 17.2l-7-5.2 7-5.2v10.4z" fill="#007ACC" />
        </svg>
      )
    case 'codeium':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Windsurf/Codeium icon - wave */}
          <path d="M2 12c2-4 5-6 8-6s4 2 6 2 4-2 6-2v4c-2 0-4 2-6 2s-4-2-6-2-6 2-8 6V12z" fill="#09B6A2" />
          <path d="M2 16c2-4 5-6 8-6s4 2 6 2 4-2 6-2v4c-2 0-4 2-6 2s-4-2-6-2-6 2-8 6V16z" fill="#09B6A2" opacity="0.5" />
        </svg>
      )
    case 'cline':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Cline icon - terminal with AI spark */}
          <rect x="2" y="4" width="20" height="16" rx="2" fill="#1A1A2E" />
          <path d="M6 10l3 2-3 2" stroke="#E94560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M12 14 H18" stroke="#E94560" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'jetbrains':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* JetBrains icon - square with JB */}
          <rect x="2" y="2" width="20" height="20" rx="2" fill="#000000" />
          <text x="6" y="16" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">JB</text>
        </svg>
      )
    case 'zed':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Zed icon - stylized Z */}
          <rect x="2" y="2" width="20" height="20" rx="4" fill="#3B82F6" />
          <path d="M7 8h10L7 16h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )
    case 'continue':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Continue icon - play/forward symbol */}
          <circle cx="12" cy="12" r="10" fill="#F97316" />
          <path d="M9 8l8 4-8 4V8z" fill="white" />
        </svg>
      )
    case 'raycast':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Raycast icon - ray burst */}
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#FF6363" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="12" r="3" fill="#FF6363" />
        </svg>
      )
    case 'open-webui':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Open WebUI icon - chat bubble with gear */}
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5A8.48 8.48 0 0 1 21 11v.5z" fill="#8B5CF6" />
          <circle cx="12" cy="11" r="2" fill="white" />
        </svg>
      )
    case 'bob':
      return (
        <svg className={className} viewBox="0 0 100 100" fill="none">
          {/* Bob icon - robot with hard hat and code brackets */}
          {/* Hard hat */}
          <ellipse cx="50" cy="22" rx="32" ry="18" fill="#4F46E5" />
          <rect x="18" y="20" width="64" height="8" rx="2" fill="#3730A3" />
          {/* Robot head/body */}
          <rect x="20" y="28" width="60" height="55" rx="12" fill="#F9FAFB" stroke="#E5E7EB" strokeWidth="2" />
          {/* Eyes */}
          <circle cx="38" cy="48" r="8" fill="#1F2937" />
          <circle cx="62" cy="48" r="8" fill="#4F46E5" />
          <circle cx="40" cy="46" r="2" fill="white" />
          <circle cx="64" cy="46" r="2" fill="white" />
          {/* Code brackets </> */}
          <path d="M35 62 L25 70 L35 78" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M65 62 L75 70 L65 78" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M45 60 L55 80" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Side panels (ears) */}
          <rect x="8" y="40" width="12" height="20" rx="3" fill="#9CA3AF" />
          <rect x="80" y="40" width="12" height="20" rx="3" fill="#9CA3AF" />
          {/* Hands at bottom */}
          <path d="M25 83 L25 92 Q25 96 29 96 L38 96" stroke="#9CA3AF" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M75 83 L75 92 Q75 96 71 96 L62 96" stroke="#9CA3AF" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      )
    case 'anthropic-local':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          {/* Claude Code local icon - A with terminal prompt */}
          <path d="M12.04 2L1 22h5.48l2.49-4.71h6.06L17.52 22H23L12.04 2zm-.09 5.65l2.67 5.05H9.28l2.67-5.05z" fill="#D97706" />
          <circle cx="18" cy="6" r="4" fill="#22C55E" />
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
