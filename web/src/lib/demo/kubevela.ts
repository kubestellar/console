/**
 * KubeVela demo seed re-export.
 *
 * The canonical demo data lives alongside the KubeVela card in
 * `components/cards/kubevela_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/kubevela`.
 *
 * Source: kubestellar/console-marketplace#43
 */

export {
  KUBEVELA_DEMO_DATA,
  type KubeVelaStatusData,
  type KubeVelaApplication,
  type KubeVelaAppStatus,
  type KubeVelaControllerPod,
  type KubeVelaStats,
  type KubeVelaSummary,
  type KubeVelaTrait,
  type KubeVelaWorkflowStep,
  type KubeVelaHealth,
  type WorkflowStepPhase,
} from '../../components/cards/kubevela_status/demoData'
