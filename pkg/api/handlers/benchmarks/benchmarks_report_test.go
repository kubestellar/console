package benchmarks

import (
	"testing"
)

// ---------- convertStats ----------

func TestConvertStats_Nil(t *testing.T) {
	result := convertStats(nil)
	if result != nil {
		t.Errorf("convertStats(nil) should return nil, got %+v", result)
	}
}

func TestConvertStats_AllFields(t *testing.T) {
	p50 := 12.5
	p99 := 45.0
	min := 1.0
	max := 100.0
	raw := &rawV1Statistics{
		Units: "ms",
		Mean:  25.0,
		Min:   &min,
		P50:   &p50,
		P99:   &p99,
		Max:   &max,
	}

	result := convertStats(raw)
	if result == nil {
		t.Fatal("convertStats should not return nil for non-nil input")
	}
	if result.Units != "ms" {
		t.Errorf("Units = %q, want %q", result.Units, "ms")
	}
	if result.Mean != 25.0 {
		t.Errorf("Mean = %f, want %f", result.Mean, 25.0)
	}
	if result.Min == nil || *result.Min != 1.0 {
		t.Errorf("Min = %v, want 1.0", result.Min)
	}
	if result.P50 == nil || *result.P50 != 12.5 {
		t.Errorf("P50 = %v, want 12.5", result.P50)
	}
	if result.P99 == nil || *result.P99 != 45.0 {
		t.Errorf("P99 = %v, want 45.0", result.P99)
	}
	if result.Max == nil || *result.Max != 100.0 {
		t.Errorf("Max = %v, want 100.0", result.Max)
	}
	// Fields not set should remain nil
	if result.P0p1 != nil {
		t.Errorf("P0p1 should be nil, got %v", result.P0p1)
	}
	if result.P1 != nil {
		t.Errorf("P1 should be nil, got %v", result.P1)
	}
	if result.Stddev != nil {
		t.Errorf("Stddev should be nil, got %v", result.Stddev)
	}
}

func TestConvertStats_MeanOnly(t *testing.T) {
	raw := &rawV1Statistics{
		Units: "tokens/s",
		Mean:  100.0,
	}
	result := convertStats(raw)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Mean != 100.0 {
		t.Errorf("Mean = %f, want 100.0", result.Mean)
	}
	if result.Units != "tokens/s" {
		t.Errorf("Units = %q, want %q", result.Units, "tokens/s")
	}
}

// ---------- scalarToStats ----------

func TestScalarToStats_Zero(t *testing.T) {
	result := scalarToStats(0, "tokens/s")
	if result != nil {
		t.Errorf("scalarToStats(0, ...) should return nil, got %+v", result)
	}
}

func TestScalarToStats_PositiveValue(t *testing.T) {
	result := scalarToStats(42.5, "requests/s")
	if result == nil {
		t.Fatal("expected non-nil result for positive value")
	}
	if result.Units != "requests/s" {
		t.Errorf("Units = %q, want %q", result.Units, "requests/s")
	}
	if result.Mean != 42.5 {
		t.Errorf("Mean = %f, want 42.5", result.Mean)
	}
	if result.P50 == nil || *result.P50 != 42.5 {
		t.Errorf("P50 = %v, want 42.5", result.P50)
	}
	// Other percentiles should be nil
	if result.P99 != nil {
		t.Errorf("P99 should be nil for scalar, got %v", result.P99)
	}
}

func TestScalarToStats_NegativeValue(t *testing.T) {
	// Negative values are technically non-zero so should produce a result
	result := scalarToStats(-5.0, "units")
	if result == nil {
		t.Fatal("expected non-nil result for negative non-zero value")
	}
	if result.Mean != -5.0 {
		t.Errorf("Mean = %f, want -5.0", result.Mean)
	}
}

// ---------- buildStackComponents ----------

func TestBuildStackComponents_Empty(t *testing.T) {
	raw := rawV1Report{}
	components := buildStackComponents(raw)
	if len(components) != 0 {
		t.Errorf("expected 0 components for empty report, got %d", len(components))
	}
}

