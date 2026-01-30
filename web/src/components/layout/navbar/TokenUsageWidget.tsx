import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins } from 'lucide-react'
import { useTokenUsage } from '../../../hooks/useTokenUsage'
import { cn } from '../../../lib/cn'

export function TokenUsageWidget() {
  const navigate = useNavigate()
  const { usage, alertLevel, percentage, remaining } = useTokenUsage()
  const [showTokenDetails, setShowTokenDetails] = useState(false)
  const [tokenAnimating, setTokenAnimating] = useState(false)
  const previousTokensRef = useRef<number>(usage.used)
  const tokenRef = useRef<HTMLDivElement>(null)

  // Animate token icon when usage increases significantly
  useEffect(() => {
    const increase = usage.used - previousTokensRef.current
    // Trigger animation if tokens increased by more than 100 (lowered for better visibility)
    if (increase > 100) {
      setTokenAnimating(true)
      const timer = setTimeout(() => setTokenAnimating(false), 2000)
      return () => clearTimeout(timer)
    }
    previousTokensRef.current = usage.used
  }, [usage.used])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenRef.current && !tokenRef.current.contains(event.target as Node)) {
        setShowTokenDetails(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={tokenRef}>
      <button
        onClick={() => setShowTokenDetails(!showTokenDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
          alertLevel === 'stopped'
            ? 'bg-red-500/20 text-red-400'
            : alertLevel === 'critical'
            ? 'bg-red-500/10 text-red-400'
            : alertLevel === 'warning'
            ? 'bg-yellow-500/10 text-yellow-400'
            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
        }`}
        title={`Token usage: ${percentage.toFixed(0)}%`}
      >
        <Coins className={cn("w-4 h-4 transition-transform", tokenAnimating && "animate-bounce text-yellow-400 scale-125")} />
        <span className="text-xs font-medium hidden sm:inline">{percentage.toFixed(0)}%</span>
        <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden hidden sm:block">
          <div
            className={`h-full transition-all ${
              alertLevel === 'stopped' || alertLevel === 'critical'
                ? 'bg-red-500'
                : alertLevel === 'warning'
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </button>

      {/* Token details dropdown */}
      {showTokenDetails && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl p-4 z-50">
          <h4 className="text-sm font-medium text-foreground mb-3">Token Usage</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Used</span>
              <span className="text-foreground font-mono">{usage.used.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Limit</span>
              <span className="text-foreground font-mono">{usage.limit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Remaining</span>
              <span className="text-foreground font-mono">{remaining.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all ${
                  alertLevel === 'stopped' || alertLevel === 'critical'
                    ? 'bg-red-500'
                    : alertLevel === 'warning'
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className={`${
                alertLevel === 'stopped'
                  ? 'text-red-400 font-medium'
                  : alertLevel === 'critical'
                  ? 'text-red-400'
                  : alertLevel === 'warning'
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }`}>
                {alertLevel === 'stopped'
                  ? 'AI Disabled'
                  : alertLevel === 'critical'
                  ? 'Critical'
                  : alertLevel === 'warning'
                  ? 'Warning'
                  : 'Normal'}
              </span>
              <span className="text-muted-foreground">
                Resets {new Date(usage.resetDate).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <button
              onClick={() => navigate('/settings')}
              className="w-full text-xs text-purple-400 hover:text-purple-300 text-center"
            >
              Configure limits in Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
