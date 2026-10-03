- Fixed `docs/RELEASING.md`'s rollback section citing the pre-split path
  `pkg/api/handlers/self_upgrade.go` for the self-upgrade handler; it now
  points at `pkg/api/handlers/ops/self_upgrade.go`, where the handlers
  package split moved it.
