package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

func TestFeatureRequestCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-feature", "featureuser")

	t.Run("Create and GetFeatureRequest round-trip", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "New Feature",
			Description: "Please add this",
			RequestType: models.RequestTypeFeature,
			TargetRepo:  models.TargetRepoConsole,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))
		require.NotEqual(t, uuid.Nil, req.ID)

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "New Feature", got.Title)
		require.Equal(t, models.RequestStatusOpen, got.Status)
	})

	t.Run("GetFeatureRequestByIssueNumber returns correct request", func(t *testing.T) {
		issueNum := 123
		req := &models.FeatureRequest{
			UserID:            user.ID,
			Title:             "Issue Feature",
			Description:       "From issue",
			RequestType:       models.RequestTypeFeature,
			GitHubIssueNumber: &issueNum,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		got, err := s.GetFeatureRequestByIssueNumber(ctx, issueNum)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, "Issue Feature", got.Title)
	})

	t.Run("GetUserFeatureRequests returns page of requests", func(t *testing.T) {
		for i := 0; i < 3; i++ {
			require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
				UserID:      user.ID,
				Title:       "Req",
				Description: "Desc",
				RequestType: models.RequestTypeFeature,
			}))
		}

		requests, err := s.GetUserFeatureRequests(ctx, user.ID, 0, 0)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(requests), 3)
	})

	t.Run("UpdateFeatureRequest modifies fields", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "To Update",
			Description: "Old",
			RequestType: models.RequestTypeFeature,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		req.Title = "Updated Title"
		req.Status = models.RequestStatusTriageAccepted
		require.NoError(t, s.UpdateFeatureRequest(ctx, req))

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, "Updated Title", got.Title)
		require.Equal(t, models.RequestStatusTriageAccepted, got.Status)
		require.NotNil(t, got.UpdatedAt)
	})

	t.Run("UpdateFeatureRequestStatus changes status only", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Status Update",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		require.NoError(t, s.UpdateFeatureRequestStatus(ctx, req.ID, models.RequestStatusClosed))

		got, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, models.RequestStatusClosed, got.Status)
	})
}

func TestPRFeedbackCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-feedback", "feedbackuser")
	req := &models.FeatureRequest{
		UserID:      user.ID,
		Title:       "Feedback Req",
		Description: "Desc",
		RequestType: models.RequestTypeFeature,
	}
	require.NoError(t, s.CreateFeatureRequest(ctx, req))

	t.Run("Create and GetPRFeedback round-trip", func(t *testing.T) {
		feedback := &models.PRFeedback{
			FeatureRequestID: req.ID,
			UserID:           user.ID,
			FeedbackType:     models.FeedbackTypePositive,
			Comment:          "Great work",
		}
		require.NoError(t, s.CreatePRFeedback(ctx, feedback))

		feedbacks, err := s.GetPRFeedback(ctx, req.ID)
		require.NoError(t, err)
		require.Len(t, feedbacks, 1)
		require.Equal(t, "Great work", feedbacks[0].Comment)
	})
}

func TestNotificationCRUD(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-notif", "notifuser")

	t.Run("Create and GetUserNotifications round-trip", func(t *testing.T) {
		notif := &models.Notification{
			UserID:           user.ID,
			NotificationType: models.NotificationTypeFixReady,
			Title:            "New Update",
			Message:          "Something happened",
		}
		require.NoError(t, s.CreateNotification(ctx, notif))

		notifs, err := s.GetUserNotifications(ctx, user.ID, 10)
		require.NoError(t, err)
		require.Len(t, notifs, 1)
		require.Equal(t, "New Update", notifs[0].Title)
	})

	t.Run("MarkNotificationReadByUser marks as read", func(t *testing.T) {
		user2 := createTestUser(t, s, "gh-notif-2", "notifuser2")
		notif := &models.Notification{
			UserID:           user2.ID,
			NotificationType: models.NotificationTypeFixReady,
			Title:            "Read Me",
			Message:          "Msg",
		}
		require.NoError(t, s.CreateNotification(ctx, notif))

		require.NoError(t, s.MarkNotificationReadByUser(ctx, notif.ID, user2.ID))

		count, err := s.GetUnreadNotificationCount(ctx, user2.ID)
		require.NoError(t, err)
		require.Equal(t, 0, count)
	})
}

