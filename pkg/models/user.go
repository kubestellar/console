package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a console user
type User struct {
	ID          uuid.UUID  `json:"id"`
	GitHubID    string     `json:"github_id"`
	GitHubLogin string     `json:"github_login"`
	Email       string     `json:"email,omitempty"`
	AvatarURL   string     `json:"avatar_url,omitempty"`
	Onboarded   bool       `json:"onboarded"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLogin   *time.Time `json:"last_login,omitempty"`
}

// OnboardingResponse stores user's answer to an onboarding question
type OnboardingResponse struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"user_id"`
	QuestionKey string    `json:"question_key"`
	Answer      string    `json:"answer"`
	CreatedAt   time.Time `json:"created_at"`
}

// OnboardingQuestion defines an onboarding question
type OnboardingQuestion struct {
	Key         string   `json:"key"`
	Question    string   `json:"question"`
	Description string   `json:"description,omitempty"`
	Options     []string `json:"options"`
	MultiSelect bool     `json:"multi_select"`
}

// GetOnboardingQuestions returns the list of onboarding questions
func GetOnboardingQuestions() []OnboardingQuestion {
	return []OnboardingQuestion{
		{
			Key:         "role",
			Question:    "What's your primary role?",
			Description: "This helps us customize your dashboard",
			Options:     []string{"SRE", "DevOps", "Platform Engineer", "Developer", "DBA", "Network Engineer"},
		},
		{
			Key:         "focus_layer",
			Question:    "Which layer do you focus on most?",
			Description: "We'll prioritize relevant information",
			Options:     []string{"Infrastructure (nodes, storage)", "Platform (K8s, operators)", "Application", "Database", "Network"},
		},
		{
			Key:         "cluster_count",
			Question:    "How many clusters do you typically manage?",
			Options:     []string{"1-3", "4-10", "10-50", "50+"},
		},
		{
			Key:         "daily_challenge",
			Question:    "What's your biggest daily challenge?",
			Options:     []string{"Troubleshooting issues", "Deployments", "Capacity planning", "Security/compliance", "Upgrades"},
		},
		{
			Key:         "gitops",
			Question:    "Do you use GitOps?",
			Options:     []string{"Yes, heavily", "Sometimes", "No"},
		},
		{
			Key:         "monitoring_priority",
			Question:    "What monitoring matters most?",
			Options:     []string{"Availability", "Performance", "Cost", "Security", "All equally"},
		},
		{
			Key:         "data_preference",
			Question:    "How do you prefer to see data?",
			Options:     []string{"Graphs/charts", "Tables/lists", "Event streams", "Mixed"},
		},
		{
			Key:         "gpu_workloads",
			Question:    "Do you manage GPU workloads?",
			Options:     []string{"Yes", "No"},
		},
		{
			Key:         "alert_threshold",
			Question:    "What's your preferred alert threshold?",
			Description: "How sensitive should notifications be?",
			Options:     []string{"Aggressive (show everything)", "Balanced", "Conservative (critical only)"},
		},
		{
			Key:         "regulated",
			Question:    "Do you work in a regulated environment?",
			Options:     []string{"Yes (compliance important)", "No"},
		},
	}
}
