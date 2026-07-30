package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUser_JSONSerialization(t *testing.T) {
	t.Run("marshal includes all fields", func(t *testing.T) {
		userID := uuid.New()
		now := time.Now().UTC()
		user := User{
			ID:          userID,
			GitHubID:    "123456",
			GitHubLogin: "testuser",
			Email:       "test@example.com",
			SlackID:     "U123ABC",
			AvatarURL:   "https://avatar.url",
			Role:        UserRoleAdmin,
			Onboarded:   true,
			CreatedAt:   now,
			LastLogin:   &now,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, userID.String(), m["id"])
		require.Equal(t, "123456", m["github_id"])
		require.Equal(t, "testuser", m["github_login"])
		require.Equal(t, "test@example.com", m["email"])
		require.Equal(t, "U123ABC", m["slack_id"])
		require.Equal(t, "https://avatar.url", m["avatar_url"])
		require.Equal(t, "admin", m["role"])
		require.Equal(t, true, m["onboarded"])
	})

	t.Run("omitempty fields absent when empty", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "minimal",
			Role:        UserRoleViewer,
			Onboarded:   false,
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasEmail := m["email"]
		require.False(t, hasEmail, "empty email should be omitted")
		_, hasSlack := m["slack_id"]
		require.False(t, hasSlack, "empty slack_id should be omitted")
		_, hasAvatar := m["avatar_url"]
		require.False(t, hasAvatar, "empty avatar_url should be omitted")
		_, hasLastLogin := m["last_login"]
		require.False(t, hasLastLogin, "nil last_login should be omitted")
	})

	t.Run("round-trip preserves structure", func(t *testing.T) {
		now := time.Now().UTC()
		original := User{
			ID:          uuid.New(),
			GitHubID:    "999",
			GitHubLogin: "roundtrip",
			Email:       "roundtrip@example.com",
			Role:        UserRoleEditor,
			Onboarded:   true,
			CreatedAt:   now,
			LastLogin:   &now,
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded User
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.ID, decoded.ID)
		require.Equal(t, original.GitHubID, decoded.GitHubID)
		require.Equal(t, original.GitHubLogin, decoded.GitHubLogin)
		require.Equal(t, original.Email, decoded.Email)
		require.Equal(t, original.Role, decoded.Role)
		require.Equal(t, original.Onboarded, decoded.Onboarded)
	})

	t.Run("nil last_login omitted in JSON", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "noLogin",
			Role:        UserRoleViewer,
			CreatedAt:   time.Now(),
			LastLogin:   nil,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasLastLogin := m["last_login"]
		require.False(t, hasLastLogin)
	})

	t.Run("pointer last_login serializes when set", func(t *testing.T) {
		loginTime := time.Now().UTC()
		user := User{
			ID:          uuid.New(),
			GitHubID:    "456",
			GitHubLogin: "withLogin",
			Role:        UserRoleViewer,
			CreatedAt:   time.Now(),
			LastLogin:   &loginTime,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded User
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.NotNil(t, decoded.LastLogin)
		require.WithinDuration(t, loginTime, *decoded.LastLogin, time.Second)
	})
}

func TestUser_IdentityConstruction(t *testing.T) {
	t.Run("minimal user identity is valid", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "12345",
			GitHubLogin: "basicuser",
			Role:        UserRoleViewer,
			CreatedAt:   time.Now(),
		}

		require.NotEqual(t, uuid.Nil, user.ID)
		require.NotEmpty(t, user.GitHubID)
		require.NotEmpty(t, user.GitHubLogin)
		require.NotEmpty(t, user.Role)
	})

	t.Run("user with all optional fields", func(t *testing.T) {
		now := time.Now()
		user := User{
			ID:          uuid.New(),
			GitHubID:    "99999",
			GitHubLogin: "fulluser",
			Email:       "full@example.com",
			SlackID:     "U999",
			AvatarURL:   "https://example.com/avatar.png",
			Role:        UserRoleAdmin,
			Onboarded:   true,
			CreatedAt:   now,
			LastLogin:   &now,
		}

		require.NotEmpty(t, user.Email)
		require.NotEmpty(t, user.SlackID)
		require.NotEmpty(t, user.AvatarURL)
		require.True(t, user.Onboarded)
		require.NotNil(t, user.LastLogin)
	})

	t.Run("zero-valued UUID is serializable", func(t *testing.T) {
		user := User{
			ID:          uuid.UUID{},
			GitHubID:    "123",
			GitHubLogin: "user",
			Role:        UserRoleViewer,
			CreatedAt:   time.Time{},
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded User
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, uuid.UUID{}, decoded.ID)
	})
}

