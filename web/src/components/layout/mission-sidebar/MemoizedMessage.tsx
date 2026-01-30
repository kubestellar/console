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
import { cn } from '../../../lib/cn'
import { AgentIcon } from '../../agent/AgentIcon'
import { CodeBlock } from '../../ui/CodeBlock'
import {
  FONT_SIZE_CLASSES,
  detectWorkingIndicator,
  extractInputRequestParagraph,
} from './types'
import type { MessageProps } from './types'

// Memoized message component to prevent re-renders on scroll
export const MemoizedMessage = memo(function MemoizedMessage({ msg, missionAgent, isFullScreen, fontSize, isLastAssistantMessage, missionStatus }: MessageProps) {
  // Memoize the parsed content to avoid re-parsing on every render
  const parsedContent = useMemo(() => {
    if (msg.role !== 'assistant') return null
    return extractInputRequestParagraph(msg.content)
  }, [msg.content, msg.role])

  // Memoize markdown components
  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: { className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match && !className
      return isInline ? (
        <code className={className} {...props}>{children}</code>
      ) : (
        <CodeBlock
          language={match?.[1] || 'text'}
          fontSize={fontSize}
        >
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      )
    },
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith('/')) {
        return (
          <Link to={href} className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 rounded text-xs font-medium transition-colors no-underline">
            <Settings className="w-3 h-3" />{children}
          </Link>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{children}</a>
    },
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mt-6 mb-3 pt-3 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-xl font-bold">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mt-6 mb-3 pt-3 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-lg font-bold">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mt-5 mb-2 pt-2 border-t border-border/20 first:border-t-0 first:pt-0 first:mt-0 text-base font-semibold">{children}</h3>,
    h4: ({ children }: { children?: React.ReactNode }) => <h4 className="mt-4 mb-2 font-semibold">{children}</h4>,
    h5: ({ children }: { children?: React.ReactNode }) => <h5 className="mt-4 mb-2 font-medium">{children}</h5>,
    h6: ({ children }: { children?: React.ReactNode }) => <h6 className="mt-3 mb-2 font-medium">{children}</h6>,
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-4 leading-relaxed">{children}</p>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-4 ml-4 list-disc space-y-2">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-4 ml-4 list-decimal space-y-2">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="my-1 leading-relaxed">{children}</li>,
  }), [fontSize])

  const proseClasses = cn(
    "prose prose-invert max-w-none overflow-hidden",
    "prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 prose-pre:overflow-x-auto",
    "prose-code:text-purple-300 prose-code:bg-black/20 prose-code:px-1 prose-code:rounded prose-code:break-all",
    "prose-hr:my-6",
    "break-words [word-break:break-word]",
    FONT_SIZE_CLASSES[fontSize],
    msg.role === 'system' ? 'text-yellow-200' : 'text-foreground'
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
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
        msg.role === 'user' ? 'bg-primary/20' : msg.role === 'assistant' ? 'bg-purple-500/20' : 'bg-yellow-500/20'
      )}>
        {msg.role === 'user' ? (
          <User className="w-4 h-4 text-primary" />
        ) : msg.role === 'assistant' ? (
          <AgentIcon provider={agentProvider} className="w-4 h-4" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-400" />
        )}
      </div>
      <div className={cn(
        'flex-1 rounded-lg p-3 overflow-hidden min-w-0',
        isFullScreen ? 'max-w-[98%]' : 'max-w-[85%]',
        msg.role === 'user' ? 'bg-primary/10 ml-auto' : msg.role === 'assistant' ? 'bg-secondary/50' : 'bg-yellow-500/10'
      )}>
        {msg.role === 'assistant' || msg.role === 'system' ? (
          parsedContent ? (
            <div className="space-y-4">
              {parsedContent.before && (
                <div className={proseClasses}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                    {parsedContent.before.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              )}
              <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className={cn(proseClasses, "text-purple-200")}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                    {parsedContent.request.replace(/\r\n/g, '\n')}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className={proseClasses}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                {msg.content.replace(/\r\n/g, '\n')}
              </ReactMarkdown>
            </div>
          )
        ) : (
          <p className={cn("text-foreground whitespace-pre-wrap", FONT_SIZE_CLASSES[fontSize].split(' ')[0])}>{msg.content}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {msg.timestamp.toLocaleTimeString()}
          </span>
          {/* Show working indicator if this is the last assistant message, mission is running, and content indicates work */}
          {isLastAssistantMessage && missionStatus === 'running' && msg.role === 'assistant' && detectWorkingIndicator(msg.content) && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              {detectWorkingIndicator(msg.content)}...
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
