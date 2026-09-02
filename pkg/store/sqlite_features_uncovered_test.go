package store

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// TestGetFeatureRequestsByIssueNumbers covers the previously untested
// batched lookup by GitHub issue numbers, including the empty-input guard.
func TestGetFeatureRequestsByIssueNumbers(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-batch-issues", "batchissueuser")

	t.Run("returns empty slice for empty input without touching db", func(t *testing.T) {
		got, err := s.GetFeatureRequestsByIssueNumbers(ctx, nil)
		require.NoError(t, err)
		require.NotNil(t, got, "must return non-nil empty slice, not nil")
		require.Empty(t, got)

		got, err = s.GetFeatureRequestsByIssueNumbers(ctx, []int{})
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Empty(t, got)
	})

	t.Run("returns only rows for the requested issue numbers", func(t *testing.T) {
		iss1, iss2, iss3 := 1001, 1002, 1003
		for _, iss := range []*int{&iss1, &iss2, &iss3, nil} {
			req := &models.FeatureRequest{
				UserID:            user.ID,
				Title:             "Batch",
				Description:       "d",
				RequestType:       models.RequestTypeFeature,
				GitHubIssueNumber: iss,
			}
			require.NoError(t, s.CreateFeatureRequest(ctx, req))
		}

		got, err := s.GetFeatureRequestsByIssueNumbers(ctx, []int{iss1, iss3})
		require.NoError(t, err)
		require.Len(t, got, 2)
		seen := map[int]bool{}
		for _, r := range got {
			require.NotNil(t, r.GitHubIssueNumber)
			seen[*r.GitHubIssueNumber] = true
		}
		require.True(t, seen[iss1])
		require.True(t, seen[iss3])
		require.False(t, seen[iss2])
	})
}

// TestGetFeatureRequestByPRNumber covers the previously untested single-PR
// lookup.
func TestGetFeatureRequestByPRNumber(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-pr-lookup", "prlookupuser")

	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "PR Lookup",
		Description: "d",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))
	require.NoError(t, s.UpdateFeatureRequestPR(ctx, req.ID, 42, "https://github.com/o/r/pull/42"))

	t.Run("returns request that owns the PR number", func(t *testing.T) {
		got, err := s.GetFeatureRequestByPRNumber(ctx, 42)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, req.ID, got.ID)
		require.NotNil(t, got.PRNumber)
		require.Equal(t, 42, *got.PRNumber)
	})

	t.Run("returns nil for unknown PR number", func(t *testing.T) {
		got, err := s.GetFeatureRequestByPRNumber(ctx, 9999)
		require.NoError(t, err)
		require.Nil(t, got)
	})
}

// TestUpdateFeatureRequestPR covers UpdateFeatureRequestPR: it must write
// pr_number, pr_url, and flip status to fix_ready.
func TestUpdateFeatureRequestPR(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-updatepr", "updatepruser")

	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "UpdatePR",
		Description: "d",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))
	require.NoError(t, s.UpdateFeatureRequestPR(ctx, req.ID, 77, "https://github.com/o/r/pull/77"))

	got, err := s.GetFeatureRequest(ctx, req.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.NotNil(t, got.PRNumber)
	require.Equal(t, 77, *got.PRNumber)
	require.Equal(t, "https://github.com/o/r/pull/77", got.PRURL)
	require.Equal(t, models.RequestStatusFixReady, got.Status)
}

// TestUpdateFeatureRequestPreview covers UpdateFeatureRequestPreview.
func TestUpdateFeatureRequestPreview(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-preview", "previewuser")

	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "Preview",
		Description: "d",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))
	require.NoError(t, s.UpdateFeatureRequestPreview(ctx, req.ID, "https://deploy-preview-77--site.netlify.app"))

	got, err := s.GetFeatureRequest(ctx, req.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "https://deploy-preview-77--site.netlify.app", got.NetlifyPreviewURL)
}

// TestUpdateFeatureRequestLatestComment covers UpdateFeatureRequestLatestComment.
func TestUpdateFeatureRequestLatestComment(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-comment", "commentuser")

	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "Comment",
		Description: "d",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))
	require.NoError(t, s.UpdateFeatureRequestLatestComment(ctx, req.ID, "reviewer replied"))

	got, err := s.GetFeatureRequest(ctx, req.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "reviewer replied", got.LatestComment)
}

// TestMarkNotificationRead covers the private-helper MarkNotificationRead
// branch. It is kept only for admin/background paths that have already
// resolved ownership; the public API is MarkNotificationReadByUser (already
// tested). This test locks in that MarkNotificationRead really does clear
// the unread flag regardless of ownership — the exact behaviour that made
// #6611 a bug — so any future refactor that hardens or removes the helper
// will be seen.
func TestMarkNotificationRead(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-markread", "markreaduser")

	notif := &models.Notification{
		UserID:           user.ID,
		NotificationType: models.NotificationTypeFixReady,
		Title:            "unread",
		Message:          "msg",
	}
	require.NoError(t, s.CreateNotification(ctx, notif))

	require.NoError(t, s.MarkNotificationRead(ctx, notif.ID))

	count, err := s.GetUnreadNotificationCount(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, 0, count)

	// Idempotent: calling again on the same id is a no-op and does not error.
	require.NoError(t, s.MarkNotificationRead(ctx, notif.ID))

	// Unknown id must NOT error (bare UPDATE affects zero rows silently).
	require.NoError(t, s.MarkNotificationRead(ctx, uuid.New()))
}

// TestMarkAllNotificationsRead covers the bulk mark-read path.
func TestMarkAllNotificationsRead(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-markall", "markalluser")
	other := createTestUser(t, s, "gh-markall-other", "otheruser")

	for i := 0; i < 3; i++ {
		require.NoError(t, s.CreateNotification(ctx, &models.Notification{
			UserID:           user.ID,
			NotificationType: models.NotificationTypeFixReady,
			Title:            "u",
			Message:          "m",
		}))
	}
	// Sibling user's unread notification must be untouched.
	require.NoError(t, s.CreateNotification(ctx, &models.Notification{
		UserID:           other.ID,
		NotificationType: models.NotificationTypeFixReady,
		Title:            "other",
		Message:          "m",
	}))

	require.NoError(t, s.MarkAllNotificationsRead(ctx, user.ID))

	got, err := s.GetUnreadNotificationCount(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, 0, got)

	otherCount, err := s.GetUnreadNotificationCount(ctx, other.ID)
	require.NoError(t, err)
	require.Equal(t, 1, otherCount, "MarkAllNotificationsRead must be user-scoped")
}
