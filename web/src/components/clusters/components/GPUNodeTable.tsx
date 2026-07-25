import { Server } from 'lucide-react'

interface GPUNodeTableProps {
  nodes: Array<{
    name: string
    gpuCount: number
    gpuType: string
    allocated: number
  }>
}

export function GPUNodeTable({ nodes }: GPUNodeTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="px-4 py-2 text-left font-medium text-foreground">Node</th>
            <th className="px-4 py-2 text-left font-medium text-foreground">Type</th>
            <th className="px-4 py-2 text-right font-medium text-foreground">Count</th>
            <th className="px-4 py-2 text-right font-medium text-foreground">Allocated</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.name} className="border-b border-border hover:bg-secondary/20 transition-colors">
              <td className="px-4 py-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                {node.name}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{node.gpuType}</td>
              <td className="px-4 py-2 text-right font-mono">{node.gpuCount}</td>
              <td className="px-4 py-2 text-right font-mono text-purple-400">{node.allocated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
