package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTeamRole_Constants(t *testing.T) {
	require.Equal(t, TeamRole("admin"), TeamRoleAdmin)
	require.Equal(t, TeamRole("member"), TeamRoleMember)
}

func TestTeam_JSONSerialization(t *testing.T) {
	t.Run("marshal includes expected fields", func(t *testing.T) {
		teamID := uuid.New()
		creatorID := uuid.New()
		now := time.Now().UTC()

		team := Team{
			ID:          teamID,
			Name:        "Platform Team",
			Description: "Core platform engineering",
			CreatedBy:   creatorID,
			MemberCount: 5,
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		data, err := json.Marshal(team)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, teamID.String(), m["id"])
		require.Equal(t, "Platform Team", m["name"])
		require.Equal(t, "Core platform engineering", m["description"])
		require.Equal(t, creatorID.String(), m["createdBy"])
		require.Equal(t, float64(5), m["memberCount"])
	})

	t.Run("omitempty description is absent when empty", func(t *testing.T) {
		team := Team{
			ID:          uuid.New(),
			Name:        "Team Without Description",
			CreatedBy:   uuid.New(),
			MemberCount: 0,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		data, err := json.Marshal(team)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasDescription := m["description"]
		require.False(t, hasDescription, "empty description should be omitted")
	})

	t.Run("round-trip preserves all fields", func(t *testing.T) {
		original := Team{
			ID:          uuid.New(),
			Name:        "Security Team",
			Description: "Security operations and compliance",
			CreatedBy:   uuid.New(),
			MemberCount: 3,
			CreatedAt:   time.Now().UTC(),
			UpdatedAt:   time.Now().UTC(),
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded Team
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.ID, decoded.ID)
		require.Equal(t, original.Name, decoded.Name)
		require.Equal(t, original.Description, decoded.Description)
		require.Equal(t, original.CreatedBy, decoded.CreatedBy)
		require.Equal(t, original.MemberCount, decoded.MemberCount)
	})

	t.Run("empty team has zero member count", func(t *testing.T) {
		team := Team{
			ID:        uuid.New(),
			Name:      "Empty Team",
			CreatedBy: uuid.New(),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		data, err := json.Marshal(team)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, float64(0), m["memberCount"])
	})
}

func TestTeamMembership_JSONSerialization(t *testing.T) {
	t.Run("marshal includes expected fields", func(t *testing.T) {
		membershipID := uuid.New()
		teamID := uuid.New()
		userID := uuid.New()
		now := time.Now().UTC()

		membership := TeamMembership{
			ID:        membershipID,
			TeamID:    teamID,
			UserID:    userID,
			Role:      TeamRoleAdmin,
			CreatedAt: now,
		}

		data, err := json.Marshal(membership)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, membershipID.String(), m["id"])
		require.Equal(t, teamID.String(), m["teamId"])
		require.Equal(t, userID.String(), m["userId"])
		require.Equal(t, "admin", m["role"])
	})

	t.Run("member role serializes correctly", func(t *testing.T) {
		membership := TeamMembership{
			ID:        uuid.New(),
			TeamID:    uuid.New(),
			UserID:    uuid.New(),
			Role:      TeamRoleMember,
			CreatedAt: time.Now(),
		}

		data, err := json.Marshal(membership)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "member", m["role"])
	})

	t.Run("round-trip preserves all fields", func(t *testing.T) {
		original := TeamMembership{
			ID:        uuid.New(),
			TeamID:    uuid.New(),
			UserID:    uuid.New(),
			Role:      TeamRoleAdmin,
			CreatedAt: time.Now().UTC(),
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded TeamMembership
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.ID, decoded.ID)
		require.Equal(t, original.TeamID, decoded.TeamID)
		require.Equal(t, original.UserID, decoded.UserID)
		require.Equal(t, original.Role, decoded.Role)
	})
}

