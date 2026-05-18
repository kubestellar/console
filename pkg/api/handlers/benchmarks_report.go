package handlers

import (
	"fmt"
	"log/slog"
	"time"
)

// v0.2 output structs — match the TypeScript BenchmarkReport interface.
type BenchmarkStatistics struct {
	Units  string   `json:"units"`
	Mean   float64  `json:"mean"`
	Min    *float64 `json:"min,omitempty"`
	P0p1   *float64 `json:"p0p1,omitempty"`
	P1     *float64 `json:"p1,omitempty"`
	P5     *float64 `json:"p5,omitempty"`
	P10    *float64 `json:"p10,omitempty"`
	P25    *float64 `json:"p25,omitempty"`
	P50    *float64 `json:"p50,omitempty"`
	P75    *float64 `json:"p75,omitempty"`
	P90    *float64 `json:"p90,omitempty"`
	P95    *float64 `json:"p95,omitempty"`
	P99    *float64 `json:"p99,omitempty"`
	P99p9  *float64 `json:"p99p9,omitempty"`
	Max    *float64 `json:"max,omitempty"`
	Stddev *float64 `json:"stddev,omitempty"`
}

type BenchmarkAccelerator struct {
	Model       string                `json:"model"`
	Count       int                   `json:"count"`
	Memory      *int                  `json:"memory,omitempty"`
	Parallelism *BenchmarkParallelism `json:"parallelism,omitempty"`
}

type BenchmarkParallelism struct {
	DP int `json:"dp"`
	TP int `json:"tp"`
	PP int `json:"pp"`
	EP int `json:"ep"`
}

type BenchmarkStackComponent struct {
	Metadata struct {
		Label       string `json:"label"`
		CfgID       string `json:"cfg_id"`
		Description string `json:"description,omitempty"`
	} `json:"metadata"`
	Standardized struct {
		Kind        string                `json:"kind"`
		Tool        string                `json:"tool"`
		ToolVersion string                `json:"tool_version"`
		Role        string                `json:"role,omitempty"`
		Replicas    *int                  `json:"replicas,omitempty"`
		Model       *BenchmarkModelRef    `json:"model,omitempty"`
		Accelerator *BenchmarkAccelerator `json:"accelerator,omitempty"`
	} `json:"standardized"`
}

type BenchmarkModelRef struct {
	Name         string `json:"name"`
	Quantization string `json:"quantization,omitempty"`
}

type BenchmarkLoadConfig struct {
	Metadata struct {
		CfgID       string `json:"cfg_id"`
		Description string `json:"description,omitempty"`
	} `json:"metadata"`
	Standardized struct {
		Tool         string                 `json:"tool"`
		ToolVersion  string                 `json:"tool_version"`
		Source       string                 `json:"source"`
		InputSeqLen  *BenchmarkDistribution `json:"input_seq_len,omitempty"`
		OutputSeqLen *BenchmarkDistribution `json:"output_seq_len,omitempty"`
		RateQPS      *float64               `json:"rate_qps,omitempty"`
		Concurrency  *int                   `json:"concurrency,omitempty"`
	} `json:"standardized"`
}

type BenchmarkDistribution struct {
	Distribution string  `json:"distribution"`
	Value        float64 `json:"value"`
}

type BenchmarkLatencyStats struct {
	TimeToFirstToken             *BenchmarkStatistics `json:"time_to_first_token,omitempty"`
	TimePerOutputToken           *BenchmarkStatistics `json:"time_per_output_token,omitempty"`
	InterTokenLatency            *BenchmarkStatistics `json:"inter_token_latency,omitempty"`
	NormalizedTimePerOutputToken *BenchmarkStatistics `json:"normalized_time_per_output_token,omitempty"`
	RequestLatency               *BenchmarkStatistics `json:"request_latency,omitempty"`
}

type BenchmarkThroughputStats struct {
	InputTokenRate  *BenchmarkStatistics `json:"input_token_rate,omitempty"`
	OutputTokenRate *BenchmarkStatistics `json:"output_token_rate,omitempty"`
	TotalTokenRate  *BenchmarkStatistics `json:"total_token_rate,omitempty"`
	RequestRate     *BenchmarkStatistics `json:"request_rate,omitempty"`
}