func TestCountUserPendingFeatureRequests(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-count-pending", "countuser")

	t.Run("counts open and needs_triage requests", func(t *testing.T) {
		require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Open 1",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
			Status:      models.RequestStatusOpen,
		}))
		require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Needs Triage",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
			Status:      models.RequestStatusNeedsTriage,
		}))
		require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Accepted",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
			Status:      models.RequestStatusTriageAccepted,
		}))

		count, err := s.CountUserPendingFeatureRequests(ctx, user.ID)
		require.NoError(t, err)
		require.Equal(t, 2, count, "should count open and needs_triage only")
	})

	t.Run("returns 0 for user with no pending requests", func(t *testing.T) {
		emptyUser := createTestUser(t, s, "gh-empty", "emptyuser")
		count, err := s.CountUserPendingFeatureRequests(ctx, emptyUser.ID)
		require.NoError(t, err)
		require.Equal(t, 0, count)
	})
}

func TestGetAllFeatureRequests(t *testing.T) {
	s := newTestStore(t)
	user1 := createTestUser(t, s, "gh-all-1", "user1")
	user2 := createTestUser(t, s, "gh-all-2", "user2")

	t.Run("returns all requests ordered by created_at DESC", func(t *testing.T) {
		req1 := &models.FeatureRequest{
			UserID:      user1.ID,
			Title:       "First",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
		}
		req2 := &models.FeatureRequest{
			UserID:      user2.ID,
			Title:       "Second",
			Description: "Desc",
			RequestType: models.RequestTypeBug,
		}

		require.NoError(t, s.CreateFeatureRequest(ctx, req1))
		time.Sleep(10 * time.Millisecond)
		require.NoError(t, s.CreateFeatureRequest(ctx, req2))

		requests, err := s.GetAllFeatureRequests(ctx, 10, 0)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(requests), 2)

		found1 := false
		found2 := false
		var idx1, idx2 int
		for i, r := range requests {
			if r.ID == req1.ID {
				found1 = true
				idx1 = i
			}
			if r.ID == req2.ID {
				found2 = true
				idx2 = i
			}
		}

		require.True(t, found1, "should find first request")
		require.True(t, found2, "should find second request")
		require.Less(t, idx2, idx1, "newer request should come before older")
	})

	t.Run("respects limit and offset", func(t *testing.T) {
		for i := 0; i < 5; i++ {
			require.NoError(t, s.CreateFeatureRequest(ctx, &models.FeatureRequest{
				UserID:      user1.ID,
				Title:       fmt.Sprintf("Req-%d", i),
				Description: "Desc",
				RequestType: models.RequestTypeFeature,
			}))
		}

		page1, err := s.GetAllFeatureRequests(ctx, 2, 0)
		require.NoError(t, err)
		require.LessOrEqual(t, len(page1), 2)

		page2, err := s.GetAllFeatureRequests(ctx, 2, 2)
		require.NoError(t, err)
		require.LessOrEqual(t, len(page2), 2)

		if len(page1) > 0 && len(page2) > 0 {
			require.NotEqual(t, page1[0].ID, page2[0].ID, "different pages should have different requests")
		}
	})

	t.Run("returns empty for out-of-bounds offset", func(t *testing.T) {
		requests, err := s.GetAllFeatureRequests(ctx, 10, 99999)
		require.NoError(t, err)
		require.Empty(t, requests)
	})
}

func TestCloseFeatureRequest(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-close", "closeuser")

	t.Run("closes request and sets closed_by_user", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "To Close",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
			Status:      models.RequestStatusOpen,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		err := s.CloseFeatureRequest(ctx, req.ID, true)
		require.NoError(t, err)

		closed, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, models.RequestStatusClosed, closed.Status)
		require.True(t, closed.ClosedByUser, "closed_by_user should be true")
	})

	t.Run("closed_by_user is false when closed by system", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "System Close",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
			Status:      models.RequestStatusOpen,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		err := s.CloseFeatureRequest(ctx, req.ID, false)
		require.NoError(t, err)

		closed, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.Equal(t, models.RequestStatusClosed, closed.Status)
		require.False(t, closed.ClosedByUser, "closed_by_user should be false")
	})

	t.Run("updates updated_at timestamp", func(t *testing.T) {
		req := &models.FeatureRequest{
			UserID:      user.ID,
			Title:       "Update Time",
			Description: "Desc",
			RequestType: models.RequestTypeFeature,
		}
		require.NoError(t, s.CreateFeatureRequest(ctx, req))

		before := time.Now()
		time.Sleep(10 * time.Millisecond)
		require.NoError(t, s.CloseFeatureRequest(ctx, req.ID, true))

		closed, err := s.GetFeatureRequest(ctx, req.ID)
		require.NoError(t, err)
		require.NotNil(t, closed.UpdatedAt)
		require.True(t, closed.UpdatedAt.After(before), "updated_at should be set to now")
	})

	t.Run("no error on missing request", func(t *testing.T) {
		err := s.CloseFeatureRequest(ctx, uuid.New(), true)
		require.NoError(t, err, "closing missing request should not error")
	})
}
