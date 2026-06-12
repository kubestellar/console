package feedback

import (
	"github.com/kubestellar/console/pkg/api/handlers/testutil"
)

// RoundTripFunc is a helper for mocking http.Client Transport in tests.
type RoundTripFunc = testutil.RoundTripFunc