func TestBuildStackComponents_SingleAccelerator(t *testing.T) {
	raw := rawV1Report{}
	raw.Scenario.Host.Accelerator = []struct {
		Count       int    `yaml:"count"`
		Model       string `yaml:"model"`
		Parallelism struct {
			DP int `yaml:"dp"`
			EP int `yaml:"ep"`
			PP int `yaml:"pp"`
			TP int `yaml:"tp"`
		} `yaml:"parallelism"`
	}{
		{
			Count: 8,
			Model: "H100",
			Parallelism: struct {
				DP int `yaml:"dp"`
				EP int `yaml:"ep"`
				PP int `yaml:"pp"`
				TP int `yaml:"tp"`
			}{DP: 1, TP: 8, PP: 1, EP: 1},
		},
	}
	raw.Scenario.Host.Type = []string{"prefill"}
	raw.Scenario.Model.Name = "llama-70b"
	raw.Scenario.Load.Args.Server.Type = "vllm"
	raw.Scenario.Platform.Engine = []struct {
		Name string                 `yaml:"name"`
		Args map[string]interface{} `yaml:"args"`
	}{
		{Name: "vllm-0.4.0"},
	}

	components := buildStackComponents(raw)
	if len(components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(components))
	}

	c := components[0]
	if c.Metadata.Label != "prefill-0" {
		t.Errorf("Label = %q, want %q", c.Metadata.Label, "prefill-0")
	}
	if c.Metadata.CfgID != "host-0" {
		t.Errorf("CfgID = %q, want %q", c.Metadata.CfgID, "host-0")
	}
	if c.Standardized.Kind != "inference_engine" {
		t.Errorf("Kind = %q, want %q", c.Standardized.Kind, "inference_engine")
	}
	if c.Standardized.Tool != "vllm" {
		t.Errorf("Tool = %q, want %q", c.Standardized.Tool, "vllm")
	}
	if c.Standardized.ToolVersion != "vllm-0.4.0" {
		t.Errorf("ToolVersion = %q, want %q", c.Standardized.ToolVersion, "vllm-0.4.0")
	}
	if c.Standardized.Role != "prefill" {
		t.Errorf("Role = %q, want %q", c.Standardized.Role, "prefill")
	}
	if c.Standardized.Model == nil || c.Standardized.Model.Name != "llama-70b" {
		t.Errorf("Model.Name = %v, want llama-70b", c.Standardized.Model)
	}
	if c.Standardized.Accelerator == nil {
		t.Fatal("Accelerator should not be nil")
	}
	if c.Standardized.Accelerator.Count != 8 {
		t.Errorf("Accelerator.Count = %d, want 8", c.Standardized.Accelerator.Count)
	}
	if c.Standardized.Accelerator.Model != "H100" {
		t.Errorf("Accelerator.Model = %q, want %q", c.Standardized.Accelerator.Model, "H100")
	}
	if c.Standardized.Accelerator.Parallelism.TP != 8 {
		t.Errorf("Parallelism.TP = %d, want 8", c.Standardized.Accelerator.Parallelism.TP)
	}
}

func TestBuildStackComponents_DefaultRole(t *testing.T) {
	// When Host.Type is empty, role defaults to "decode"
	raw := rawV1Report{}
	raw.Scenario.Host.Accelerator = []struct {
		Count       int    `yaml:"count"`
		Model       string `yaml:"model"`
		Parallelism struct {
			DP int `yaml:"dp"`
			EP int `yaml:"ep"`
			PP int `yaml:"pp"`
			TP int `yaml:"tp"`
		} `yaml:"parallelism"`
	}{
		{Count: 4, Model: "A100"},
	}

	components := buildStackComponents(raw)
	if len(components) != 1 {
		t.Fatalf("expected 1 component, got %d", len(components))
	}
	if components[0].Standardized.Role != "decode" {
		t.Errorf("Role = %q, want default %q", components[0].Standardized.Role, "decode")
	}
	if components[0].Metadata.Label != "decode-0" {
		t.Errorf("Label = %q, want %q", components[0].Metadata.Label, "decode-0")
	}
}

// ---------- buildLoadConfig ----------

