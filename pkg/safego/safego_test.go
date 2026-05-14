package safego

import (
	"sync"
	"testing"
)

func TestGo_NoPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	ran := false
	Go(func() {
		defer wg.Done()
		ran = true
	})
	wg.Wait()
	if !ran {
		t.Fatal("expected goroutine to run")
	}
}

func TestGo_RecoversPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	Go(func() {
		defer wg.Done()
		panic("test panic")
	})
	// If recovery fails, this test will crash the process.
	wg.Wait()
}

func TestGoWith_RecoversPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	GoWith("test-label", func() {
		defer wg.Done()
		panic("labeled panic")
	})
	wg.Wait()
}

func TestGoWith_NoPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)
	result := 0
	GoWith("computation", func() {
		defer wg.Done()
		result = 42
	})
	wg.Wait()
	if result != 42 {
		t.Fatalf("expected 42, got %d", result)
	}
}
