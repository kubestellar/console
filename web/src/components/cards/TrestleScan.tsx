/**
 * Compliance Trestle (OSCAL) card.
 *
 * Displays OSCAL compliance assessment status from Compliance Trestle / c2p.
 * When installed, shows per-profile pass/fail counts and an overall score.
 * When not installed, falls back to demo data and offers an AI mission install link.
 *
 * Compliance Trestle is a CNCF Sandbox project for compliance-as-code using NIST OSCAL.
 */

import { useState, useMemo } from 'react'
import { Shield, ExternalLink, Info, Loader2, ChevronRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useTrestle, type OscalProfile } from '../../hooks/useTrestle'
import { useMissions } from '../../hooks/useMissions'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { RefreshIndicator } from '../ui/RefreshIndicator'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Score threshold for "good" compliance posture */
const SCORE_GOOD_THRESHOLD = 80
/** Score threshold for "warning" compliance posture */
const SCORE_WARNING_THRESHOLD = 60

/** Troubleshoot mission for Trestle installed but no data */
const TROUBLESHOOT_MISSION = {
  title: 'Troubleshoot Compliance Trestle',
  description: 'Compliance Trestle is installed but not producing assessment results',
  prompt: `Compliance Trestle / OSCAL Compass is installed on my cluster but no AssessmentResult resources are being generated.

Please help me diagnose and fix the issue:
1. Check for trestle-bot or c2p-controller pods: kubectl get pods -A | grep -E 'trestle|c2p|oscal'
2. Check operator logs for errors: kubectl logs -n trestle-system -l app=trestle-bot --tail=50
3. Verify OSCAL CRDs exist: kubectl get crd | grep oscal
4. Check if any AssessmentResult resources exist: kubectl get assessmentresults -A 2>/dev/null || echo "CRD not found"
5. If c2p is installed, verify the policy engine bridge is configured
6. If pods are crashing, check resource limits

Please diagnose step by step and fix any issues found.`,
}