func TestBuildLoadConfig_Basic(t *testing.T) {
	raw := rawV1Report{}
	raw.Scenario.Load.Metadata.Stage = 2
	raw.Scenario.Load.Name = "genai-perf"
	raw.Scenario.Load.Args.Data.SharedPrefix.SystemPromptLen = 100
	raw.Scenario.Load.Args.Data.SharedPrefix.QuestionLen = 50
	raw.Scenario.Load.Args.Data.SharedPrefix.OutputLen = 200
	raw.Scenario.Load.Args.Load.Stages = []struct {
		Rate     float64 `yaml:"rate"`
		Duration int     `yaml:"duration"`
	}{
		{Rate: 1.0, Duration: 60},
		{Rate: 2.5, Duration: 60},
		{Rate: 5.0, Duration: 60},
	}

	config := buildLoadConfig(raw)
	if config.Metadata.CfgID != "stage-2" {
		t.Errorf("CfgID = %q, want %q", config.Metadata.CfgID, "stage-2")
	}
	if config.Standardized.Tool != "genai-perf" {
		t.Errorf("Tool = %q, want %q", config.Standardized.Tool, "genai-perf")
	}
	if config.Standardized.ToolVersion != "v0.1" {
		t.Errorf("ToolVersion = %q, want %q", config.Standardized.ToolVersion, "v0.1")
	}
	if config.Standardized.Source != "random" {
		t.Errorf("Source = %q, want %q", config.Standardized.Source, "random")
	}
	if config.Standardized.InputSeqLen == nil {
		t.Fatal("InputSeqLen should not be nil")
	}
	if config.Standardized.InputSeqLen.Value != 150 { // 100 + 50
		t.Errorf("InputSeqLen.Value = %f, want 150", config.Standardized.InputSeqLen.Value)
	}
	if config.Standardized.OutputSeqLen == nil {
		t.Fatal("OutputSeqLen should not be nil")
	}
	if config.Standardized.OutputSeqLen.Value != 200 {
		t.Errorf("OutputSeqLen.Value = %f, want 200", config.Standardized.OutputSeqLen.Value)
	}
	// Stage 2 → index 1 → rate 2.5
	if config.Standardized.RateQPS == nil || *config.Standardized.RateQPS != 2.5 {
		t.Errorf("RateQPS = %v, want 2.5", config.Standardized.RateQPS)
	}
}

func TestBuildLoadConfig_StageOutOfRange(t *testing.T) {
	raw := rawV1Report{}
	raw.Scenario.Load.Metadata.Stage = 10 // beyond available stages
	raw.Scenario.Load.Args.Load.Stages = []struct {
		Rate     float64 `yaml:"rate"`
		Duration int     `yaml:"duration"`
	}{
		{Rate: 1.0, Duration: 60},
	}

	config := buildLoadConfig(raw)
	if config.Standardized.RateQPS != nil {
		t.Errorf("RateQPS should be nil when stage index is out of range, got %v", *config.Standardized.RateQPS)
	}
}

func TestBuildLoadConfig_StageZero(t *testing.T) {
	raw := rawV1Report{}
	raw.Scenario.Load.Metadata.Stage = 0 // stageIndex = -1
	raw.Scenario.Load.Args.Load.Stages = []struct {
		Rate     float64 `yaml:"rate"`
		Duration int     `yaml:"duration"`
	}{
		{Rate: 1.0, Duration: 60},
	}

	config := buildLoadConfig(raw)
	// stage 0 → stageIndex -1 → condition `stageIndex >= 0` is false
	if config.Standardized.RateQPS != nil {
		t.Errorf("RateQPS should be nil for stage 0, got %v", *config.Standardized.RateQPS)
	}
}

// ---------- adaptV1ToV2 ----------

func TestAdaptV1ToV2_BasicStructure(t *testing.T) {
	raw := rawV1Report{}
	raw.Metrics.Time.Duration = 120.0
	raw.Metrics.Requests.Total = 1000
	raw.Metrics.Requests.Failures = 5
	raw.Metrics.Throughput.OutputTokensPerSec = 500.0
	raw.Metrics.Throughput.TotalTokensPerSec = 800.0
	raw.Metrics.Throughput.RequestsPerSec = 8.3
	raw.Scenario.Load.Metadata.Stage = 1

	report := adaptV1ToV2(raw, "exp-001", "run-a", "2025-01-15T10:00:00Z")

	if report.Version != "0.2" {
		t.Errorf("Version = %q, want %q", report.Version, "0.2")
	}
	if report.Run.UID != "exp-001/run-a/stage-1" {
		t.Errorf("UID = %q, want %q", report.Run.UID, "exp-001/run-a/stage-1")
	}
	if report.Run.EID != "exp-001/run-a" {
		t.Errorf("EID = %q, want %q", report.Run.EID, "exp-001/run-a")
	}
	if report.Run.User != "benchmark-ci" {
		t.Errorf("User = %q, want %q", report.Run.User, "benchmark-ci")
	}
	if report.Run.Time.Duration != "PT120S" {
		t.Errorf("Duration = %q, want %q", report.Run.Time.Duration, "PT120S")
	}
	if report.Run.Time.End != "2025-01-15T10:00:00Z" {
		t.Errorf("End = %q, want %q", report.Run.Time.End, "2025-01-15T10:00:00Z")
	}

	// Verify request stats
	agg := report.Results.RequestPerformance.Aggregate
	if agg.Requests.Total != 1000 {
		t.Errorf("Requests.Total = %d, want 1000", agg.Requests.Total)
	}
	if agg.Requests.Failures != 5 {
		t.Errorf("Requests.Failures = %d, want 5", agg.Requests.Failures)
	}

	// Throughput
	if agg.Throughput.OutputTokenRate == nil {
		t.Fatal("OutputTokenRate should not be nil")
	}
	if agg.Throughput.OutputTokenRate.Mean != 500.0 {
		t.Errorf("OutputTokenRate.Mean = %f, want 500.0", agg.Throughput.OutputTokenRate.Mean)
	}
	// InputTokenRate = total - output = 800 - 500 = 300
	if agg.Throughput.InputTokenRate == nil {
		t.Fatal("InputTokenRate should not be nil")
	}
	if agg.Throughput.InputTokenRate.Mean != 300.0 {
		t.Errorf("InputTokenRate.Mean = %f, want 300.0", agg.Throughput.InputTokenRate.Mean)
	}
}

