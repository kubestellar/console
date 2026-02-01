import { useState, useEffect } from 'react'
import { Save, RefreshCw, Check, X, Github, ExternalLink, Loader2 } from 'lucide-react'

interface GitHubTokenSectionProps {
  forceVersionCheck: () => void
}

// Helper functions for base64 encoding (obfuscation, not encryption)
const encodeToken = (token: string) => btoa(token)
const decodeToken = (encoded: string) => {
  try {
    return atob(encoded)
  } catch {
    return encoded // Return as-is if not encoded (migration from old format)
  }
}

export function GitHubTokenSection({ forceVersionCheck }: GitHubTokenSectionProps) {
  const [githubToken, setGithubToken] = useState('')
  const [hasGithubToken, setHasGithubToken] = useState(false)
  const [githubTokenSaved, setGithubTokenSaved] = useState(false)
  const [githubTokenTesting, setGithubTokenTesting] = useState(false)
  const [githubTokenError, setGithubTokenError] = useState<string | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<{ limit: number; remaining: number; reset: Date } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // Load GitHub token status on mount and test existing token
  useEffect(() => {
    const loadToken = async () => {
      const encodedToken = localStorage.getItem('github_token')
      setHasGithubToken(!!encodedToken)
      if (encodedToken) {
        const token = decodeToken(encodedToken)
        await testGithubToken(token)
      }
      setIsInitializing(false)
    }
    loadToken()
  }, [])

  const testGithubToken = async (token: string) => {
    setGithubTokenTesting(true)
    setGithubTokenError(null)
    try {
      const response = await fetch('https://api.github.com/rate_limit', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid token - authentication failed')
        }
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      setGithubRateLimit({
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
      })
      return true
    } catch (err) {
      setGithubTokenError(err instanceof Error ? err.message : 'Failed to validate token')
      setGithubRateLimit(null)
      return false
    } finally {
      setGithubTokenTesting(false)
    }
  }

  const handleSaveGithubToken = async () => {
    if (!githubToken.trim()) return

    setGithubTokenTesting(true)
    const isValid = await testGithubToken(githubToken.trim())

    if (isValid) {
      // Store base64 encoded (obfuscation)
      localStorage.setItem('github_token', encodeToken(githubToken.trim()))
      setHasGithubToken(true)
      setGithubToken('')
      setGithubTokenSaved(true)
      setTimeout(() => setGithubTokenSaved(false), 2000)

      // Trigger system updates check with the new token
      forceVersionCheck()
    }
    setGithubTokenTesting(false)
  }

  const handleClearGithubToken = () => {
    localStorage.removeItem('github_token')
    setHasGithubToken(false)
    setGithubRateLimit(null)
    setGithubTokenError(null)
  }

  return (
    <div id="github-token-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-gray-500/20">
          <Github className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">GitHub Integration</h2>
          <p className="text-sm text-muted-foreground">Configure GitHub API access for the GitHub Activity card</p>
        </div>
      </div>

      {/* Show loading during initialization */}
      {isInitializing ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Status */}
          <div className={`p-4 rounded-lg mb-4 ${
        githubTokenError ? 'bg-red-500/10 border border-red-500/20' :
        hasGithubToken ? 'bg-green-500/10 border border-green-500/20' :
        'bg-yellow-500/10 border border-yellow-500/20'
      }`}>
        <div className="flex items-center gap-2">
          {githubTokenTesting ? (
            <>
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <span className="font-medium text-blue-400">Testing token...</span>
            </>
          ) : githubTokenError ? (
            <>
              <X className="w-5 h-5 text-red-400" />
              <span className="font-medium text-red-400">Token Error</span>
              <span className="text-muted-foreground">- {githubTokenError}</span>
            </>
          ) : hasGithubToken && githubRateLimit ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="font-medium text-green-400">Token Valid</span>
              <span className="text-muted-foreground">
                - {githubRateLimit.remaining.toLocaleString()}/{githubRateLimit.limit.toLocaleString()} requests remaining
              </span>
            </>
          ) : hasGithubToken ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="font-medium text-green-400">Token Configured</span>
              <span className="text-muted-foreground">- 5,000 requests/hour</span>
            </>
          ) : (
            <>
              <X className="w-5 h-5 text-yellow-400" />
              <span className="font-medium text-yellow-400">No Token</span>
              <span className="text-muted-foreground">- Limited to 60 requests/hour</span>
            </>
          )}
        </div>
        {githubRateLimit && hasGithubToken && !githubTokenError && (
          <p className="text-xs text-muted-foreground mt-2">
            Rate limit resets at {githubRateLimit.reset.toLocaleTimeString()}
          </p>
        )}
      </div>

          {/* Token Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="github-token" className="block text-sm text-muted-foreground mb-2">
                Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={hasGithubToken ? '••••••••••••••••' : 'ghp_... or github_pat_...'}
                  className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
                />
                <button
                  onClick={handleSaveGithubToken}
                  disabled={!githubToken.trim() || githubTokenTesting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {githubTokenTesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {githubTokenTesting ? 'Testing...' : githubTokenSaved ? 'Saved!' : 'Save & Test'}
                </button>
                {hasGithubToken && (
                  <button
                    onClick={handleClearGithubToken}
                    className="px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
          <p className="text-sm font-medium text-foreground">How to create a token:</p>

          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-purple-400 font-medium">Option 1:</span>
              <div>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Create Fine-grained Token (Recommended)
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Set expiration, select "Public repositories (read-only)". No additional permissions needed for public repos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="text-purple-400 font-medium">Option 2:</span>
              <div>
                <a
                  href="https://github.com/settings/tokens/new?description=KubeStellar%20Console&scopes="
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Create Classic Token
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-muted-foreground text-xs mt-0.5">
                  No scopes needed for public repos. For private repos, check the "repo" scope.
                </p>
              </div>
            </div>
          </div>

            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-yellow-400/70">
                ⚠️ Token is stored in browser localStorage (not encrypted). Use a token with minimal permissions and set an expiration date.
              </p>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