func TestCreateTeamRequest_JSONSerialization(t *testing.T) {
	t.Run("deserialize with all fields", func(t *testing.T) {
		payload := `{
			"name": "DevOps Team",
			"description": "DevOps and automation",
			"memberIds": ["user1", "user2", "user3"]
		}`

		var req CreateTeamRequest
		require.NoError(t, json.Unmarshal([]byte(payload), &req))

		require.Equal(t, "DevOps Team", req.Name)
		require.Equal(t, "DevOps and automation", req.Description)
		require.Equal(t, []string{"user1", "user2", "user3"}, req.MemberIDs)
	})

	t.Run("omitempty fields can be absent", func(t *testing.T) {
		payload := `{"name": "Minimal Team"}`

		var req CreateTeamRequest
		require.NoError(t, json.Unmarshal([]byte(payload), &req))

		require.Equal(t, "Minimal Team", req.Name)
		require.Empty(t, req.Description)
		require.Nil(t, req.MemberIDs)
	})

	t.Run("empty member list serializes correctly", func(t *testing.T) {
		req := CreateTeamRequest{
			Name:      "Team",
			MemberIDs: []string{},
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded CreateTeamRequest
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.NotNil(t, decoded.MemberIDs)
		require.Empty(t, decoded.MemberIDs)
	})
}

func TestUpdateTeamRequest_JSONSerialization(t *testing.T) {
	t.Run("update name only", func(t *testing.T) {
		name := "Updated Team Name"
		req := UpdateTeamRequest{Name: &name}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "Updated Team Name", m["name"])
		_, hasDescription := m["description"]
		require.False(t, hasDescription)
	})

	t.Run("update description only", func(t *testing.T) {
		desc := "New description"
		req := UpdateTeamRequest{Description: &desc}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "New description", m["description"])
		_, hasName := m["name"]
		require.False(t, hasName)
	})

	t.Run("update both fields", func(t *testing.T) {
		name := "New Name"
		desc := "New Description"
		req := UpdateTeamRequest{
			Name:        &name,
			Description: &desc,
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded UpdateTeamRequest
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.NotNil(t, decoded.Name)
		require.Equal(t, "New Name", *decoded.Name)
		require.NotNil(t, decoded.Description)
		require.Equal(t, "New Description", *decoded.Description)
	})

	t.Run("nil pointers omit fields", func(t *testing.T) {
		req := UpdateTeamRequest{}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Empty(t, m)
	})
}

func TestAddTeamMemberRequest_JSONSerialization(t *testing.T) {
	t.Run("admin role", func(t *testing.T) {
		req := AddTeamMemberRequest{
			UserID: "user123",
			Role:   TeamRoleAdmin,
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "user123", m["userId"])
		require.Equal(t, "admin", m["role"])
	})

	t.Run("member role", func(t *testing.T) {
		req := AddTeamMemberRequest{
			UserID: "user456",
			Role:   TeamRoleMember,
		}

		data, err := json.Marshal(req)
		require.NoError(t, err)

		var decoded AddTeamMemberRequest
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, "user456", decoded.UserID)
		require.Equal(t, TeamRoleMember, decoded.Role)
	})

	t.Run("deserialize from JSON payload", func(t *testing.T) {
		payload := `{"userId": "abc-123", "role": "member"}`

		var req AddTeamMemberRequest
		require.NoError(t, json.Unmarshal([]byte(payload), &req))

		require.Equal(t, "abc-123", req.UserID)
		require.Equal(t, TeamRoleMember, req.Role)
	})
}

