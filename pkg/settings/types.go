package settings

// SettingsFile is the top-level structure for ~/.kc/settings.json
type SettingsFile struct {
	Version        int               `json:"version"`
	LastModified   string            `json:"lastModified"`
	Settings       PlaintextSettings `json:"settings"`
	Encrypted      EncryptedSettings `json:"encrypted"`
	KeyFingerprint string            `json:"keyFingerprint"`
}

// PlaintextSettings holds non-sensitive user preferences
type PlaintextSettings struct {
	AIMode        string                `json:"aiMode"`
	Predictions   PredictionSettings    `json:"predictions"`
	TokenUsage    TokenUsageSettings    `json:"tokenUsage"`
	Theme         string                `json:"theme"`
	Accessibility AccessibilitySettings `json:"accessibility"`
	Profile       ProfileSettings       `json:"profile"`
	Widget        WidgetSettings        `json:"widget"`
}

// PredictionSettings mirrors the frontend PredictionSettings type
type PredictionSettings struct {
	AIEnabled      bool                   `json:"aiEnabled"`
	Interval       int                    `json:"interval"`
	MinConfidence  int                    `json:"minConfidence"`
	MaxPredictions int                    `json:"maxPredictions"`
	ConsensusMode  bool                   `json:"consensusMode"`
	Thresholds     PredictionThresholds   `json:"thresholds"`
}

// PredictionThresholds holds the threshold values for heuristic predictions
type PredictionThresholds struct {
	HighRestartCount  int `json:"highRestartCount"`
	CPUPressure       int `json:"cpuPressure"`
	MemoryPressure    int `json:"memoryPressure"`
	GPUMemoryPressure int `json:"gpuMemoryPressure"`
}

// TokenUsageSettings holds token limit and threshold configuration
type TokenUsageSettings struct {
	Limit             int     `json:"limit"`
	WarningThreshold  float64 `json:"warningThreshold"`
	CriticalThreshold float64 `json:"criticalThreshold"`
	StopThreshold     float64 `json:"stopThreshold"`
}

// AccessibilitySettings holds UI accessibility preferences
type AccessibilitySettings struct {
	ColorBlindMode bool `json:"colorBlindMode"`
	ReduceMotion   bool `json:"reduceMotion"`
	HighContrast   bool `json:"highContrast"`
}

// ProfileSettings holds basic user profile info
type ProfileSettings struct {
	Email   string `json:"email"`
	SlackID string `json:"slackId"`
}

// WidgetSettings holds desktop widget preferences
type WidgetSettings struct {
	SelectedWidget string `json:"selectedWidget"`
}

// EncryptedField holds AES-256-GCM encrypted data
type EncryptedField struct {
	Ciphertext string `json:"ciphertext"` // base64-encoded ciphertext (includes GCM tag)
	IV         string `json:"iv"`         // base64-encoded 12-byte nonce
}

// EncryptedSettings groups all sensitive fields (stored encrypted on disk)
type EncryptedSettings struct {
	APIKeys       *EncryptedField `json:"apiKeys,omitempty"`
	GitHubToken   *EncryptedField `json:"githubToken,omitempty"`
	Notifications *EncryptedField `json:"notifications,omitempty"`
}

// AllSettings is the combined decrypted view sent to/from the frontend
type AllSettings struct {
	// Non-sensitive (plaintext)
	AIMode        string                `json:"aiMode"`
	Predictions   PredictionSettings    `json:"predictions"`
	TokenUsage    TokenUsageSettings    `json:"tokenUsage"`
	Theme         string                `json:"theme"`
	Accessibility AccessibilitySettings `json:"accessibility"`
	Profile       ProfileSettings       `json:"profile"`
	Widget        WidgetSettings        `json:"widget"`

	// Auto-update configuration
	AutoUpdateEnabled bool   `json:"autoUpdateEnabled"`
	AutoUpdateChannel string `json:"autoUpdateChannel"`

	// Sensitive (decrypted for transit, encrypted at rest)
	APIKeys       map[string]APIKeyEntry `json:"apiKeys"`
	GitHubToken   string                 `json:"githubToken"`
	Notifications NotificationSecrets    `json:"notifications"`
}

// APIKeyEntry holds a provider's API key and optional model override
type APIKeyEntry struct {
	APIKey string `json:"apiKey"`
	Model  string `json:"model,omitempty"`
}

// NotificationSecrets holds sensitive notification configuration
type NotificationSecrets struct {
	SlackWebhookURL string `json:"slackWebhookUrl,omitempty"`
	SlackChannel    string `json:"slackChannel,omitempty"`
	EmailSMTPHost   string `json:"emailSMTPHost,omitempty"`
	EmailSMTPPort   int    `json:"emailSMTPPort,omitempty"`
	EmailFrom       string `json:"emailFrom,omitempty"`
	EmailTo         string `json:"emailTo,omitempty"`
	EmailUsername   string `json:"emailUsername,omitempty"`
	EmailPassword   string `json:"emailPassword,omitempty"`
}

// DefaultSettings returns a SettingsFile with sensible defaults
func DefaultSettings() *SettingsFile {
	return &SettingsFile{
		Version: 1,
		Settings: PlaintextSettings{
			AIMode: "medium",
			Predictions: PredictionSettings{
				AIEnabled:      true,
				Interval:       60,
				MinConfidence:  60,
				MaxPredictions: 10,
				Thresholds: PredictionThresholds{
					HighRestartCount:  3,
					CPUPressure:       80,
					MemoryPressure:    85,
					GPUMemoryPressure: 90,
				},
			},
			TokenUsage: TokenUsageSettings{
				Limit:             500000000,
				WarningThreshold:  0.7,
				CriticalThreshold: 0.9,
				StopThreshold:     1.0,
			},
			Theme: "kubestellar",
			Accessibility: AccessibilitySettings{},
			Profile:       ProfileSettings{},
			Widget:        WidgetSettings{SelectedWidget: "browser"},
		},
		Encrypted: EncryptedSettings{},
	}
}

// DefaultAllSettings returns an AllSettings with sensible defaults
func DefaultAllSettings() *AllSettings {
	d := DefaultSettings()
	return &AllSettings{
		AIMode:        d.Settings.AIMode,
		Predictions:   d.Settings.Predictions,
		TokenUsage:    d.Settings.TokenUsage,
		Theme:         d.Settings.Theme,
		Accessibility: d.Settings.Accessibility,
		Profile:       d.Settings.Profile,
		Widget:        d.Settings.Widget,
		APIKeys:       make(map[string]APIKeyEntry),
		Notifications: NotificationSecrets{},
	}
}
