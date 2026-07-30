/**
 * gRPC demo seed re-export.
 *
 * The canonical demo data lives alongside the gRPC card in
 * `components/cards/grpc_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/grpc`.
 */

export {
  GRPC_DEMO_DATA,
  type GrpcStatusData,
  type GrpcService,
  type GrpcStats,
  type GrpcSummary,
  type GrpcHealth,
  type GrpcServingStatus,
} from '../../components/cards/grpc_status/demoData'
