package settings

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultSettings(t *testing.T) {
	t.Run("returns non-nil settings", func(t *testing.T) {
		s := DefaultSettings()
		require.NotNil(t, s)
	})

	t.Run("sets expected default values", func(t *testing.T) {
		s := DefaultSettings()

		require.Equal(t, 1, s.Version)
		require.Equal(t, "medium", s.Settings.AIMode)
		require.Equal(t, "kubestellar", s.Settings.Theme)
		require.Equal(t, "browser", s.Settings.Widget.SelectedWidget)
	})

	t.Run("prediction settings have sensible defaults", func(t *testing.T) {
		s := DefaultSettings()
		p := s.Settings.Predictions

		require.True(t, p.AIEnabled)
		require.Equal(t, 60, p.Interval)
		require.Equal(t, 60, p.MinConfidence)
		require.Equal(t, 10, p.MaxPredictions)
		require.False(t, p.ConsensusMode)
	})

	t.Run("prediction thresholds have defaults", func(t *testing.T) {
		s := DefaultSettings()
		th := s.Settings.Predictions.Thresholds

		require.Equal(t, 3, th.HighRestartCount)
		require.Equal(t, 80, th.CPUPressure)
		require.Equal(t, 85, th.MemoryPressure)
		require.Equal(t, 90, th.GPUMemoryPressure)
	})

	t.Run("token usage settings have defaults", func(t *testing.T) {
		s := DefaultSettings()
		tu := s.Settings.TokenUsage

		require.Equal(t, 500000000, tu.Limit)
		require.Equal(t, 0.7, tu.WarningThreshold)
		require.Equal(t, 0.9, tu.CriticalThreshold)
		require.Equal(t, 1.0, tu.StopThreshold)
	})

	t.Run("accessibility settings default to false", func(t *testing.T) {
		s := DefaultSettings()
		acc := s.Settings.Accessibility

		require.False(t, acc.ColorBlindMode)
		require.False(t, acc.ReduceMotion)
		require.False(t, acc.HighContrast)
	})

	t.Run("encrypted settings are empty", func(t *testing.T) {
		s := DefaultSettings()
		require.NotNil(t, s.Encrypted)
		require.Nil(t, s.Encrypted.APIKeys)
		require.Nil(t, s.Encrypted.GitHubToken)
		require.Nil(t, s.Encrypted.FeedbackGitHubToken)
		require.Nil(t, s.Encrypted.Notifications)
	})
}

func TestDefaultAllSettings(t *testing.T) {
	t.Run("returns non-nil settings", func(t *testing.T) {
		s := DefaultAllSettings()
		require.NotNil(t, s)
	})

	t.Run("mirrors defaults from DefaultSettings", func(t *testing.T) {
		s := DefaultAllSettings()

		require.Equal(t, "medium", s.AIMode)
		require.Equal(t, "kubestellar", s.Theme)
		require.Equal(t, "browser", s.Widget.SelectedWidget)
		require.Equal(t, 60, s.Predictions.Interval)
		require.Equal(t, 500000000, s.TokenUsage.Limit)
	})

	t.Run("initializes empty maps and structs", func(t *testing.T) {
		s := DefaultAllSettings()

		require.NotNil(t, s.APIKeys)
		require.Empty(t, s.APIKeys)
		require.NotNil(t, s.Notifications)
		require.Empty(t, s.Notifications.SlackWebhookURL)
	})

	t.Run("has no feedback token by default", func(t *testing.T) {
		s := DefaultAllSettings()

		require.Empty(t, s.FeedbackGitHubToken)
		require.False(t, s.HasFeedbackToken)
		require.Empty(t, s.FeedbackGitHubTokenSource)
	})
}

