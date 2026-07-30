import { AnchorHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react'

interface ExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> {
  href: string
  children: ReactNode
  className?: string
  showIcon?: boolean
}

/**
 * ExternalLink component for opening links in a new tab with proper security attributes.
 * Automatically adds target="_blank" and rel="noopener noreferrer" to prevent security issues.
 * 
 * @param href - The URL to link to
 * @param children - Link content
 * @param className - Additional CSS classes
 * @param showIcon - Whether to show the external link icon (default: false)
 */
export function ExternalLink({ 
  href, 
  children, 
  className, 
  showIcon = false,
  ...props 
}: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    >
      {children}
      {showIcon && <ExternalLinkIcon className="w-3 h-3" />}
    </a>
  )
}