export function TrestleScan({ config: _config }: CardConfig) {
  const { statuses, aggregated, isLoading, isRefreshing, installed, isDemoData, lastRefresh } = useTrestle()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)

  // Filter by selected clusters
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) return aggregated
    const agg = { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 }
    for (const [name, s] of Object.entries(statuses)) {
      if (!s.installed || !selectedClusters.includes(name)) continue
      agg.totalControls += s.totalControls
      agg.passedControls += s.passedControls
      agg.failedControls += s.failedControls
      agg.otherControls += s.otherControls
    }
    agg.overallScore = agg.totalControls > 0
      ? Math.round((agg.passedControls / agg.totalControls) * 100)
      : 0
    return agg
  }, [statuses, aggregated, selectedClusters])

  useCardLoadingState({ isLoading, hasAnyData: installed || isDemoData, isDemoData })

  // Detect degraded state: installed but no assessments
  const isDegraded = useMemo(() => {
    if (!installed || isLoading) return false
    const installedClusters = Object.values(statuses).filter(s => s.installed)
    return installedClusters.length > 0 && installedClusters.every(s => s.totalControls === 0)
  }, [installed, isLoading, statuses])

  const handleInstall = () => {
    startMission({
      title: 'Install Compliance Trestle',
      description: 'Install OSCAL Compass / Compliance Trestle for compliance-as-code',
      type: 'deploy',
      initialPrompt: `I want to install Compliance Trestle (OSCAL Compass) for compliance-as-code on my Kubernetes clusters.

Compliance Trestle is a CNCF Sandbox project that uses NIST OSCAL (Open Security Controls Assessment Language) to automate compliance assessment.

Please help me:
1. Install the c2p (Compliance-to-Policy) controller which bridges OSCAL to Kubernetes policy engines:
   pip install compliance-trestle
   # Or deploy the c2p controller via its Kubernetes manifests:
   kubectl create namespace c2p-system
   kubectl apply -f https://raw.githubusercontent.com/oscal-compass/compliance-to-policy/main/deploy/kubernetes/c2p-controller.yaml

2. Set up an initial OSCAL Component Definition and Profile (e.g., NIST 800-53):
   trestle init
   trestle import -f https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json -o nist-800-53

3. Configure the policy bridge to connect to your existing policy engine (Kyverno, OPA, or Kubescape)

4. Verify assessment results are being generated:
   kubectl get assessmentresults -A

Please proceed step by step. Start with verifying prerequisites (Python 3.9+, kubectl access).`,
      context: {},
    })
  }

  const handleTroubleshoot = () => {
    startMission({
      title: TROUBLESHOOT_MISSION.title,
      description: TROUBLESHOOT_MISSION.description,
      type: 'troubleshoot',
      initialPrompt: TROUBLESHOOT_MISSION.prompt,
      context: {},
    })
  }

  // Get all profiles from all clusters
  const allProfiles = useMemo(() => {
    const profileMap = new Map<string, OscalProfile>()
    for (const [name, s] of Object.entries(statuses)) {
      if (!s.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(name)) continue
      for (const p of (s.profiles || [])) {
        const existing = profileMap.get(p.name)
        if (existing) {
          existing.totalControls += p.totalControls
          existing.controlsPassed += p.controlsPassed
          existing.controlsFailed += p.controlsFailed
          existing.controlsOther += p.controlsOther
        } else {
          profileMap.set(p.name, { ...p })
        }
      }
    }
    return Array.from(profileMap.values())
  }, [statuses, selectedClusters])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not installed — show install prompt
  if (!installed && !isDemoData) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 text-xs">
          <Shield className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-teal-400 font-medium">Compliance Trestle (CNCF Sandbox)</p>
            <p className="text-muted-foreground mt-1">
              Compliance-as-code using NIST OSCAL. Automates compliance assessment
              and bridges OSCAL to Kubernetes policy engines.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleInstall}
                className="text-teal-400 hover:underline font-medium"
              >
                Install with AI Mission →
              </button>
              <a
                href="https://oscal-compass.github.io/compliance-trestle/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Docs <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Degraded: installed but no data
  if (isDegraded) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Trestle Installed — No Assessments</p>
            <p className="text-muted-foreground mt-1">
              Compliance Trestle is deployed but no OSCAL assessment results have been generated yet.
            </p>
            <button
              onClick={handleTroubleshoot}
              className="text-amber-400 hover:underline font-medium mt-1"
            >
              Troubleshoot with AI →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Score color
  const scoreColor = filtered.overallScore >= SCORE_GOOD_THRESHOLD
    ? 'text-green-400'
    : filtered.overallScore >= SCORE_WARNING_THRESHOLD
      ? 'text-yellow-400'
      : 'text-red-400'

  const scoreLabel = filtered.overallScore >= SCORE_GOOD_THRESHOLD
    ? 'Good'
    : filtered.overallScore >= SCORE_WARNING_THRESHOLD
      ? 'Needs Attention'
      : 'Critical'

  return (
    <div className="space-y-3 h-full flex flex-col">
      {/* Refresh indicator */}
      {isRefreshing && lastRefresh && (
        <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={lastRefresh} />
      )}

      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className={`text-3xl font-bold ${scoreColor}`}>{filtered.overallScore}%</span>
            <span className={`text-xs ${scoreColor}`}>{scoreLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-400" />
              <span>{filtered.passedControls} passed</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" />
              <span>{filtered.failedControls} failed</span>
            </div>
            {filtered.otherControls > 0 && (
              <div className="flex items-center gap-1">
                <Info className="w-3 h-3 text-muted-foreground" />
                <span>{filtered.otherControls} other</span>
              </div>
            )}
          </div>
        </div>
        <StatusBadge
          color={filtered.overallScore >= SCORE_GOOD_THRESHOLD ? 'green' : filtered.overallScore >= SCORE_WARNING_THRESHOLD ? 'yellow' : 'red'}
          size="xs"
        >
          {filtered.totalControls} controls
        </StatusBadge>
      </div>

      {/* Compliance Context Banner */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-teal-500/5 border border-teal-500/10 text-xs">
        <Info className="w-3.5 h-3.5 text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          <span className="text-teal-400 font-medium">OSCAL Compliance</span> — Automated assessment
          using NIST OSCAL framework via Compliance Trestle (CNCF Sandbox).
        </p>
      </div>

      {/* Profile Breakdown */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {allProfiles.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No profiles assessed</p>
        )}
        {(allProfiles || []).map((profile) => {
          const profileScore = profile.totalControls > 0
            ? Math.round((profile.controlsPassed / profile.totalControls) * 100)
            : 0
          const isExpanded = expandedProfile === profile.name

          return (
            <button
              key={profile.name}
              onClick={() => setExpandedProfile(isExpanded ? null : profile.name)}
              className="w-full text-left p-2.5 rounded-lg border border-border/50 hover:border-border transition-colors bg-secondary/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-xs font-medium text-foreground">{profile.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${
                    profileScore >= SCORE_GOOD_THRESHOLD ? 'text-green-400' :
                    profileScore >= SCORE_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {profileScore}%
                  </span>
                  <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    profileScore >= SCORE_GOOD_THRESHOLD ? 'bg-green-400' :
                    profileScore >= SCORE_WARNING_THRESHOLD ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${profileScore}%` }}
                />
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-3 h-3" />
                    <span>{profile.controlsPassed} pass</span>
                  </div>
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3 h-3" />
                    <span>{profile.controlsFailed} fail</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Info className="w-3 h-3" />
                    <span>{profile.controlsOther} other</span>
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Per-cluster status (if multiple clusters) */}
      {Object.values(statuses).filter(s => s.installed).length > 1 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-2xs text-muted-foreground mb-1">Per-cluster compliance</p>
          <div className="flex flex-wrap gap-1">
            {Object.values(statuses)
              .filter(s => s.installed && (selectedClusters.length === 0 || selectedClusters.includes(s.cluster)))
              .map(s => (
                <StatusBadge
                  key={s.cluster}
                  color={s.overallScore >= SCORE_GOOD_THRESHOLD ? 'green' : s.overallScore >= SCORE_WARNING_THRESHOLD ? 'yellow' : 'red'}
                  size="xs"
                >
                  {s.cluster}: {s.overallScore}%
                </StatusBadge>
              ))}
          </div>
        </div>
      )}

      {/* CNCF badge */}
      <div className="flex items-center justify-between text-2xs text-muted-foreground pt-1 border-t border-border/30">
        <a
          href="https://oscal-compass.github.io/compliance-trestle/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          OSCAL Compass <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <StatusBadge color="cyan" size="xs">CNCF Sandbox</StatusBadge>
      </div>
    </div>
  )
}

export default TrestleScan
