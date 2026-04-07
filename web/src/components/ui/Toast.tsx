import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { X, Check, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutsRef = useRef<Map<string, number>>(new Map())

  const toastCounter = useRef(0)
  const showToast = (message: string, type: ToastType = 'success') => {
    const id = `toast-${Date.now()}-${++toastCounter.current}`
    setToasts((prev) => {
      // Deduplicate: skip if an identical message+type is already visible
      if (prev.some(t => t.message === message && t.type === type)) return prev
      return [...prev, { id, message, type }]
    })

    // Auto-remove after 3 seconds (timeout is harmless if toast was deduplicated)
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      if (timeoutsRef.current.has(id)) {
        timeoutsRef.current.delete(id)
      }
    }, 3000)
    timeoutsRef.current.set(id, timeoutId)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    // Clear timeout if manually removed
    const timeoutId = timeoutsRef.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutsRef.current.delete(id)
    }
  }

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId))
      timeouts.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast flex flex-col items-center space-y-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onRemove: () => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const icons: Record<ToastType, ReactNode> = {
    success: <Check className="w-4 h-4" />,
    error: <X className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" /> }

  const colors: Record<ToastType, string> = {
    success: 'bg-green-900/80 border-green-400/70 text-green-100',
    error: 'bg-red-900/80 border-red-400/70 text-red-100',
    warning: 'bg-yellow-900/80 border-yellow-400/70 text-yellow-100',
    info: 'bg-blue-900/80 border-blue-400/70 text-blue-100' }

  const iconColors: Record<ToastType, string> = {
    success: 'text-green-300',
    error: 'text-red-300',
    warning: 'text-yellow-300',
    info: 'text-blue-300' }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg animate-fade-in-up min-w-[250px] max-w-[400px]',
        colors[toast.type]
      )}
    >
      <span className={iconColors[toast.type]}>{icons[toast.type]}</span>
      <span className="flex-1 text-sm">{toast.message}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="p-1 hover:bg-black/10 dark:hover:bg-white/10"
        aria-label="Dismiss notification"
        icon={<X className="w-3 h-3" aria-hidden="true" />}
      />
    </div>
  )
}