func TestSettingsFile_JSONSerialization(t *testing.T) {
	t.Run("round-trip preserves structure", func(t *testing.T) {
		original := &SettingsFile{
			Version:      1,
			LastModified: "2024-01-15T10:00:00Z",
			Settings: PlaintextSettings{
				AIMode: "high",
				Predictions: PredictionSettings{
					AIEnabled:     true,
					Interval:      120,
					MinConfidence: 70,
				},
				Theme: "dark",
			},
			KeyFingerprint: "abc123",
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded SettingsFile
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.Version, decoded.Version)
		require.Equal(t, original.LastModified, decoded.LastModified)
		require.Equal(t, original.Settings.AIMode, decoded.Settings.AIMode)
		require.Equal(t, original.Settings.Theme, decoded.Settings.Theme)
		require.Equal(t, original.KeyFingerprint, decoded.KeyFingerprint)
	})

	t.Run("CustomThemes preserves raw JSON", func(t *testing.T) {
		customThemes := json.RawMessage(`[{"name":"MyTheme","colors":{}}]`)
		sf := &SettingsFile{
			Version: 1,
			Settings: PlaintextSettings{
				CustomThemes: customThemes,
			},
		}

		data, err := json.Marshal(sf)
		require.NoError(t, err)

		var decoded SettingsFile
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.NotNil(t, decoded.Settings.CustomThemes)
		require.JSONEq(t, string(customThemes), string(decoded.Settings.CustomThemes))
	})
}

func TestAllSettings_ClientSafeCopy(t *testing.T) {
	t.Run("removes FeedbackGitHubToken", func(t *testing.T) {
		original := &AllSettings{
			AIMode:              "medium",
			FeedbackGitHubToken: "ghp_secrettoken123",
			APIKeys: map[string]APIKeyEntry{
				"anthropic": {APIKey: "sk-ant-key"},
			},
		}

		safe := original.ClientSafeCopy()

		require.Empty(t, safe.FeedbackGitHubToken, "token should be removed")
		require.True(t, safe.HasFeedbackToken, "HasFeedbackToken should be true")
		require.Equal(t, original.AIMode, safe.AIMode)
		require.Equal(t, original.APIKeys, safe.APIKeys)
	})

	t.Run("sets HasFeedbackToken to false when no token", func(t *testing.T) {
		original := &AllSettings{
			AIMode:              "low",
			FeedbackGitHubToken: "",
		}

		safe := original.ClientSafeCopy()

		require.Empty(t, safe.FeedbackGitHubToken)
		require.False(t, safe.HasFeedbackToken)
	})

	t.Run("returns nil for nil input", func(t *testing.T) {
		var original *AllSettings = nil
		safe := original.ClientSafeCopy()
		require.Nil(t, safe)
	})

	t.Run("does not modify original", func(t *testing.T) {
		original := &AllSettings{
			AIMode:              "medium",
			FeedbackGitHubToken: "secret",
		}

		safe := original.ClientSafeCopy()

		require.Equal(t, "secret", original.FeedbackGitHubToken, "original should not be modified")
		require.Empty(t, safe.FeedbackGitHubToken)
	})

	t.Run("preserves all non-sensitive fields", func(t *testing.T) {
		original := &AllSettings{
			AIMode: "high",
			Predictions: PredictionSettings{
				AIEnabled: true,
				Interval:  90,
			},
			TokenUsage: TokenUsageSettings{
				Limit: 1000000,
			},
			Theme: "nord",
			Accessibility: AccessibilitySettings{
				HighContrast: true,
			},
			Profile: ProfileSettings{
				Email: "user@example.com",
			},
			Widget: WidgetSettings{
				SelectedWidget: "cli",
			},
			FeedbackGitHubToken:       "token",
			FeedbackGitHubTokenSource: "settings",
		}

		safe := original.ClientSafeCopy()

		require.Equal(t, original.AIMode, safe.AIMode)
		require.Equal(t, original.Predictions, safe.Predictions)
		require.Equal(t, original.TokenUsage, safe.TokenUsage)
		require.Equal(t, original.Theme, safe.Theme)
		require.Equal(t, original.Accessibility, safe.Accessibility)
		require.Equal(t, original.Profile, safe.Profile)
		require.Equal(t, original.Widget, safe.Widget)
		require.Equal(t, original.FeedbackGitHubTokenSource, safe.FeedbackGitHubTokenSource)
	})
}

