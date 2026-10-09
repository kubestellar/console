// Creation-flow panels for the Create OPA Policy modal.
// Extracted from CreatePolicyModal.tsx (issue #24058) — markup unchanged.
import { FileCode, LayoutTemplate, Sparkles, Copy, MessageSquareText, ScanSearch, Loader2 } from 'lucide-react'
import { POLICY_TEMPLATES } from './types'

// Creation flow type for CreatePolicyModal
export type CreateFlow = 'choose' | 'describe' | 'template' | 'yaml'

interface CreatePolicyChooseFlowProps {
  selectedCluster: string
  isAnalyzing: boolean
  onAnalyzeAndSuggest: () => void
  setFlow: (flow: CreateFlow) => void
}

export function CreatePolicyChooseFlow({ selectedCluster, isAnalyzing, onAnalyzeAndSuggest: handleAnalyzeAndSuggest, setFlow }: CreatePolicyChooseFlowProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium border-b border-border/50 pb-1">
        How would you like to create a policy?
      </p>

      {/* Analyze & Suggest */}
      <button
        onClick={handleAnalyzeAndSuggest}
        disabled={!selectedCluster || isAnalyzing}
        className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all text-left group disabled:opacity-50"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {isAnalyzing
              ? <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              : <ScanSearch className="w-5 h-5 text-purple-400" />
            }
          </div>
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
              {isAnalyzing ? 'Analyzing cluster...' : 'Analyze Cluster & Suggest Policies'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI scans security issues, missing limits, privileged containers and suggests OPA policies to prevent them
            </p>
          </div>
        </div>
      </button>

      {/* Describe What You Need */}
      <button
        onClick={() => setFlow('describe')}
        disabled={!selectedCluster}
        className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all text-left group disabled:opacity-50"
      >
        <div className="flex items-start gap-3">
          <MessageSquareText className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
              Describe What You Need
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tell AI what you want to enforce and it will generate the policy YAML
            </p>
          </div>
        </div>
      </button>

      {/* From Template */}
      <button
        onClick={() => setFlow('template')}
        disabled={!selectedCluster}
        className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group disabled:opacity-50"
      >
        <div className="flex items-start gap-3">
          <LayoutTemplate className="w-5 h-5 text-green-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
              From Template
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start from a pre-built policy template
            </p>
          </div>
        </div>
      </button>

      {/* Custom YAML */}
      <button
        onClick={() => setFlow('yaml')}
        disabled={!selectedCluster}
        className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group disabled:opacity-50"
      >
        <div className="flex items-start gap-3">
          <FileCode className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
              Custom YAML
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Write or paste ConstraintTemplate + Constraint YAML directly
            </p>
          </div>
        </div>
      </button>
    </div>
  )
}

interface CreatePolicyDescribeFlowProps {
  userDescription: string
  setUserDescription: (value: string) => void
  onGenerate: () => void
}

export function CreatePolicyDescribeFlow({ userDescription, setUserDescription, onGenerate: handleDescribeMission }: CreatePolicyDescribeFlowProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Describe the policy you want in plain English. AI will generate the ConstraintTemplate and Constraint YAML.
      </p>
      <textarea
        value={userDescription}
        onChange={(e) => setUserDescription(e.target.value)}
        className="w-full h-32 p-3 bg-secondary/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
        placeholder="e.g., Block all pods that don't have a 'team' label, require all containers to have memory limits, prevent images from untrusted registries..."
        autoFocus
      />
      <div className="flex justify-end">
        <button
          onClick={handleDescribeMission}
          disabled={!userDescription.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Generate with AI
        </button>
      </div>
    </div>
  )
}

interface CreatePolicyTemplateFlowProps {
  onUseTemplate: (template: typeof POLICY_TEMPLATES[0]) => void
}

export function CreatePolicyTemplateFlow({ onUseTemplate: handleUseTemplate }: CreatePolicyTemplateFlowProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">
        Choose a template. You can edit the YAML before applying.
      </p>
      {POLICY_TEMPLATES.map(template => (
        <button
          key={template.name}
          onClick={() => handleUseTemplate(template)}
          className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
        >
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
            <span className="text-sm font-medium text-foreground">{template.name}</span>
            <span className="text-xs text-muted-foreground">{template.kind}</span>
          </div>
          <p className="text-xs text-muted-foreground">{template.description}</p>
        </button>
      ))}
    </div>
  )
}

interface CreatePolicyYamlFlowProps {
  selectedCluster: string
  yamlContent: string
  setYamlContent: (value: string) => void
  onCopy: () => void
  onApply: () => void
}

export function CreatePolicyYamlFlow({ selectedCluster, yamlContent, setYamlContent, onCopy, onApply: handleApplyCustomYaml }: CreatePolicyYamlFlowProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
        <span className="text-muted-foreground">
          YAML will be applied to: <span className="text-foreground">{selectedCluster}</span>
        </span>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
      <textarea
        value={yamlContent}
        onChange={(e) => setYamlContent(e.target.value)}
        className="w-full h-[40vh] p-3 bg-secondary/50 border border-border rounded-lg font-mono text-sm text-foreground resize-none focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
        placeholder="# Paste or write your ConstraintTemplate and Constraint YAML here..."
        spellCheck={false}
        autoFocus
      />
      <div className="flex justify-end">
        <button
          onClick={handleApplyCustomYaml}
          disabled={!yamlContent.trim()}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          Apply with AI
        </button>
      </div>
    </div>
  )
}
