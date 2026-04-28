/**
 * Volcano demo seed re-export.
 *
 * The canonical demo data lives alongside the Volcano card in
 * `components/cards/volcano_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/volcano`.
 */

export {
  VOLCANO_DEMO_DATA,
  type VolcanoStatusData,
  type VolcanoQueue,
  type VolcanoJob,
  type VolcanoPodGroup,
  type VolcanoStats,
  type VolcanoSummary,
  type VolcanoHealth,
  type VolcanoJobPhase,
  type PodGroupPhase,
  type QueueState,
} from '../../components/cards/volcano_status/demoData'
