import { Gauge } from '../charts'
import { Cpu, HardDrive, MemoryStick } from 'lucide-react'

// Demo data - would come from MCP in production
const resourceData = {
  cpu: { used: 67, total: 100 },
  memory: { used: 78, total: 100 },
  storage: { used: 45, total: 100 },
}

export function ResourceUsage() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-muted-foreground">
          Resource Usage
        </span>
      </div>

      <div className="flex-1 flex items-center justify-around">
        <div className="flex flex-col items-center">
          <Gauge
            value={resourceData.cpu.used}
            max={resourceData.cpu.total}
            size="md"
            thresholds={{ warning: 70, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-muted-foreground">CPU</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Gauge
            value={resourceData.memory.used}
            max={resourceData.memory.total}
            size="md"
            thresholds={{ warning: 75, critical: 90 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <MemoryStick className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">Memory</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <Gauge
            value={resourceData.storage.used}
            max={resourceData.storage.total}
            size="md"
            thresholds={{ warning: 80, critical: 95 }}
          />
          <div className="flex items-center gap-1.5 mt-2">
            <HardDrive className="w-4 h-4 text-green-400" />
            <span className="text-sm text-muted-foreground">Storage</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Total CPU</p>
          <p className="text-sm font-medium text-white">48 cores</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total RAM</p>
          <p className="text-sm font-medium text-white">256 GB</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Storage</p>
          <p className="text-sm font-medium text-white">2 TB</p>
        </div>
      </div>
    </div>
  )
}
