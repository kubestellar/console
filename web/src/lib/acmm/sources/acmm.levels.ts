/**
 * ACMM level definitions.
 *
 * Extracted from acmm.ts — see issue #15790 / #21610.
 */
import type { LevelDef } from './types'

export const LEVELS: LevelDef[] = [
  {
    n: 0,
    name: 'Prerequisites',
    role: '',
    characteristic: 'Standard engineering practices the maturity levels build on. Not AI-specific, but required for the framework to function.',
    transitionTrigger: '"I have basic engineering hygiene in place and want to start using AI effectively."',
    antiPattern: 'Skipping fundamentals: trying to adopt AI workflows without a test suite, CI, or contribution process.',
  },
  {
    n: 1,
    name: 'Assisted / Ad Hoc',
    role: 'Executor',
    characteristic: 'AI used opportunistically with no project-specific configuration. Each session starts from scratch with no shared context.',
    transitionTrigger: '"I keep repeating the same corrections to the AI."',
    antiPattern: 'Tool-chasing: adopting every new model or IDE plugin in search of productivity that only comes from encoding judgment.',
  },
  {
    n: 2,
    name: 'Instructed',
    role: 'Rule-writer',
    characteristic: 'AI receives project context through committed files. Every session starts with the same conventions and expectations.',
    transitionTrigger: '"I want the rules enforced mechanically, not just written down."',
    antiPattern: 'Instruction rot: letting CLAUDE.md drift out of sync with the code so the rules stop matching reality.',
  },
  {
    n: 3,
    name: 'Measured / Enforced',
    role: 'Analyst',
    characteristic: 'Rules mechanically enforced via hooks, CI, and permission gates. The team instruments the AI loop with acceptance rate, coverage, and review density.',
    transitionTrigger: '"I want the system to tune itself from the metrics."',
    antiPattern: 'Dashboard graveyard: building measurement no one acts on. A metric that does not change a workflow is overhead, not maturity.',
  },
  {
    n: 4,
    name: 'Adaptive / Structured',
    role: 'Governor',
    characteristic: 'Workflows are structured and environment-aware. The AI follows decision trees, not improvisation. Metrics feed back into instructions and gating thresholds.',
    transitionTrigger: '"I want the system to decide what work to do next."',
    antiPattern: 'Policy theater: auto-tuning thresholds without a human-readable explanation of why they changed.',
  },
  {
    n: 5,
    name: 'Semi-Automated',
    role: 'Operator',
    characteristic: 'The system detects problems and proposes fixes without human initiation. Humans still approve; the system proposes.',
    transitionTrigger: '"I want the system to act on what it finds, not just propose."',
    antiPattern: 'Alert fatigue: generating proposals no one reviews. An unread suggestion is noise, not maturity.',
  },
  {
    n: 6,
    name: 'Fully Autonomous',
    role: 'Strategist',
    characteristic: 'The system acts on what it finds — generates issues, merges PRs, rolls back failures. Humans set policy and audit after the fact.',
    transitionTrigger: 'None — L6 is the terminal state. The human role becomes direction-setting, not code writing.',
    antiPattern: 'Mistaking autonomy for abandonment: an autonomous codebase still needs a strategist to set direction, or it drifts toward local optima.',
  },
]
