/**
 * Static explainer shown at the top of the setup dialog: the hosted console is a
 * demo, and this is the data path once you run it locally.
 */
export function SetupArchitectureNote() {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
          <span className="text-blue-400 text-xs font-bold">i</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1.5">
          <p>
            <span className="text-blue-400 font-medium">console.kubestellar.io is a demo</span> — it shows sample data only.
            To monitor your real clusters, install the console locally or in a cluster:
          </p>
          <div className="font-mono text-[11px] text-foreground/60 leading-relaxed">
            <span className="text-blue-400">Browser</span>
            {' \u2192 '}
            <span className="text-purple-400">Frontend</span>
            {' \u2192 '}
            <span className="text-purple-400">Backend</span>
            {' \u2192 '}
            <span className="text-purple-400">kc-agent</span>
            {' \u2192 '}
            <span className="text-green-400">Your clusters</span>
          </div>
          <p className="text-muted-foreground/70">
            The kc-agent reads your kubeconfig and streams live data from all your clusters to the console.
          </p>
        </div>
      </div>
    </div>
  )
}
