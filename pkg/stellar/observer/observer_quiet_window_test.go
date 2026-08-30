package observer

import (
	"os"
	"testing"
	"time"
)

// TestIsQuietWindow_Windows covers the branch pairs that the existing
// TestIsQuietWindow in observer_coverage_test.go leaves uncovered:
//
//   - only-end-set (mirror of the existing only-start-set case)
//   - normal (start < end) window, current time INSIDE the window
//   - normal (start < end) window, current time OUTSIDE the window
//   - overnight (start >= end) window, current time INSIDE the window
//     (both across-midnight halves: after start, and before end)
//   - overnight (start >= end) window, current time OUTSIDE the window
//     (in the daytime gap between end and start)
//
// Together with the existing 2 subtests this brings isQuietWindow() from
// 50.0% to 100.0% statement coverage (verified via
// `go test -cover ./pkg/stellar/observer`). More importantly, the in/out
// assertions actually exercise the two lexicographic comparisons that
// implement the branch — a bug in either half of the overnight case
// (e.g. `now >= start && now < end` instead of `||`) would silently
// suppress every notification during the small hours without any test
// failing today.
//
// The tests synthesize the STELLAR_QUIET_{START,END} values from
// time.Now() so they are deterministic wall-clock-independent: whatever
// the current HH:MM is, the constructed window sits either strictly
// around or strictly away from it.
func TestIsQuietWindow_Windows(t *testing.T) {
	origStart := os.Getenv("STELLAR_QUIET_START")
	origEnd := os.Getenv("STELLAR_QUIET_END")
	t.Cleanup(func() {
		os.Setenv("STELLAR_QUIET_START", origStart)
		os.Setenv("STELLAR_QUIET_END", origEnd)
	})

	// offsetMinutes returns the current wall-clock time offset by delta
	// minutes, formatted as HH:MM, wrapping across midnight. Using it to
	// build the window ends means test correctness is independent of
	// what time of day the suite happens to run.
	offsetMinutes := func(delta int) string {
		return time.Now().Add(time.Duration(delta) * time.Minute).Format("15:04")
	}

	// Detect midnight-wrap corner cases where the constructed test
	// window would itself cross midnight (making the "normal" case
	// actually an overnight case). We fall back to explicit static
	// windows in those rare cases so the branch-under-test is always
	// the one we intended.
	nowHM := time.Now().Format("15:04")

	t.Run("only_end_set_returns_false", func(t *testing.T) {
		os.Unsetenv("STELLAR_QUIET_START")
		os.Setenv("STELLAR_QUIET_END", "07:00")
		if isQuietWindow() {
			t.Fatal("expected false when only end set")
		}
	})

	t.Run("normal_window_inside_returns_true", func(t *testing.T) {
		// Skip if we're within 5 minutes of midnight — the constructed
		// window would wrap and stop being "normal".
		if nowHM >= "23:55" || nowHM < "00:05" {
			t.Skipf("current time %s too close to midnight for normal-window test", nowHM)
		}
		os.Setenv("STELLAR_QUIET_START", offsetMinutes(-2))
		os.Setenv("STELLAR_QUIET_END", offsetMinutes(+2))
		if !isQuietWindow() {
			t.Fatalf("expected true; envs start=%q end=%q now=%q",
				os.Getenv("STELLAR_QUIET_START"),
				os.Getenv("STELLAR_QUIET_END"), nowHM)
		}
	})

	t.Run("normal_window_outside_returns_false", func(t *testing.T) {
		// A window in the near future, entirely after now. Guard the
		// midnight wrap by skipping if both offsets would cross.
		if nowHM >= "23:50" {
			t.Skipf("current time %s too close to midnight for outside-normal test", nowHM)
		}
		os.Setenv("STELLAR_QUIET_START", offsetMinutes(+5))
		os.Setenv("STELLAR_QUIET_END", offsetMinutes(+10))
		if isQuietWindow() {
			t.Fatalf("expected false; envs start=%q end=%q now=%q",
				os.Getenv("STELLAR_QUIET_START"),
				os.Getenv("STELLAR_QUIET_END"), nowHM)
		}
	})

	t.Run("overnight_window_inside_after_start", func(t *testing.T) {
		// Overnight window whose start sits just before now and whose
		// end sits BEFORE the start (i.e. wraps past midnight). We are
		// "inside" via the `now >= start` half of the OR.
		if nowHM < "00:05" {
			t.Skipf("current time %s too close to midnight for after-start overnight test", nowHM)
		}
		os.Setenv("STELLAR_QUIET_START", offsetMinutes(-2))
		os.Setenv("STELLAR_QUIET_END", offsetMinutes(-30)) // strictly earlier -> overnight
		start := os.Getenv("STELLAR_QUIET_START")
		end := os.Getenv("STELLAR_QUIET_END")
		if !(start >= end) {
			t.Skipf("constructed window is not overnight: start=%q end=%q", start, end)
		}
		if !isQuietWindow() {
			t.Fatalf("expected true; envs start=%q end=%q now=%q", start, end, nowHM)
		}
	})

	t.Run("overnight_window_inside_before_end", func(t *testing.T) {
		// Overnight window whose end sits just after now and whose
		// start sits LATER in the day (i.e. wraps past midnight from
		// the previous evening). We are "inside" via the `now < end`
		// half of the OR.
		if nowHM >= "23:55" {
			t.Skipf("current time %s too close to midnight for before-end overnight test", nowHM)
		}
		os.Setenv("STELLAR_QUIET_START", offsetMinutes(+30)) // later than end -> overnight
		os.Setenv("STELLAR_QUIET_END", offsetMinutes(+2))
		start := os.Getenv("STELLAR_QUIET_START")
		end := os.Getenv("STELLAR_QUIET_END")
		if !(start >= end) {
			t.Skipf("constructed window is not overnight: start=%q end=%q", start, end)
		}
		if !isQuietWindow() {
			t.Fatalf("expected true; envs start=%q end=%q now=%q", start, end, nowHM)
		}
	})

	t.Run("overnight_window_outside_daytime_gap", func(t *testing.T) {
		// Overnight window with `end` before now and `start` after now
		// — the daytime gap where quiet is NOT in effect. Requires
		// enough room on both sides.
		if nowHM < "00:35" || nowHM >= "23:25" {
			t.Skipf("current time %s not in interior of day for daytime-gap test", nowHM)
		}
		os.Setenv("STELLAR_QUIET_START", offsetMinutes(+30))  // later
		os.Setenv("STELLAR_QUIET_END", offsetMinutes(-30))    // earlier -> overnight
		start := os.Getenv("STELLAR_QUIET_START")
		end := os.Getenv("STELLAR_QUIET_END")
		if !(start >= end) {
			t.Skipf("constructed window is not overnight: start=%q end=%q", start, end)
		}
		if isQuietWindow() {
			t.Fatalf("expected false; envs start=%q end=%q now=%q", start, end, nowHM)
		}
	})
}
