// TestPersistence_LastModifiedTimestamp tests that LastModified is updated on save
func TestPersistence_LastModifiedTimestamp(t *testing.T) {
	sm := newTestManager(t)

	// LastModified is stored in time.RFC3339 (second precision), so truncate
	// before to the same precision to avoid spurious failures when the save
	// happens in the same wall-clock second as before.
	before := time.Now().UTC().Truncate(time.Second)
	time.Sleep(10 * time.Millisecond) // Ensure timestamp difference

	all := DefaultAllSettings()
	if err := sm.SaveAll(all); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	time.Sleep(10 * time.Millisecond)
	// Add one second to after to accommodate second-granularity rounding.
	after := time.Now().UTC().Add(time.Second)

	sm.mu.RLock()
	lastMod := sm.settings.LastModified
	sm.mu.RUnlock()

	if lastMod == "" {
		t.Fatal("LastModified is empty")
	}

	parsed, err := time.Parse(time.RFC3339, lastMod)
	if err != nil {
		t.Fatalf("failed to parse LastModified: %v", err)
	}

	if parsed.Before(before) || parsed.After(after) {
		t.Errorf("LastModified timestamp %v is outside range [%v, %v]", parsed, before, after)
	}
}