func TestAllSettings_PreserveFeedbackTokenFrom(t *testing.T) {
	t.Run("preserves token and source from existing", func(t *testing.T) {
		existing := &AllSettings{
			FeedbackGitHubToken:       "ghp_existingtoken",
			FeedbackGitHubTokenSource: "env",
			HasFeedbackToken:          true,
		}

		incoming := &AllSettings{
			AIMode: "updated",
		}

		incoming.PreserveFeedbackTokenFrom(existing)

		require.Equal(t, "ghp_existingtoken", incoming.FeedbackGitHubToken)
		require.Equal(t, "env", incoming.FeedbackGitHubTokenSource)
		require.True(t, incoming.HasFeedbackToken)
	})

	t.Run("sets HasFeedbackToken false when existing has no token", func(t *testing.T) {
		existing := &AllSettings{
			FeedbackGitHubToken:       "",
			FeedbackGitHubTokenSource: "",
		}

		incoming := &AllSettings{
			AIMode: "low",
		}

		incoming.PreserveFeedbackTokenFrom(existing)

		require.Empty(t, incoming.FeedbackGitHubToken)
		require.Empty(t, incoming.FeedbackGitHubTokenSource)
		require.False(t, incoming.HasFeedbackToken)
	})

	t.Run("no-op when incoming is nil", func(t *testing.T) {
		existing := &AllSettings{
			FeedbackGitHubToken: "token",
		}

		var incoming *AllSettings = nil
		incoming.PreserveFeedbackTokenFrom(existing)
	})

	t.Run("no-op when existing is nil", func(t *testing.T) {
		incoming := &AllSettings{
			AIMode: "medium",
		}

		var existing *AllSettings = nil
		incoming.PreserveFeedbackTokenFrom(existing)

		require.Empty(t, incoming.FeedbackGitHubToken)
	})
}

func TestResolveGitHubTokenEnv(t *testing.T) {
	t.Run("prefers FEEDBACK_GITHUB_TOKEN", func(t *testing.T) {
		os.Setenv("FEEDBACK_GITHUB_TOKEN", "ghp_feedback")
		os.Setenv("GITHUB_TOKEN", "ghp_generic")
		defer func() {
			os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
			os.Unsetenv("GITHUB_TOKEN")
		}()

		token := ResolveGitHubTokenEnv()
		require.Equal(t, "ghp_feedback", token)
	})

	t.Run("falls back to GITHUB_TOKEN", func(t *testing.T) {
		os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
		os.Setenv("GITHUB_TOKEN", "ghp_generic")
		defer os.Unsetenv("GITHUB_TOKEN")

		token := ResolveGitHubTokenEnv()
		require.Equal(t, "ghp_generic", token)
	})

	t.Run("returns empty when neither is set", func(t *testing.T) {
		os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
		os.Unsetenv("GITHUB_TOKEN")

		token := ResolveGitHubTokenEnv()
		require.Empty(t, token)
	})

	t.Run("empty FEEDBACK_GITHUB_TOKEN falls back to GITHUB_TOKEN", func(t *testing.T) {
		os.Setenv("FEEDBACK_GITHUB_TOKEN", "")
		os.Setenv("GITHUB_TOKEN", "ghp_fallback")
		defer func() {
			os.Unsetenv("FEEDBACK_GITHUB_TOKEN")
			os.Unsetenv("GITHUB_TOKEN")
		}()

		token := ResolveGitHubTokenEnv()
		require.Equal(t, "ghp_fallback", token)
	})
}

func TestGitHubTokenSource_Constants(t *testing.T) {
	require.Equal(t, "settings", GitHubTokenSourceSettings)
	require.Equal(t, "env", GitHubTokenSourceEnv)
}

func TestEncryptedField_JSONSerialization(t *testing.T) {
	t.Run("marshal and unmarshal", func(t *testing.T) {
		ef := EncryptedField{
			Ciphertext: "base64encrypteddata==",
			IV:         "base64iv==",
		}

		data, err := json.Marshal(ef)
		require.NoError(t, err)

		var decoded EncryptedField
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, ef.Ciphertext, decoded.Ciphertext)
		require.Equal(t, ef.IV, decoded.IV)
	})

	t.Run("empty fields serialize", func(t *testing.T) {
		ef := EncryptedField{}

		data, err := json.Marshal(ef)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "", m["ciphertext"])
		require.Equal(t, "", m["iv"])
	})
}