type BenchmarkRequestStats struct {
	Total        int                  `json:"total"`
	Failures     int                  `json:"failures"`
	Incomplete   *int                 `json:"incomplete,omitempty"`
	InputLength  *BenchmarkStatistics `json:"input_length,omitempty"`
	OutputLength *BenchmarkStatistics `json:"output_length,omitempty"`
}

type BenchmarkReport struct {
	Version string `json:"version"`
	Run     struct {
		UID  string `json:"uid"`
		EID  string `json:"eid"`
		CID  string `json:"cid,omitempty"`
		Time struct {
			Start    string `json:"start"`
			End      string `json:"end"`
			Duration string `json:"duration"`
		} `json:"time"`
		User string `json:"user"`
	} `json:"run"`
	Scenario struct {
		Stack []BenchmarkStackComponent `json:"stack"`
		Load  BenchmarkLoadConfig       `json:"load"`
	} `json:"scenario"`
	Results struct {
		RequestPerformance struct {
			Aggregate struct {
				Requests   BenchmarkRequestStats    `json:"requests"`
				Latency    BenchmarkLatencyStats    `json:"latency"`
				Throughput BenchmarkThroughputStats `json:"throughput"`
			} `json:"aggregate"`
		} `json:"request_performance"`
		Observability *struct {
			Metrics []interface{} `json:"metrics,omitempty"`
		} `json:"observability,omitempty"`
		ComponentHealth []interface{} `json:"component_health,omitempty"`
	} `json:"results"`
}

// v0.1 raw YAML structures — match the actual benchmark output.
type rawV1Statistics struct {
	Units string   `yaml:"units" json:"units"`
	Mean  float64  `yaml:"mean" json:"mean"`
	Min   *float64 `yaml:"min" json:"min"`
	P0p1  *float64 `yaml:"p0p1" json:"p0p1"`
	P1    *float64 `yaml:"p1" json:"p1"`
	P5    *float64 `yaml:"p5" json:"p5"`
	P10   *float64 `yaml:"p10" json:"p10"`
	P25   *float64 `yaml:"p25" json:"p25"`
	P50   *float64 `yaml:"p50" json:"p50"`
	P75   *float64 `yaml:"p75" json:"p75"`
	P90   *float64 `yaml:"p90" json:"p90"`
	P95   *float64 `yaml:"p95" json:"p95"`
	P99   *float64 `yaml:"p99" json:"p99"`
	P99p9 *float64 `yaml:"p99p9" json:"p99p9"`
	Max   *float64 `yaml:"max" json:"max"`
}

type rawV1Report struct {
	Version string `yaml:"version"`
	Metrics struct {
		Latency struct {
			TimeToFirstToken             *rawV1Statistics `yaml:"time_to_first_token"`
			TimePerOutputToken           *rawV1Statistics `yaml:"time_per_output_token"`
			InterTokenLatency            *rawV1Statistics `yaml:"inter_token_latency"`
			NormalizedTimePerOutputToken *rawV1Statistics `yaml:"normalized_time_per_output_token"`
			RequestLatency               *rawV1Statistics `yaml:"request_latency"`
		} `yaml:"latency"`
		Throughput struct {
			OutputTokensPerSec float64 `yaml:"output_tokens_per_sec"`
			RequestsPerSec     float64 `yaml:"requests_per_sec"`
			TotalTokensPerSec  float64 `yaml:"total_tokens_per_sec"`
		} `yaml:"throughput"`
		Requests struct {
			Total        int              `yaml:"total"`
			Failures     int              `yaml:"failures"`
			InputLength  *rawV1Statistics `yaml:"input_length"`
			OutputLength *rawV1Statistics `yaml:"output_length"`
		} `yaml:"requests"`
		Time struct {
			Duration float64 `yaml:"duration"`
		} `yaml:"time"`
	} `yaml:"metrics"`
	Scenario struct {
		Host struct {
			Accelerator []struct {
				Count       int    `yaml:"count"`
				Model       string `yaml:"model"`
				Parallelism struct {
					DP int `yaml:"dp"`
					EP int `yaml:"ep"`
					PP int `yaml:"pp"`
					TP int `yaml:"tp"`
				} `yaml:"parallelism"`
			} `yaml:"accelerator"`
			Type []string `yaml:"type"`
		} `yaml:"host"`
		Load struct {
			Args struct {
				Data struct {
					Type         string `yaml:"type"`
					SharedPrefix struct {
						NumGroups          int `yaml:"num_groups"`
						NumPromptsPerGroup int `yaml:"num_prompts_per_group"`
						OutputLen          int `yaml:"output_len"`
						QuestionLen        int `yaml:"question_len"`
						SystemPromptLen    int `yaml:"system_prompt_len"`
					} `yaml:"shared_prefix"`
				} `yaml:"data"`
				Load struct {
					Type   string `yaml:"type"`
					Stages []struct {
						Rate     float64 `yaml:"rate"`
						Duration int     `yaml:"duration"`
					} `yaml:"stages"`
					NumWorkers int `yaml:"num_workers"`
				} `yaml:"load"`
				Server struct {
					Type      string `yaml:"type"`
					ModelName string `yaml:"model_name"`
					BaseURL   string `yaml:"base_url"`
					IgnoreEOS bool   `yaml:"ignore_eos"`
				} `yaml:"server"`
			} `yaml:"args"`
			Metadata struct {
				Stage int `yaml:"stage"`
			} `yaml:"metadata"`
			Name string `yaml:"name"`
		} `yaml:"load"`
		Model struct {
			Name string `yaml:"name"`
		} `yaml:"model"`
		Platform struct {
			Engine []struct {
				Name string                 `yaml:"name"`
				Args map[string]interface{} `yaml:"args"`
			} `yaml:"engine"`
			Metadata map[string]interface{} `yaml:"metadata"`
		} `yaml:"platform"`
	} `yaml:"scenario"`
}

