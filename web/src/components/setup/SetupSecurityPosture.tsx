import { ExternalLink } from 'lucide-react'
import { SECURITY_AI_DOC_URL, SECURITY_DOC_REPO_URL, SECURITY_DOC_URL } from './setupInstructions.constants'

/**
 * Body of the "Security posture" disclosure — what runs where and what leaves
 * the user's machine.
 */
export function SetupSecurityPosture() {
  return (
    <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3 text-xs text-muted-foreground">
      <div>
        <p className="font-medium text-foreground mb-1">kc-agent runs on your machine, not ours</p>
        <p>
          kc-agent binds <code className="font-mono text-foreground/70">127.0.0.1:8585</code> only
          (hardcoded loopback, not configurable). It reads{' '}
          <code className="font-mono text-foreground/70">~/.kube/config</code> and executes every
          cluster operation as <em>you</em> — the apiserver enforces your real RBAC on every call.
          Set <code className="font-mono text-foreground/70">KC_AGENT_TOKEN</code> for an additional
          shared-secret gate against other local processes.
        </p>
      </div>
      <div>
        <p className="font-medium text-foreground mb-1">AI keys never leave your machine</p>
        <p>
          API keys are stored at{' '}
          <code className="font-mono text-foreground/70">~/.kc/config.yaml</code> with mode{' '}
          <code className="font-mono text-foreground/70">0600</code>. The browser never holds the
          keys; kc-agent calls the provider directly. No API key reaches the console's servers or
          the hosted demo at console.kubestellar.io.
        </p>
      </div>
      <div>
        <p className="font-medium text-foreground mb-1">What does leave your machine</p>
        <p>
          Your AI chat history and prompts are sent to whichever LLM provider you configured —
          cloud (Anthropic, OpenAI, Gemini) or self-hosted. Your kubeconfig, cluster tokens, and
          secrets are <em>not</em> auto-attached; only what you paste into the chat. Analytics
          (page views, feature-use events) can be opted out in Settings.
        </p>
      </div>
      <div>
        <p className="font-medium text-foreground mb-1">Air-gapped / high-security environments</p>
        <p>
          Point kc-agent at a local LLM (Ollama, vLLM, LM Studio, corporate gateway) by overriding{' '}
          <code className="font-mono text-foreground/70">GROQ_BASE_URL</code>,{' '}
          <code className="font-mono text-foreground/70">OPENROUTER_BASE_URL</code>, or{' '}
          <code className="font-mono text-foreground/70">OPEN_WEBUI_URL</code>. AI traffic then
          never leaves your perimeter. The core cluster-management UX works with no AI at all.
        </p>
      </div>
      <div className="pt-1 flex flex-col gap-1">
        <a
          href={SECURITY_DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
        >
          Read the full security model (kubestellar.io)
          <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={SECURITY_AI_DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
        >
          AI automation threat model (SECURITY-AI.md)
          <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={SECURITY_DOC_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Source-grounded version on GitHub
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
