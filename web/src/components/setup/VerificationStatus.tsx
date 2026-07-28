import { Check, Copy } from 'lucide-react'

interface VerificationStatusProps {
  isVerified: boolean
  className?: string
}

export function VerificationStatus({ isVerified, className }: VerificationStatusProps) {
  if (isVerified) {
    return <Check className={className || 'w-3.5 h-3.5 text-green-400'} />
  }
  return <Copy className={className || 'w-3.5 h-3.5'} />
}
