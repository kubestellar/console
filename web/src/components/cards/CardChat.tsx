import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, Bot, User, Copy, CheckCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  action?: {
    type: 'config_change' | 'filter' | 'drill_down' | 'command'
    payload: Record<string, unknown>
  }
}

interface CardChatProps {
  isOpen: boolean
  cardId: string
  cardType: string
  cardTitle: string
  messages: ChatMessage[]
  onClose: () => void
  onSendMessage: (message: string) => Promise<ChatMessage>
  onApplyAction?: (action: ChatMessage['action']) => void
}

const QUICK_PROMPTS: Record<string, string[]> = {
  cluster_health: [
    "Show only unhealthy clusters",
    "Why is this cluster unhealthy?",
    "Alert me when status changes",
    "Focus on production clusters",
  ],
  event_stream: [
    "Show only warnings and errors",
    "Filter to this namespace",
    "Explain this error",
    "Find related events",
  ],
  pod_issues: [
    "Why is this pod crashing?",
    "Show pods with high restarts",
    "How do I fix OOMKilled?",
    "Filter by cluster",
  ],
  resource_usage: [
    "Show percentage instead",
    "Which pods use most CPU?",
    "Alert when usage is high",
    "Compare across clusters",
  ],
  deployment_status: [
    "Why is this deployment stuck?",
    "Show rollout history",
    "How do I rollback?",
    "Filter by namespace",
  ],
  default: [
    "What am I looking at?",
    "Show me more details",
    "Filter this view",
    "Refresh data",
  ],
}

export function CardChat({
  isOpen,
  cardId: _cardId,
  cardType,
  cardTitle,
  messages,
  onClose,
  onSendMessage,
  onApplyAction,
}: CardChatProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const quickPrompts = QUICK_PROMPTS[cardType] || QUICK_PROMPTS.default

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [isOpen, messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    try {
      const response = await onSendMessage(userMessage)
      if (response.action && onApplyAction) {
        // Show that an action was taken
      }
    } catch (error) {
      console.error('Chat error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title="Chat with Card"
        description={cardTitle}
        icon={Bot}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="h-[50vh]">
        {/* Messages */}
        <div className="h-full overflow-y-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="w-12 h-12 text-purple-400 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">
                Ask me anything about this card. I can help you:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Modify what data is shown</li>
                <li>Drill down into specific items</li>
                <li>Explain what you're seeing</li>
                <li>Set up alerts and behaviors</li>
              </ul>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-3',
                  message.role === 'user'
                    ? 'bg-purple-500 text-foreground'
                    : 'bg-secondary/50 text-foreground'
                )}
              >
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                {message.action && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => onApplyAction?.(message.action)}
                      className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30"
                    >
                      Apply: {message.action.type.replace('_', ' ')}
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs opacity-50">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => handleCopy(message.id, message.content)}
                      className="p-1 rounded hover:bg-white/10"
                    >
                      {copiedId === message.id ? (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-50" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-purple-400" />
              </div>
              <div className="bg-secondary/50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="w-full space-y-3">
          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleQuickPrompt(prompt)}
                className="text-xs px-2 py-1 rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question or give a command..."
                className="w-full px-4 py-3 pr-12 rounded-xl bg-secondary border border-border text-foreground text-sm resize-none h-12 max-h-32"
                rows={1}
                disabled={isLoading}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                'p-3 rounded-xl transition-colors',
                input.trim() && !isLoading
                  ? 'bg-purple-500 text-foreground hover:bg-purple-600'
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
