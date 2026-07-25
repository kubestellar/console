import { cn } from '../../lib/cn'

export function GaugeRow({label, value, max, unit}: {label: string; value?: number; max?: number; unit?: string}) {
  const pctVal = (value != null && max != null && max > 0) ? Math.round((value / max) * 100) : undefined
  const display = value != null ? max != null ? `${Math.round(value)} / ${max}${unit ?? ''}` : `${Math.round(value)}${unit ?? ''}` : max != null ? `— / ${max}${unit ?? ''}` : 'N/A'
  const barColorClass = pctVal != null ? pctVal >= 80 ? 'bg-red-500' : pctVal >= 50 ? 'bg-amber-500' : 'bg-green-500' : 'bg-slate-700 dark:bg-slate-600'

  return (<div className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span><span className="text-foreground tabular-nums">{display}{pctVal != null ? ` (${pctVal}%)` : ''}</span></div><div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">{pctVal != null && (<div className={cn('h-full rounded-full transition-all', barColorClass)} style={{width: `${pctVal}%`}} />)}</div></div>)
}
