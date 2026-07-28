import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mission, MissionMessage } from '../../../../../hooks/useMissions'
import { FULLSCREEN_SCROLL_DELAY_MS, SCROLL_BOTTOM_THRESHOLD_PX } from '../missionChatConstants'

interface UseMissionChatScrollParams {
  mission: Mission
  missionMessages: MissionMessage[]
  isFullScreen: boolean
}

/**
 * Owns all scroll-position concerns for the mission chat: the container/content/end
 * refs, the auto-scroll flag, and the effects that keep the transcript pinned to the
 * bottom as new messages arrive, content resizes, or full-screen is toggled.
 */
export function useMissionChatScroll({ mission, missionMessages, isFullScreen }: UseMissionChatScrollParams) {
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(missionMessages.length)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: 'end', behavior })
    } else {
      container.scrollTo({
        top: Math.max(container.scrollHeight - container.clientHeight, 0),
        behavior,
      })
    }
    setShouldAutoScroll(true)
  }, [])

  useEffect(() => {
    const messageCount = missionMessages.length
    const hasNewMessages = messageCount > lastMessageCountRef.current
    lastMessageCountRef.current = messageCount

    if (!shouldAutoScroll) return

    const frame = requestAnimationFrame(() => {
      scrollToBottom(hasNewMessages ? 'smooth' : 'auto')
    })

    return () => cancelAnimationFrame(frame)
  }, [mission.updatedAt, missionMessages.length, scrollToBottom, shouldAutoScroll])

  useEffect(() => {
    if (!shouldAutoScroll || typeof ResizeObserver === 'undefined') return

    const content = messagesContentRef.current
    if (!content) return

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => scrollToBottom('auto'))
    })

    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom, shouldAutoScroll])

  useEffect(() => {
    if (!isFullScreen) return

    const id = setTimeout(() => {
      scrollToBottom('smooth')
    }, FULLSCREEN_SCROLL_DELAY_MS)

    return () => clearTimeout(id)
  }, [isFullScreen, scrollToBottom])

  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    return container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX
  }, [])

  const handleScroll = useCallback(() => {
    setShouldAutoScroll(isAtBottom())
  }, [isAtBottom])

  return {
    messagesContainerRef,
    messagesContentRef,
    messagesEndRef,
    shouldAutoScroll,
    scrollToBottom,
    handleScroll,
  }
}