func TestAPIKeyEntry_JSONSerialization(t *testing.T) {
	t.Run("with model override", func(t *testing.T) {
		entry := APIKeyEntry{
			APIKey: "sk-key123",
			Model:  "claude-3-opus",
		}

		data, err := json.Marshal(entry)
		require.NoError(t, err)

		var decoded APIKeyEntry
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, entry.APIKey, decoded.APIKey)
		require.Equal(t, entry.Model, decoded.Model)
	})

	t.Run("without model override", func(t *testing.T) {
		entry := APIKeyEntry{
			APIKey: "sk-key456",
		}

		data, err := json.Marshal(entry)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "sk-key456", m["apiKey"])
		_, hasModel := m["model"]
		require.False(t, hasModel, "empty model should be omitted")
	})
}

func TestNotificationSecrets_JSONSerialization(t *testing.T) {
	t.Run("all fields present", func(t *testing.T) {
		ns := NotificationSecrets{
			SlackWebhookURL: "https://hooks.slack.com/xxx",
			SlackChannel:    "#alerts",
			EmailSMTPHost:   "smtp.example.com",
			EmailSMTPPort:   587,
			EmailFrom:       "alerts@example.com",
			EmailTo:         "oncall@example.com",
			EmailUsername:   "smtp_user",
			EmailPassword:   "smtp_pass",
		}

		data, err := json.Marshal(ns)
		require.NoError(t, err)

		var decoded NotificationSecrets
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, ns.SlackWebhookURL, decoded.SlackWebhookURL)
		require.Equal(t, ns.SlackChannel, decoded.SlackChannel)
		require.Equal(t, ns.EmailSMTPHost, decoded.EmailSMTPHost)
		require.Equal(t, ns.EmailSMTPPort, decoded.EmailSMTPPort)
		require.Equal(t, ns.EmailFrom, decoded.EmailFrom)
		require.Equal(t, ns.EmailTo, decoded.EmailTo)
		require.Equal(t, ns.EmailUsername, decoded.EmailUsername)
		require.Equal(t, ns.EmailPassword, decoded.EmailPassword)
	})

	t.Run("omitempty fields absent when empty", func(t *testing.T) {
		ns := NotificationSecrets{
			SlackWebhookURL: "https://hooks.slack.com/yyy",
		}

		data, err := json.Marshal(ns)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasChannel := m["slackChannel"]
		_, hasHost := m["emailSMTPHost"]

		assert.False(t, hasChannel)
		assert.False(t, hasHost)
	})
}

func TestPredictionSettings_JSONSerialization(t *testing.T) {
	t.Run("round-trip preserves all fields", func(t *testing.T) {
		ps := PredictionSettings{
			AIEnabled:      false,
			Interval:       120,
			MinConfidence:  80,
			MaxPredictions: 5,
			ConsensusMode:  true,
			Thresholds: PredictionThresholds{
				HighRestartCount:  5,
				CPUPressure:       90,
				MemoryPressure:    95,
				GPUMemoryPressure: 85,
			},
		}

		data, err := json.Marshal(ps)
		require.NoError(t, err)

		var decoded PredictionSettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, ps.AIEnabled, decoded.AIEnabled)
		require.Equal(t, ps.Interval, decoded.Interval)
		require.Equal(t, ps.MinConfidence, decoded.MinConfidence)
		require.Equal(t, ps.MaxPredictions, decoded.MaxPredictions)
		require.Equal(t, ps.ConsensusMode, decoded.ConsensusMode)
		require.Equal(t, ps.Thresholds, decoded.Thresholds)
	})
}

