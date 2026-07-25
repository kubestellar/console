import {
  Server, Database, Cpu, MemoryStick, HardDrive, Zap,
  CheckCircle2, XCircle, AlertTriangle, Activity, BarChart3,
  Layers, Box, Shield, Lock, Globe, Cloud, GitBranch,
  Terminal, Code, Wifi, WifiOff, Clock, Users,
  Gauge, TrendingUp, TrendingDown, ArrowUpRight, Flame,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Server, Database, Cpu, MemoryStick, HardDrive, Zap,
  CheckCircle2, XCircle, AlertTriangle, Activity, BarChart3,
  Layers, Box, Shield, Lock, Globe, Cloud, GitBranch,
  Terminal, Code, Wifi, WifiOff, Clock, Users,
  Gauge, TrendingUp, TrendingDown, ArrowUpRight, Flame,
  HelpCircle,
}

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? HelpCircle
}