func TestOnboardingResponse_JSONSerialization(t *testing.T) {
	t.Run("marshal includes all fields", func(t *testing.T) {
		respID := uuid.New()
		userID := uuid.New()
		now := time.Now().UTC()

		resp := OnboardingResponse{
			ID:          respID,
			UserID:      userID,
			QuestionKey: "role",
			Answer:      "SRE",
			CreatedAt:   now,
		}

		data, err := json.Marshal(resp)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, respID.String(), m["id"])
		require.Equal(t, userID.String(), m["user_id"])
		require.Equal(t, "role", m["question_key"])
		require.Equal(t, "SRE", m["answer"])
	})

	t.Run("round-trip preserves fields", func(t *testing.T) {
		original := OnboardingResponse{
			ID:          uuid.New(),
			UserID:      uuid.New(),
			QuestionKey: "cluster_count",
			Answer:      "10-50",
			CreatedAt:   time.Now().UTC(),
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded OnboardingResponse
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.ID, decoded.ID)
		require.Equal(t, original.UserID, decoded.UserID)
		require.Equal(t, original.QuestionKey, decoded.QuestionKey)
		require.Equal(t, original.Answer, decoded.Answer)
	})

	t.Run("empty answer is preserved", func(t *testing.T) {
		resp := OnboardingResponse{
			ID:          uuid.New(),
			UserID:      uuid.New(),
			QuestionKey: "optional_question",
			Answer:      "",
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(resp)
		require.NoError(t, err)

		var decoded OnboardingResponse
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, "", decoded.Answer)
	})
}

