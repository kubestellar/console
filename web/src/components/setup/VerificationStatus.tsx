import { Check, Copy } from 'lucide-react'

interface VerificationStatusProps {
  copied: boolean
}

export function VerificationStatus({ copied }: VerificationStatusProps) {
  return copied ? (
    <Check className="w-3.5 h-3.5 text-green-400" />
  ) : (
    <Copy className="w-3.5 h-3.5" />
  )
}