func adaptV1ToV2(raw rawV1Report, experimentName, runName, fileCreatedTime string) BenchmarkReport {
	var report BenchmarkReport
	report.Version = "0.2"
	report.Run.UID = fmt.Sprintf("%s/%s/stage-%d", experimentName, runName, raw.Scenario.Load.Metadata.Stage)
	report.Run.EID = fmt.Sprintf("%s/%s", experimentName, runName)
	report.Run.User = "benchmark-ci"

	durationSec := raw.Metrics.Time.Duration
	report.Run.Time.Duration = fmt.Sprintf("PT%.0fS", durationSec)
	if created, ok := parseDriveTime(fileCreatedTime); ok {
		report.Run.Time.End = created.Format(time.RFC3339)
		report.Run.Time.Start = created.Add(-time.Duration(durationSec) * time.Second).Format(time.RFC3339)
	} else {
		report.Run.Time.Start = time.Now().Add(-time.Duration(durationSec) * time.Second).Format(time.RFC3339)
		report.Run.Time.End = time.Now().Format(time.RFC3339)
	}

	report.Scenario.Stack = buildStackComponents(raw)
	report.Scenario.Load = buildLoadConfig(raw)

	agg := &report.Results.RequestPerformance.Aggregate
	agg.Latency.TimeToFirstToken = convertStats(raw.Metrics.Latency.TimeToFirstToken)
	agg.Latency.TimePerOutputToken = convertStats(raw.Metrics.Latency.TimePerOutputToken)
	agg.Latency.InterTokenLatency = convertStats(raw.Metrics.Latency.InterTokenLatency)
	agg.Latency.NormalizedTimePerOutputToken = convertStats(raw.Metrics.Latency.NormalizedTimePerOutputToken)
	agg.Latency.RequestLatency = convertStats(raw.Metrics.Latency.RequestLatency)

	agg.Throughput.OutputTokenRate = scalarToStats(raw.Metrics.Throughput.OutputTokensPerSec, "tokens/s")
	agg.Throughput.RequestRate = scalarToStats(raw.Metrics.Throughput.RequestsPerSec, "requests/s")
	agg.Throughput.TotalTokenRate = scalarToStats(raw.Metrics.Throughput.TotalTokensPerSec, "tokens/s")
	inputRate := raw.Metrics.Throughput.TotalTokensPerSec - raw.Metrics.Throughput.OutputTokensPerSec
	if inputRate > 0 {
		agg.Throughput.InputTokenRate = scalarToStats(inputRate, "tokens/s")
	} else if inputRate < 0 {
		slog.Warn("[benchmarks] negative derived input_token_rate, skipping field",
			"inputRate", inputRate, "experiment", experimentName, "run", runName,
			"stage", raw.Scenario.Load.Metadata.Stage,
			"totalTokensPerSec", raw.Metrics.Throughput.TotalTokensPerSec,
			"outputTokensPerSec", raw.Metrics.Throughput.OutputTokensPerSec)
	}

	agg.Requests.Total = raw.Metrics.Requests.Total
	agg.Requests.Failures = raw.Metrics.Requests.Failures
	agg.Requests.InputLength = convertStats(raw.Metrics.Requests.InputLength)
	agg.Requests.OutputLength = convertStats(raw.Metrics.Requests.OutputLength)

	return report
}

