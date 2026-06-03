package frameworks

import (
	"hash/fnv"
	"math/rand/v2"
	"time"
)

// DemoEvaluation returns a synthetic evaluation result for demo mode
// when no live cluster prober is available.
// The RNG is seeded deterministically from the cluster name so that
// demo reports are reproducible across runs (fixes flaky tests when
// the framework under test has only a few checks).
func DemoEvaluation(fw Framework, cluster string) *EvaluationResult {
	h := fnv.New64a()
	h.Write([]byte(cluster)) //nolint:errcheck // hash.Hash.Write never returns an error
	seed := h.Sum64()
	rng := rand.New(rand.NewPCG(seed, seed^0xdeadbeefcafebabe)) // #nosec G404 -- demo data, not security-critical
	result := &EvaluationResult{
		FrameworkID:   fw.ID,
		FrameworkName: fw.Name,
		ClusterName:   cluster,
		EvaluatedAt:   time.Now(),
	}

	for _, ctrl := range fw.Controls {
		cr := ControlResult{
			ControlID: ctrl.ID,
			Title:     ctrl.Title,
			Severity:  ctrl.Severity,
			Category:  ctrl.Category,
		}

		var passed, failed int
		for _, check := range ctrl.Checks {
			checkResult := demoCheckResult(check, rng)
			cr.Checks = append(cr.Checks, checkResult)
			result.TotalChecks++
			switch checkResult.Status {
			case StatusPass:
				passed++
				result.Passed++
			case StatusFail:
				failed++
				result.Failed++
			case StatusPartial:
				result.Partial++
			}
		}

		cr.Status = deriveControlStatus(passed, failed, 0, len(ctrl.Checks))
		if cr.Status == StatusFail {
			cr.Remediation = remediationHint(ctrl)
		}
		result.Controls = append(result.Controls, cr)
	}

	evaluated := result.TotalChecks - result.Skipped
	if evaluated > 0 {
		score := float64(result.Passed) + float64(result.Partial)*0.5
		result.Score = int(score / float64(evaluated) * 100)
	}
	return result
}

func demoCheckResult(check Check, rng *rand.Rand) CheckResult {
	cr := CheckResult{
		CheckID: check.ID,
		Name:    check.Name,
	}
	// Weighted: ~60% pass, ~15% partial, ~25% fail for realistic demo.
	r := rng.Float64()
	switch {
	case r < 0.60:
		cr.Status = StatusPass
		cr.Evidence = "Demo: check passed"
	case r < 0.75:
		cr.Status = StatusPartial
		cr.Evidence = "Demo: partially compliant"
	default:
		cr.Status = StatusFail
		cr.Message = "Demo: check failed — remediation needed"
	}
	return cr
}
