import { CheckCircle, XCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react'

type Status = 'healthy' | 'error' | 'warning' | 'pending' | 'loading' | 'unknown'

interface StatusIndicatorProps {
  status: Status
  label?: string
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  pulse?: boolean
}

const statusConfig: Record<Status, {
  icon: typeof CheckCircle
  color: string
  bg: string
  label: string
}> = {
  healthy: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500', label: 'Healthy' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500', label: 'Error' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'Warning' },
  pending: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500', label: 'Pending' },
  loading: { icon: Loader2, color: 'text-purple-400', bg: 'bg-purple-500', label: 'Loading' },
  unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500', label: 'Unknown' },
}

const sizes = {
  sm: { icon: 'w-3 h-3', dot: 'w-2 h-2', text: 'text-xs' },
  md: { icon: 'w-4 h-4', dot: 'w-2.5 h-2.5', text: 'text-sm' },
  lg: { icon: 'w-5 h-5', dot: 'w-3 h-3', text: 'text-base' },
}

export function StatusIndicator({
  status,
  label,
  size = 'md',
  showLabel = true,
  pulse = false,
}: StatusIndicatorProps) {
  const config = statusConfig[status]
  const sizeConfig = sizes[size]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Icon
          className={`${sizeConfig.icon} ${config.color} ${
            status === 'loading' ? 'animate-spin' : ''
          }`}
        />
        {pulse && status === 'healthy' && (
          <span className={`absolute inset-0 ${config.bg} rounded-full animate-ping opacity-30`} />
        )}
      </div>
      {showLabel && (
        <span className={`${sizeConfig.text} text-muted-foreground`}>
          {label || config.label}
        </span>
      )}
    </div>
  )
}

// Simple dot indicator
interface StatusDotProps {
  status: Status
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}

export function StatusDot({ status, size = 'md', pulse = false }: StatusDotProps) {
  const config = statusConfig[status]
  const sizeConfig = sizes[size]

  return (
    <div className="relative">
      <div className={`${sizeConfig.dot} ${config.bg} rounded-full`} />
      {pulse && (
        <span
          className={`absolute inset-0 ${config.bg} rounded-full animate-ping opacity-50`}
        />
      )}
    </div>
  )
}

// Boolean switch display
interface BooleanSwitchProps {
  value: boolean
  label?: string
  trueLabel?: string
  falseLabel?: string
  size?: 'sm' | 'md' | 'lg'
}

export function BooleanSwitch({
  value,
  label,
  trueLabel = 'On',
  falseLabel = 'Off',
  size = 'md',
}: BooleanSwitchProps) {
  const widths = { sm: 'w-8', md: 'w-10', lg: 'w-12' }
  const heights = { sm: 'h-4', md: 'h-5', lg: 'h-6' }
  const dotSizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className={`${textSizes[size]} text-muted-foreground`}>{label}</span>
      )}
      <div
        className={`${widths[size]} ${heights[size]} rounded-full relative transition-colors ${
          value ? 'bg-green-500' : 'bg-secondary'
        }`}
      >
        <div
          className={`${dotSizes[size]} bg-white rounded-full absolute top-0.5 transition-transform ${
            value ? 'translate-x-full -ml-0.5' : 'translate-x-0.5'
          }`}
        />
      </div>
      <span className={`${textSizes[size]} ${value ? 'text-green-400' : 'text-muted-foreground'}`}>
        {value ? trueLabel : falseLabel}
      </span>
    </div>
  )
}

// State machine display
interface State {
  id: string
  label: string
  status: Status
}

interface StateMachineProps {
  states: State[]
  currentState: string
  title?: string
}

export function StateMachine({ states, currentState, title }: StateMachineProps) {
  return (
    <div>
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-3">{title}</h4>
      )}
      <div className="flex items-center gap-1">
        {states.map((state, index) => {
          const isCurrent = state.id === currentState
          const isPast = states.findIndex((s) => s.id === currentState) > index
          const config = statusConfig[state.status]

          return (
            <div key={state.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCurrent
                      ? `${config.bg} border-transparent`
                      : isPast
                      ? 'bg-green-500/20 border-green-500'
                      : 'bg-secondary border-border'
                  }`}
                >
                  {isPast && !isCurrent ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <span
                      className={`text-xs font-medium ${
                        isCurrent ? 'text-white' : 'text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    isCurrent ? 'text-white' : 'text-muted-foreground'
                  }`}
                >
                  {state.label}
                </span>
              </div>
              {index < states.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    isPast ? 'bg-green-500' : 'bg-border'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