func TestAdaptV1ToV2_NegativeInputRate(t *testing.T) {
	// When output > total (data error), inputTokenRate should be omitted
	raw := rawV1Report{}
	raw.Metrics.Throughput.OutputTokensPerSec = 1000.0
	raw.Metrics.Throughput.TotalTokensPerSec = 500.0 // less than output
	raw.Scenario.Load.Metadata.Stage = 1

	report := adaptV1ToV2(raw, "exp", "run", "")

	agg := report.Results.RequestPerformance.Aggregate
	if agg.Throughput.InputTokenRate != nil {
		t.Errorf("InputTokenRate should be nil when derived value is negative, got %+v",
			agg.Throughput.InputTokenRate)
	}
}

func TestAdaptV1ToV2_InvalidCreatedTime(t *testing.T) {
	raw := rawV1Report{}
	raw.Metrics.Time.Duration = 60.0
	raw.Scenario.Load.Metadata.Stage = 1

	report := adaptV1ToV2(raw, "exp", "run", "not-a-timestamp")

	// Should fall back to time.Now() — just verify the fields are non-empty
	if report.Run.Time.Start == "" {
		t.Error("Start should not be empty even with invalid fileCreatedTime")
	}
	if report.Run.Time.End == "" {
		t.Error("End should not be empty even with invalid fileCreatedTime")
	}
}

func TestAdaptV1ToV2_NilLatencyStats(t *testing.T) {
	// All latency fields nil → should not panic
	raw := rawV1Report{}
	raw.Scenario.Load.Metadata.Stage = 1

	report := adaptV1ToV2(raw, "exp", "run", "")

	agg := report.Results.RequestPerformance.Aggregate
	if agg.Latency.TimeToFirstToken != nil {
		t.Error("TimeToFirstToken should be nil when raw has no data")
	}
	if agg.Latency.RequestLatency != nil {
		t.Error("RequestLatency should be nil when raw has no data")
	}
}

// ---------- parseDriveTime ----------

func TestParseDriveTime_Valid(t *testing.T) {
	ts, ok := parseDriveTime("2025-01-15T10:30:00Z")
	if !ok {
		t.Fatal("expected ok=true for valid RFC3339")
	}
	if ts.Year() != 2025 || ts.Month() != 1 || ts.Day() != 15 {
		t.Errorf("unexpected date: %v", ts)
	}
}

func TestParseDriveTime_Empty(t *testing.T) {
	_, ok := parseDriveTime("")
	if ok {
		t.Error("expected ok=false for empty string")
	}
}

func TestParseDriveTime_Invalid(t *testing.T) {
	_, ok := parseDriveTime("not-a-date")
	if ok {
		t.Error("expected ok=false for invalid string")
	}
}

func TestParseDriveTime_WithOffset(t *testing.T) {
	ts, ok := parseDriveTime("2025-03-20T14:30:00+05:30")
	if !ok {
		t.Fatal("expected ok=true for RFC3339 with offset")
	}
	if ts.Year() != 2025 || ts.Month() != 3 || ts.Day() != 20 {
		t.Errorf("unexpected date: %v", ts)
	}
}
