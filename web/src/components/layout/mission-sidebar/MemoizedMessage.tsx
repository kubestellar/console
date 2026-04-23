import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Loader2,
  AlertCircle,
  User,
  Settings,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '../../../lib/cn'
import { AgentIcon } from '../../agent/AgentIcon'
import { buildReleaseNotesComponents } from '../../../lib/markdown/releaseNotesComponents'
import {
  FONT_SIZE_CLASSES,
  detectWorkingIndicator,
  extractInputRequestParagraph,
} from './types'
import type { MessageProps } from './types'

// Memoized message component to prevent re-renders on scroll
export const MemoizedMessage = memo(function MemoizedMessage({ msg, missionAgent, isFullScreen, fontSize, isLastAssistantMessage, missionStatus, userAvatarUrl }: MessageProps) {
  // Memoize the parsed content to avoid re-parsing on every render
  const parsedContent = useMemo(() => {
    if (msg.role !== 'assistant') return null
    return extractInputRequestParagraph(msg.content)
  }, [msg.content, msg.role])

  // Memoize markdown components — base typography from the shared
  // releaseNotesComponents, with a mission-sidebar-specific `a` override
  // that renders internal routes as yellow Link buttons with a Settings icon.
  const markdownComponents = useMemo(() => ({
    ...buildReleaseNotesComponents(fontSize),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      // Block javascript: and other dangerous URI schemes to prevent XSS (#5808)
      const safeHref = href && /^(https?:|\/|mailto:|#)/i.test(href) ? href : undefined
      if (safeHref?.startsWith('/')) {
        return (
          <Link to={safeHref} className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30 rounded text-xs font-medium transition-colors no-underline">
            <Settings className="w-3 h-3" />{children}
          </Link>
        )
      }
      if (!safeHref) {
        return <span className="text-muted-foreground">{children}</span>
      }
      return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300">{children}</a>
    },
  }), [fontSize])

  const proseClasses = cn(
    "prose dark:prose-invert max-w-none overflow-x-auto overflow-y-hidden",
    "prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 prose-pre:overflow-x-auto",
    "prose-code:text-purple-700 dark:prose-code:text-purple-300 prose-code:bg-black/5 dark:prose-code:bg-black/20 prose-code:px-1 prose-code:rounded prose-code:break-all",
    "prose-hr:my-6",
    "prose-strong:text-foreground prose-strong:font-semibold",
    "prose-blockquote:border-yellow-500/50 prose-blockquote:bg-yellow-500/5",
    "wrap-break-word [word-break:break-word]",
    FONT_SIZE_CLASSES[fontSize],
    msg.role === 'system' ? 'text-yellow-700 dark:text-yellow-200' : 'text-foreground'
  )

  const agentProvider = useMemo(() => {
    const agent = msg.agent || missionAgent
    switch (agent) {
      case 'claude': return 'anthropic'
      case 'openai': return 'openai'
      case 'gemini': return 'google'
      case 'bob': return 'bob'
      case 'claude-code': return 'anthropic-local'
      default: return agent || 'anthropic'
    }
  }, [msg.agent, missionAgent])

  return (
    <div className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        msg.role === 'user' ? 'bg-primary/20' : msg.role === 'assistant' ? 'bg-purple-500/20' : 'bg-yellow-500/20'
      )}>
        {msg.role === 'user' ? (
          userAvatarUrl ? (
            <img src={userAvatarUrl} alt="User avatar" className="w-8 h-8 rounded-full" />
          ) : (
            <User className="w-4 h-4 text-primary" />
          )
        ) : msg.role === 'assistant' ? (
          <AgentIcon provider={agentProvider} className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-400" />
        )}
      </div>
      <div className={cn(
        'flex-1 rounded-lg p-3 min-w-0',
        msg.role === 'user'
          ? cn('bg-secondary ml-auto overflow-hidden', isFullScreen ? 'max-w-[85%]' : 'max-w-[80%]')
          : msg.role === 'assistant'
            ? 'bg-card border border-border overflow-x-auto'
            : 'bg-yellow-950 border border-yellow-500/30 overflow-x-auto'
      )}>
        {msg.role === 'assistant' || msg.role === 'system' ? (
          parsedContent ? (
            <div className="space-y-4">
              {parsedContent.before && (
                <div className={proseClasses}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
                    {parsedContent.before.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              )}
              <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className={cn(proseClasses, "text-purple-700 dark:text-purple-200")}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
                    {parsedContent.request.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className={proseClasses}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
                {msg.content.replace(/\r\n/g, '\n')}
              </ReactMarkdown>
            </div>
          )
        ) : (
          <p className={cn("text-foreground whitespace-pre-wrap", FONT_SIZE_CLASSES[fontSize].split(' ')[0])}>{msg.content}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xs text-muted-foreground">
            {msg.timestamp.toLocaleTimeString()}
          </span>
          {/* Show working indicator if this is the last assistant message, mission is running, and content indicates work */}
          {isLastAssistantMessage && missionStatus === 'running' && msg.role === 'assistant' && detectWorkingIndicator(msg.content) && (
            <span className="flex items-center gap-1 text-2xs text-blue-400 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              {detectWorkingIndicator(msg.content)}...
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
