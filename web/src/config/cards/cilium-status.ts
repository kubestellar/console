/**
 * Cilium Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const ciliumStatusConfig: UnifiedCardConfig = {
    type: 'cilium_status',
    title: 'Cilium',
    category: 'network',
    description: 'Cilium eBPF Data Plane status',
    icon: 'Network',
    iconColor: 'text-cyan-400',
    defaultWidth: 4,
    defaultHeight: 3,
    dataSource: { type: 'hook', hook: 'useCachedCiliumStatus' },
    isDemoData: false,
    isLive: true,
    content: {
        type: 'custom',
        componentName: 'CiliumStatus'
    }
}

export default ciliumStatusConfig
