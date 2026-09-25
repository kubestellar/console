package api

// Blank-import pkg/agent so its init() runs during pkg/api's test binary,
// which assigns ai.SetClusterContextProviders — called unconditionally in
// NewServer (server.go). Before pkg/api/gpu_utilization_worker_test.go was
// moved to pkg/api/gpuworker, that file transitively imported pkg/agent and
// pulled the init() into every pkg/api test run. This file preserves the
// exact same test-binary side effect without pinning any real dependency.
//
// The underlying hidden coupling (production callers relying on a package
// they never import to have init'd a global var) is tracked separately —
// see kubestellar/console#23735 comment thread.

import (
	_ "github.com/kubestellar/console/pkg/agent"
)