func TestTeamWithMembers_JSONSerialization(t *testing.T) {
	t.Run("embedded team fields are present", func(t *testing.T) {
		teamID := uuid.New()
		userID1 := uuid.New()
		userID2 := uuid.New()

		twm := TeamWithMembers{
			Team: Team{
				ID:          teamID,
				Name:        "Full Team",
				Description: "Team with members",
				CreatedBy:   uuid.New(),
				MemberCount: 2,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			Members: []TeamMemberInfo{
				{
					UserID:      userID1,
					GitHubLogin: "alice",
					AvatarURL:   "https://avatar.url/alice",
					Role:        TeamRoleAdmin,
					Email:       "alice@example.com",
				},
				{
					UserID:      userID2,
					GitHubLogin: "bob",
					Role:        TeamRoleMember,
				},
			},
		}

		data, err := json.Marshal(twm)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, teamID.String(), m["id"])
		require.Equal(t, "Full Team", m["name"])
		require.Equal(t, "Team with members", m["description"])
		require.NotNil(t, m["members"])

		members := m["members"].([]interface{})
		require.Len(t, members, 2)

		member1 := members[0].(map[string]interface{})
		require.Equal(t, userID1.String(), member1["userId"])
		require.Equal(t, "alice", member1["githubLogin"])
		require.Equal(t, "admin", member1["role"])
	})

	t.Run("empty member list serializes as empty array", func(t *testing.T) {
		twm := TeamWithMembers{
			Team: Team{
				ID:        uuid.New(),
				Name:      "Empty Team",
				CreatedBy: uuid.New(),
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			Members: []TeamMemberInfo{},
		}

		data, err := json.Marshal(twm)
		require.NoError(t, err)

		var decoded TeamWithMembers
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.NotNil(t, decoded.Members)
		require.Empty(t, decoded.Members)
	})

	t.Run("round-trip preserves structure", func(t *testing.T) {
		original := TeamWithMembers{
			Team: Team{
				ID:          uuid.New(),
				Name:        "Test Team",
				CreatedBy:   uuid.New(),
				MemberCount: 1,
				CreatedAt:   time.Now().UTC(),
				UpdatedAt:   time.Now().UTC(),
			},
			Members: []TeamMemberInfo{
				{
					UserID:      uuid.New(),
					GitHubLogin: "testuser",
					Role:        TeamRoleMember,
				},
			},
		}

		data, err := json.Marshal(original)
		require.NoError(t, err)

		var decoded TeamWithMembers
		require.NoError(t, json.Unmarshal(data, &decoded))

		require.Equal(t, original.Team.ID, decoded.Team.ID)
		require.Equal(t, original.Team.Name, decoded.Team.Name)
		require.Len(t, decoded.Members, 1)
		require.Equal(t, original.Members[0].UserID, decoded.Members[0].UserID)
		require.Equal(t, original.Members[0].Role, decoded.Members[0].Role)
	})
}

func TestTeamMemberInfo_JSONSerialization(t *testing.T) {
	t.Run("all fields present", func(t *testing.T) {
		userID := uuid.New()
		info := TeamMemberInfo{
			UserID:      userID,
			GitHubLogin: "johndoe",
			AvatarURL:   "https://example.com/avatar.png",
			Role:        TeamRoleAdmin,
			Email:       "john@example.com",
		}

		data, err := json.Marshal(info)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, userID.String(), m["userId"])
		require.Equal(t, "johndoe", m["githubLogin"])
		require.Equal(t, "https://example.com/avatar.png", m["avatarUrl"])
		require.Equal(t, "admin", m["role"])
		require.Equal(t, "john@example.com", m["email"])
	})

	t.Run("omitempty fields absent when empty", func(t *testing.T) {
		info := TeamMemberInfo{
			UserID:      uuid.New(),
			GitHubLogin: "minimaluser",
			Role:        TeamRoleMember,
		}

		data, err := json.Marshal(info)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		_, hasAvatar := m["avatarUrl"]
		require.False(t, hasAvatar, "empty avatarUrl should be omitted")
		_, hasEmail := m["email"]
		require.False(t, hasEmail, "empty email should be omitted")
	})
}

func TestTeam_EdgeCases(t *testing.T) {
	t.Run("zero-valued UUID is serialized", func(t *testing.T) {
		team := Team{
			ID:        uuid.UUID{},
			Name:      "Team",
			CreatedBy: uuid.UUID{},
			CreatedAt: time.Time{},
			UpdatedAt: time.Time{},
		}

		data, err := json.Marshal(team)
		require.NoError(t, err)

		var decoded Team
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, uuid.UUID{}, decoded.ID)
		assert.Equal(t, uuid.UUID{}, decoded.CreatedBy)
	})

	t.Run("negative member count is preserved", func(t *testing.T) {
		team := Team{
			ID:          uuid.New(),
			Name:        "Team",
			CreatedBy:   uuid.New(),
			MemberCount: -1,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		data, err := json.Marshal(team)
		require.NoError(t, err)

		var decoded Team
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, -1, decoded.MemberCount)
	})
}

func TestTeamMembership_EdgeCases(t *testing.T) {
	t.Run("empty role string is preserved", func(t *testing.T) {
		membership := TeamMembership{
			ID:        uuid.New(),
			TeamID:    uuid.New(),
			UserID:    uuid.New(),
			Role:      TeamRole(""),
			CreatedAt: time.Now(),
		}

		data, err := json.Marshal(membership)
		require.NoError(t, err)

		var decoded TeamMembership
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, TeamRole(""), decoded.Role)
	})

	t.Run("invalid role value is preserved", func(t *testing.T) {
		membership := TeamMembership{
			ID:        uuid.New(),
			TeamID:    uuid.New(),
			UserID:    uuid.New(),
			Role:      TeamRole("superadmin"),
			CreatedAt: time.Now(),
		}

		data, err := json.Marshal(membership)
		require.NoError(t, err)

		var decoded TeamMembership
		require.NoError(t, json.Unmarshal(data, &decoded))
		assert.Equal(t, TeamRole("superadmin"), decoded.Role)
	})
}
