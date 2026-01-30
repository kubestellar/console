import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  ArrowUpCircle,
  Search,
  Wrench,
  Rocket,
  Sparkles,
  Hammer,
} from 'lucide-react'
import type { Mission, MissionStatus, MissionMessage } from '../../../hooks/useMissions'

// Rotating status messages for agent thinking
export const THINKING_MESSAGES = [
  'Analyzing clusters...',
  'Checking resources...',
  'Reviewing configurations...',
  'Processing request...',
  'Generating response...',
  'Evaluating options...',
  'Inspecting workloads...',
  'Gathering data...',
]

export const STATUS_CONFIG: Record<MissionStatus, { icon: typeof Loader2; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Starting...' },
  running: { icon: Loader2, color: 'text-blue-400', label: 'Running' },
  waiting_input: { icon: MessageSquare, color: 'text-purple-400', label: 'Waiting for input' },
  completed: { icon: CheckCircle, color: 'text-green-400', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-400', label: 'Failed' },
}

export const TYPE_ICONS: Record<Mission['type'], typeof ArrowUpCircle> = {
  upgrade: ArrowUpCircle,
  troubleshoot: Wrench,
  analyze: Search,
  deploy: Rocket,
  repair: Hammer,
  custom: Sparkles,
}

export type FontSize = 'sm' | 'base' | 'lg'

export const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  sm: 'text-xs prose-sm',
  base: 'text-sm prose-sm',
  lg: 'text-base prose-base'
}

// Detect if message content indicates agent is working on something
export function detectWorkingIndicator(content: string): string | null {
  const patterns = [
    { regex: /I'll\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute)/i, action: 'Working' },
    { regex: /Let me\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute|try)/i, action: 'Working' },
    { regex: /I('m| am)\s+(going to|now|currently)\s+(check|look|analyze|investigate|examine|review|search|find|get|fetch|run|execute)/i, action: 'Working' },
    { regex: /I('m| am)\s+(checking|looking|analyzing|investigating|examining|reviewing|searching|finding|getting|fetching|running|executing|attempting)/i, action: 'In progress' },
    { regex: /working on/i, action: 'Working' },
    { regex: /one moment/i, action: 'Working' },
    { regex: /give me a (moment|second|minute)/i, action: 'Working' },
    { regex: /stand by/i, action: 'Working' },
    { regex: /please wait/i, action: 'Executing' },
    { regex: /attempting to execute/i, action: 'Executing' },
  ]

  for (const { regex, action } of patterns) {
    if (regex.test(content)) {
      return action
    }
  }
  return null
}

// Extract the last paragraph that contains an input request for highlighting
export function extractInputRequestParagraph(content: string): { before: string; request: string } | null {
  const lines = content.split('\n')
  // Look for the last line/paragraph that contains a question
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line && (line.endsWith('?') || /should I|would you|do you want|shall I|please confirm/i.test(line))) {
      return {
        before: lines.slice(0, i).join('\n'),
        request: lines.slice(i).join('\n')
      }
    }
  }
  return null
}

// Memoized message component props
export interface MessageProps {
  msg: MissionMessage
  missionAgent?: string
  isFullScreen: boolean
  fontSize: FontSize
  isLastAssistantMessage?: boolean
  missionStatus?: string
}
