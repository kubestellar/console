package changecontrol

import (
	"testing"
	"time"
)

// TestDayMatches_AllBranches covers the three arms of the `pattern` switch in
// dayMatches: "weekday", "weekend", and the fall-through equality case
// against a specific day name. The existing TestInWindow exercises only the
// "weekday" arm indirectly, leaving dayMatches at 50 % func coverage.
//
// The three arms correspond to three real ChangePolicy AllowedWindows
// patterns supported by inWindow / builtinPolicies:
//
//   - "weekday" — Monday..Friday (used by the built-in PCI change window)
//   - "weekend" — Saturday or Sunday
//   - "sunday".."saturday" — a specific day name via equality fallback
//
// A regression that dropped one arm (or mistyped a case label) would flip
// production change-window enforcement silently: e.g. losing the "weekend"
// arm would let weekend-only maintenance windows admit *every* day,
// because the fallback would compare "weekend" == actual weekday name
// which is always false → policy would appear to be "never in window".
func TestDayMatches_AllBranches(t *testing.T) {
	cases := []struct {
		name    string
		pattern string
		wd      time.Weekday
		want    bool
	}{
		// weekday pattern
		{"weekday matches Monday", "weekday", time.Monday, true},
		{"weekday matches Friday", "weekday", time.Friday, true},
		{"weekday rejects Saturday", "weekday", time.Saturday, false},
		{"weekday rejects Sunday", "weekday", time.Sunday, false},

		// weekend pattern
		{"weekend matches Saturday", "weekend", time.Saturday, true},
		{"weekend matches Sunday", "weekend", time.Sunday, true},
		{"weekend rejects Monday", "weekend", time.Monday, false},
		{"weekend rejects Wednesday", "weekend", time.Wednesday, false},
		{"weekend rejects Friday", "weekend", time.Friday, false},

		// default equality fallback against a specific day name
		{"specific day matches when actual is same", "wednesday", time.Wednesday, true},
		{"specific day rejects when actual differs", "wednesday", time.Thursday, false},
		{"empty pattern rejects any actual", "", time.Monday, false},
		{"unknown pattern rejects when actual differs", "not-a-day", time.Monday, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			actual := dayOfWeekName(tc.wd)
			got := dayMatches(tc.pattern, actual, tc.wd)
			if got != tc.want {
				t.Errorf("dayMatches(pattern=%q, actual=%q, wd=%v) = %v, want %v",
					tc.pattern, actual, tc.wd, got, tc.want)
			}
		})
	}
}

// TestInWindow_WeekendPatternAndSpecificDay pins the two dayMatches arms
// that TestInWindow leaves untouched, through the public inWindow entry
// point. If dayMatches ever regresses to always-false for these patterns,
// the corresponding ChangePolicy would silently reject every change.
func TestInWindow_WeekendPatternAndSpecificDay(t *testing.T) {
	// A Saturday at 10:00 UTC.
	sat10 := time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC)
	// A Wednesday at 10:00 UTC.
	wed10 := time.Date(2026, 4, 22, 10, 0, 0, 0, time.UTC)

	weekendWindow := []Window{{DayOfWeek: "weekend", StartHour: 6, EndHour: 22}}
	if !inWindow(sat10, weekendWindow) {
		t.Error("expected Saturday 10:00 UTC to be in weekend 6-22 window")
	}
	if inWindow(wed10, weekendWindow) {
		t.Error("expected Wednesday to be outside weekend window")
	}

	wednesdayWindow := []Window{{DayOfWeek: "wednesday", StartHour: 9, EndHour: 17}}
	if !inWindow(wed10, wednesdayWindow) {
		t.Error("expected Wednesday 10:00 UTC to be in wednesday 9-17 window")
	}
	if inWindow(sat10, wednesdayWindow) {
		t.Error("expected Saturday to be outside a wednesday-only window")
	}
}