func buildStackComponents(raw rawV1Report) []BenchmarkStackComponent {
	components := make([]BenchmarkStackComponent, 0, len(raw.Scenario.Host.Accelerator))
	for i, accelerator := range raw.Scenario.Host.Accelerator {
		role := "decode"
		if i < len(raw.Scenario.Host.Type) {
			role = raw.Scenario.Host.Type[i]
		}

		engineName := ""
		if i < len(raw.Scenario.Platform.Engine) {
			engineName = raw.Scenario.Platform.Engine[i].Name
		}

		component := BenchmarkStackComponent{}
		component.Metadata.Label = fmt.Sprintf("%s-%d", role, i)
		component.Metadata.CfgID = fmt.Sprintf("host-%d", i)
		component.Standardized.Kind = "inference_engine"
		component.Standardized.Tool = raw.Scenario.Load.Args.Server.Type
		component.Standardized.ToolVersion = engineName
		component.Standardized.Role = role
		component.Standardized.Model = &BenchmarkModelRef{Name: raw.Scenario.Model.Name}
		component.Standardized.Accelerator = &BenchmarkAccelerator{
			Model: accelerator.Model,
			Count: accelerator.Count,
			Parallelism: &BenchmarkParallelism{
				DP: accelerator.Parallelism.DP,
				TP: accelerator.Parallelism.TP,
				PP: accelerator.Parallelism.PP,
				EP: accelerator.Parallelism.EP,
			},
		}
		components = append(components, component)
	}
	return components
}

func buildLoadConfig(raw rawV1Report) BenchmarkLoadConfig {
	var config BenchmarkLoadConfig
	config.Metadata.CfgID = fmt.Sprintf("stage-%d", raw.Scenario.Load.Metadata.Stage)
	config.Metadata.Description = fmt.Sprintf("Stage %d of benchmark run", raw.Scenario.Load.Metadata.Stage)
	config.Standardized.Tool = raw.Scenario.Load.Name
	config.Standardized.ToolVersion = "v0.1"
	config.Standardized.Source = "random"

	sharedPrefix := raw.Scenario.Load.Args.Data.SharedPrefix
	config.Standardized.InputSeqLen = &BenchmarkDistribution{
		Distribution: "fixed",
		Value:        float64(sharedPrefix.SystemPromptLen + sharedPrefix.QuestionLen),
	}
	config.Standardized.OutputSeqLen = &BenchmarkDistribution{
		Distribution: "fixed",
		Value:        float64(sharedPrefix.OutputLen),
	}

	stageIndex := raw.Scenario.Load.Metadata.Stage - 1
	stages := raw.Scenario.Load.Args.Load.Stages
	if stageIndex >= 0 && stageIndex < len(stages) {
		rate := stages[stageIndex].Rate
		config.Standardized.RateQPS = &rate
	}

	return config
}

// convertStats converts a v0.1 Statistics to v0.2 format (same shape, just remap).
func convertStats(raw *rawV1Statistics) *BenchmarkStatistics {
	if raw == nil {
		return nil
	}
	return &BenchmarkStatistics{
		Units: raw.Units,
		Mean:  raw.Mean,
		Min:   raw.Min,
		P0p1:  raw.P0p1,
		P1:    raw.P1,
		P5:    raw.P5,
		P10:   raw.P10,
		P25:   raw.P25,
		P50:   raw.P50,
		P75:   raw.P75,
		P90:   raw.P90,
		P95:   raw.P95,
		P99:   raw.P99,
		P99p9: raw.P99p9,
		Max:   raw.Max,
	}
}

// scalarToStats wraps a scalar value into a Statistics object.
func scalarToStats(value float64, units string) *BenchmarkStatistics {
	if value == 0 {
		return nil
	}
	return &BenchmarkStatistics{
		Units: units,
		Mean:  value,
		P50:   &value,
	}
}