func TestTokenUsageSettings_JSONSerialization(t *testing.T) {
	t.Run("round-trip preserves thresholds", func(t *testing.T) {
		tus := TokenUsageSettings{
			Limit:             100000,
			WarningThreshold:  0.6,
			CriticalThreshold: 0.85,
			StopThreshold:     0.95,
		}

		data, err := json.Marshal(tus)
		require.NoError(t, err)

		var decoded TokenUsageSettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, tus.Limit, decoded.Limit)
		require.Equal(t, tus.WarningThreshold, decoded.WarningThreshold)
		require.Equal(t, tus.CriticalThreshold, decoded.CriticalThreshold)
		require.Equal(t, tus.StopThreshold, decoded.StopThreshold)
	})

	t.Run("float precision is preserved", func(t *testing.T) {
		tus := TokenUsageSettings{
			WarningThreshold: 0.777,
		}

		data, err := json.Marshal(tus)
		require.NoError(t, err)

		var decoded TokenUsageSettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.InDelta(t, 0.777, decoded.WarningThreshold, 0.0001)
	})
}

func TestAccessibilitySettings_JSONSerialization(t *testing.T) {
	t.Run("all boolean flags serialize correctly", func(t *testing.T) {
		acc := AccessibilitySettings{
			ColorBlindMode: true,
			ReduceMotion:   true,
			HighContrast:   false,
		}

		data, err := json.Marshal(acc)
		require.NoError(t, err)

		var decoded AccessibilitySettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.True(t, decoded.ColorBlindMode)
		require.True(t, decoded.ReduceMotion)
		require.False(t, decoded.HighContrast)
	})
}

func TestPlaintextSettings_JSONSerialization(t *testing.T) {
	t.Run("round-trip with CustomThemes", func(t *testing.T) {
		customThemes := json.RawMessage(`[{"name":"Custom","colors":{"bg":"#000"}}]`)
		ps := PlaintextSettings{
			AIMode:       "low",
			Theme:        "custom-dark",
			CustomThemes: customThemes,
		}

		data, err := json.Marshal(ps)
		require.NoError(t, err)

		var decoded PlaintextSettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, ps.AIMode, decoded.AIMode)
		require.Equal(t, ps.Theme, decoded.Theme)
		require.JSONEq(t, string(customThemes), string(decoded.CustomThemes))
	})

	t.Run("CustomThemes omitempty when nil", func(t *testing.T) {
		ps := PlaintextSettings{
			AIMode: "medium",
		}

		data, err := json.Marshal(ps)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasCustomThemes := m["customThemes"]
		assert.False(t, hasCustomThemes)
	})
}

func TestAllSettings_JSONRoundTrip(t *testing.T) {
	t.Run("full settings round-trip", func(t *testing.T) {
		original := &AllSettings{
			AIMode: "high",
			Predictions: PredictionSettings{
				AIEnabled:     true,
				Interval:      60,
				MinConfidence: 70,
			},
			TokenUsage: TokenUsageSettings{
				Limit:             1000000,
				WarningThreshold:  0.8,
				CriticalThreshold: 0.9,
				StopThreshold:     1.0,
			},
			Theme: "dracula",
			Accessibility: AccessibilitySettings{
				HighContrast: true,
			},
			Profile: ProfileSettings{
				Email:   "test@example.com",
				SlackID: "U123",
			},
			Widget: WidgetSettings{
				SelectedWidget: "browser",
			},
			APIKeys: map[string]APIKeyEntry{
				"anthropic": {APIKey: "sk-ant-123", Model: "claude-3-opus"},
			},
			FeedbackGitHubToken:       "ghp_token",
			HasFeedbackToken:          true,
			FeedbackGitHubTokenSource: "settings",
			Notifications: NotificationSecrets{
				SlackWebhookURL: "https://hooks.slack.com/xxx",
			},
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded AllSettings
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.AIMode, decoded.AIMode)
		require.Equal(t, original.Theme, decoded.Theme)
		require.Equal(t, original.FeedbackGitHubToken, decoded.FeedbackGitHubToken)
		require.Equal(t, original.HasFeedbackToken, decoded.HasFeedbackToken)
		require.Equal(t, original.FeedbackGitHubTokenSource, decoded.FeedbackGitHubTokenSource)
		require.Len(t, decoded.APIKeys, 1)
		require.Equal(t, original.Notifications.SlackWebhookURL, decoded.Notifications.SlackWebhookURL)
	})
}