func TestOnboardingQuestion_JSONSerialization(t *testing.T) {
	t.Run("marshal includes all fields", func(t *testing.T) {
		q := OnboardingQuestion{
			Key:         "role",
			Question:    "What's your primary role?",
			Description: "This helps us customize your dashboard",
			Options:     []string{"SRE", "DevOps", "Developer"},
			MultiSelect: false,
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "role", m["key"])
		require.Equal(t, "What's your primary role?", m["question"])
		require.Equal(t, "This helps us customize your dashboard", m["description"])
		require.NotNil(t, m["options"])
		require.False(t, m["multi_select"].(bool))
	})

	t.Run("omitempty description absent when empty", func(t *testing.T) {
		q := OnboardingQuestion{
			Key:      "simple",
			Question: "Simple question?",
			Options:  []string{"Yes", "No"},
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasDescription := m["description"]
		require.False(t, hasDescription, "empty description should be omitted")
	})

	t.Run("multi-select question", func(t *testing.T) {
		q := OnboardingQuestion{
			Key:         "features",
			Question:    "Which features interest you?",
			Options:     []string{"Feature A", "Feature B", "Feature C"},
			MultiSelect: true,
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var decoded OnboardingQuestion
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.True(t, decoded.MultiSelect)
		require.Len(t, decoded.Options, 3)
	})

	t.Run("empty options list is preserved", func(t *testing.T) {
		q := OnboardingQuestion{
			Key:      "freetext",
			Question: "Your thoughts?",
			Options:  []string{},
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var decoded OnboardingQuestion
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.NotNil(t, decoded.Options)
		require.Empty(t, decoded.Options)
	})
}

func TestGetOnboardingQuestions_Structure(t *testing.T) {
	questions := GetOnboardingQuestions()
	require.NotEmpty(t, questions, "should return at least one question")

	t.Run("all questions have required fields", func(t *testing.T) {
		for _, q := range questions {
			require.NotEmpty(t, q.Key, "question key should not be empty")
			require.NotEmpty(t, q.Question, "question text should not be empty")
			require.NotEmpty(t, q.Options, "options should not be empty")
		}
	})

	t.Run("question keys are unique", func(t *testing.T) {
		keys := make(map[string]bool)
		for _, q := range questions {
			require.False(t, keys[q.Key], "duplicate question key: %s", q.Key)
			keys[q.Key] = true
		}
	})

	t.Run("expected questions are present", func(t *testing.T) {
		keySet := make(map[string]bool)
		for _, q := range questions {
			keySet[q.Key] = true
		}

		expectedKeys := []string{
			"role",
			"focus_layer",
			"cluster_count",
			"daily_challenge",
			"gitops",
			"monitoring_priority",
			"data_preference",
			"gpu_workloads",
			"alert_threshold",
			"regulated",
		}

		for _, key := range expectedKeys {
			require.True(t, keySet[key], "expected question key not found: %s", key)
		}
	})

	t.Run("role question has expected structure", func(t *testing.T) {
		var roleQuestion *OnboardingQuestion
		for _, q := range questions {
			if q.Key == "role" {
				roleQuestion = &q
				break
			}
		}

		require.NotNil(t, roleQuestion, "role question should exist")
		require.Equal(t, "What's your primary role?", roleQuestion.Question)
		require.NotEmpty(t, roleQuestion.Description)
		require.Contains(t, roleQuestion.Options, "SRE")
		require.Contains(t, roleQuestion.Options, "DevOps")
	})

	t.Run("gpu_workloads question is boolean choice", func(t *testing.T) {
		var gpuQuestion *OnboardingQuestion
		for _, q := range questions {
			if q.Key == "gpu_workloads" {
				gpuQuestion = &q
				break
			}
		}

		require.NotNil(t, gpuQuestion)
		require.Len(t, gpuQuestion.Options, 2)
		require.Contains(t, gpuQuestion.Options, "Yes")
		require.Contains(t, gpuQuestion.Options, "No")
	})
}

func TestUser_EdgeCases(t *testing.T) {
	t.Run("user with empty strings for optional fields", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "user",
			Email:       "",
			SlackID:     "",
			AvatarURL:   "",
			Role:        UserRoleViewer,
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasEmail := m["email"]
		_, hasSlack := m["slack_id"]
		_, hasAvatar := m["avatar_url"]

		assert.False(t, hasEmail, "empty email should be omitted")
		assert.False(t, hasSlack, "empty slack_id should be omitted")
		assert.False(t, hasAvatar, "empty avatar_url should be omitted")
	})

	t.Run("onboarded false is serialized", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "newuser",
			Role:        UserRoleViewer,
			Onboarded:   false,
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, false, m["onboarded"])
	})

	t.Run("empty role is preserved", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "norole",
			Role:        UserRole(""),
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded User
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, UserRole(""), decoded.Role)
	})

	t.Run("invalid role value is preserved", func(t *testing.T) {
		user := User{
			ID:          uuid.New(),
			GitHubID:    "123",
			GitHubLogin: "invalidrole",
			Role:        UserRole("superuser"),
			CreatedAt:   time.Now(),
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var decoded User
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, UserRole("superuser"), decoded.Role)
	})
}

func TestOnboardingQuestion_EdgeCases(t *testing.T) {
	t.Run("question with single option", func(t *testing.T) {
		q := OnboardingQuestion{
			Key:      "single",
			Question: "Only one choice?",
			Options:  []string{"Only Option"},
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var decoded OnboardingQuestion
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Len(t, decoded.Options, 1)
	})

	t.Run("question with many options", func(t *testing.T) {
		opts := make([]string, 20)
		for i := range opts {
			opts[i] = "Option " + string(rune('A'+i))
		}

		q := OnboardingQuestion{
			Key:      "many",
			Question: "Choose from many?",
			Options:  opts,
		}

		data, err := json.Marshal(q)
		require.NoError(t, err)

		var decoded OnboardingQuestion
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Len(t, decoded.Options, 20)
	})
}
