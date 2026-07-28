import { useState, useRef } from 'react'

export function useLazyMount(_rootMargin = '100px') {
  const [isVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  return { ref, isVisible }
}
