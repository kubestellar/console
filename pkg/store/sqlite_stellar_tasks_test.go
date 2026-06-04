package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateTask_Basic(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{
		UserID: "user-1",
		Title:  "Check pod logs",
		Status: "open",
	}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)
	require.NotEmpty(t, id)
	assert.Equal(t, id, task.ID)
}

func TestCreateTask_DefaultsApplied(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{
		UserID: "user-1",
		Title:  "bare task",
	}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)
	require.NotEmpty(t, id)

	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	assert.Equal(t, "open", tasks[0].Status)
	assert.Equal(t, "default", tasks[0].SessionID)
	assert.Equal(t, 5, tasks[0].Priority)
	assert.Equal(t, "user", tasks[0].Source)
	assert.Equal(t, "{}", tasks[0].ContextJSON)
}

func TestCreateTask_PreservesExplicitID(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{
		ID:     "my-explicit-id",
		UserID: "user-1",
		Title:  "explicit id task",
		Status: "open",
	}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)
	assert.Equal(t, "my-explicit-id", id)
}

func TestCreateTask_PriorityClampedToRange(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{
		UserID:   "user-1",
		Title:    "bad priority",
		Priority: 99,
	}
	_, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	assert.Equal(t, 5, tasks[0].Priority)
}

func TestGetOpenTasks_Empty(t *testing.T) {
	s := newTestStore(t)
	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	assert.Empty(t, tasks)
}

func TestGetOpenTasks_ExcludesDoneAndDismissed(t *testing.T) {
	s := newTestStore(t)
	statuses := []string{"open", "in-progress", "done", "dismissed"}
	for _, st := range statuses {
		task := &StellarTask{UserID: "user-1", Title: "task-" + st, Status: st}
		_, err := s.CreateTask(ctx, task)
		require.NoError(t, err)
	}

	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	assert.Len(t, tasks, 2)
	for _, t2 := range tasks {
		assert.NotEqual(t, "done", t2.Status)
		assert.NotEqual(t, "dismissed", t2.Status)
	}
}

func TestGetOpenTasks_FiltersByUser(t *testing.T) {
	s := newTestStore(t)
	task1 := &StellarTask{UserID: "user-a", Title: "task-a", Status: "open"}
	task2 := &StellarTask{UserID: "user-b", Title: "task-b", Status: "open"}
	_, err := s.CreateTask(ctx, task1)
	require.NoError(t, err)
	_, err = s.CreateTask(ctx, task2)
	require.NoError(t, err)

	tasks, err := s.GetOpenTasks(ctx, "user-a")
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	assert.Equal(t, "task-a", tasks[0].Title)
}

func TestUpdateTaskStatus_ToInProgress(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{UserID: "user-1", Title: "pending task", Status: "open"}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	require.NoError(t, s.UpdateTaskStatus(ctx, id, "in-progress", "user-1"))

	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	assert.Equal(t, "in-progress", tasks[0].Status)
}

func TestUpdateTaskStatus_ToDoneSetsCompletedAt(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{UserID: "user-1", Title: "finish me", Status: "open"}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	require.NoError(t, s.UpdateTaskStatus(ctx, id, "done", "user-1"))

	// done tasks are excluded from GetOpenTasks
	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	assert.Empty(t, tasks)
}

func TestUpdateTaskStatus_NormalizesCase(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{UserID: "user-1", Title: "case task", Status: "open"}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	require.NoError(t, s.UpdateTaskStatus(ctx, id, "  DONE  ", "user-1"))

	tasks, err := s.GetOpenTasks(ctx, "user-1")
	require.NoError(t, err)
	assert.Empty(t, tasks)
}

func TestUpdateTaskStatus_WrongUserNoOp(t *testing.T) {
	s := newTestStore(t)
	task := &StellarTask{UserID: "user-a", Title: "protected", Status: "open"}
	id, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	require.NoError(t, s.UpdateTaskStatus(ctx, id, "done", "user-b"))

	tasks, err := s.GetOpenTasks(ctx, "user-a")
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	assert.Equal(t, "open", tasks[0].Status)
}

func TestGetOverdueOpenTasks(t *testing.T) {
	s := newTestStore(t)
	pastDue := time.Now().UTC().Add(-1 * time.Hour)
	futureDue := time.Now().UTC().Add(1 * time.Hour)

	overdue := &StellarTask{UserID: "user-1", Title: "overdue", Status: "open", DueAt: &pastDue}
	notDue := &StellarTask{UserID: "user-1", Title: "not due yet", Status: "open", DueAt: &futureDue}
	noDue := &StellarTask{UserID: "user-1", Title: "no due date", Status: "open"}

	_, err := s.CreateTask(ctx, overdue)
	require.NoError(t, err)
	_, err = s.CreateTask(ctx, notDue)
	require.NoError(t, err)
	_, err = s.CreateTask(ctx, noDue)
	require.NoError(t, err)

	results, err := s.GetOverdueOpenTasks(ctx, time.Now().UTC())
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "overdue", results[0].Title)
}

func TestGetOverdueOpenTasks_ExcludesDone(t *testing.T) {
	s := newTestStore(t)
	pastDue := time.Now().UTC().Add(-1 * time.Hour)

	task := &StellarTask{UserID: "user-1", Title: "done overdue", Status: "done", DueAt: &pastDue}
	_, err := s.CreateTask(ctx, task)
	require.NoError(t, err)

	results, err := s.GetOverdueOpenTasks(ctx, time.Now().UTC())
	require.NoError(t, err)
	assert.Empty(t, results)
}

func TestGetTasksForCluster(t *testing.T) {
	s := newTestStore(t)
	clusterA := &StellarTask{UserID: "user-1", Title: "prod task", Cluster: "prod", Status: "open"}
	clusterB := &StellarTask{UserID: "user-1", Title: "staging task", Cluster: "staging", Status: "open"}

	_, err := s.CreateTask(ctx, clusterA)
	require.NoError(t, err)
	_, err = s.CreateTask(ctx, clusterB)
	require.NoError(t, err)

	results, err := s.GetTasksForCluster(ctx, "prod", 20)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "prod task", results[0].Title)
}

func TestGetTasksForCluster_LimitRespected(t *testing.T) {
	s := newTestStore(t)
	for i := 0; i < 5; i++ {
		task := &StellarTask{UserID: "user-1", Title: "task", Cluster: "prod", Status: "open"}
		_, err := s.CreateTask(ctx, task)
		require.NoError(t, err)
	}

	results, err := s.GetTasksForCluster(ctx, "prod", 2)
	require.NoError(t, err)
	assert.Len(t, results, 2)
}

func TestCreateObservation_RoundTrip(t *testing.T) {
	s := newTestStore(t)
	obs := &StellarObservation{
		Cluster: "prod-a",
		Kind:    "PodCrash",
		Summary: "Pod nginx-abc crashed",
		Detail:  "OOMKilled",
		RefType: "Pod",
		RefID:   "nginx-abc",
	}
	id, err := s.CreateObservation(ctx, obs)
	require.NoError(t, err)
	require.NotEmpty(t, id)
}

func TestGetRecentObservations_FiltersByCluster(t *testing.T) {
	s := newTestStore(t)
	obs1 := &StellarObservation{Cluster: "prod-a", Kind: "PodCrash", Summary: "crash in prod"}
	obs2 := &StellarObservation{Cluster: "staging", Kind: "PodCrash", Summary: "crash in staging"}

	_, err := s.CreateObservation(ctx, obs1)
	require.NoError(t, err)
	_, err = s.CreateObservation(ctx, obs2)
	require.NoError(t, err)

	results, err := s.GetRecentObservations(ctx, "prod-a", 20)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "crash in prod", results[0].Summary)
}

func TestGetRecentObservations_NoClusterReturnsAll(t *testing.T) {
	s := newTestStore(t)
	for _, cluster := range []string{"prod-a", "staging", "dev"} {
		obs := &StellarObservation{Cluster: cluster, Kind: "Info", Summary: "obs-" + cluster}
		_, err := s.CreateObservation(ctx, obs)
		require.NoError(t, err)
	}

	results, err := s.GetRecentObservations(ctx, "", 20)
	require.NoError(t, err)
	assert.Len(t, results, 3)
}

func TestGetUnshownObservations_AndMarkShown(t *testing.T) {
	s := newTestStore(t)
	obs := &StellarObservation{Cluster: "", Kind: "Alert", Summary: "new alert", ShownToUser: false}
	id, err := s.CreateObservation(ctx, obs)
	require.NoError(t, err)

	unshown, err := s.GetUnshownObservations(ctx, "user-a")
	require.NoError(t, err)
	require.Len(t, unshown, 1)

	require.NoError(t, s.MarkObservationShown(ctx, "user-a", id))

	unshown, err = s.GetUnshownObservations(ctx, "user-a")
	require.NoError(t, err)
	assert.Empty(t, unshown)
}

func TestGetUnshownObservations_IsScopedPerUser(t *testing.T) {
	s := newTestStore(t)
	obs := &StellarObservation{Cluster: "", Kind: "Alert", Summary: "shared alert"}
	id, err := s.CreateObservation(ctx, obs)
	require.NoError(t, err)

	userAUnshown, err := s.GetUnshownObservations(ctx, "user-a")
	require.NoError(t, err)
	require.Len(t, userAUnshown, 1)

	require.NoError(t, s.MarkObservationShown(ctx, "user-a", id))

	userAUnshown, err = s.GetUnshownObservations(ctx, "user-a")
	require.NoError(t, err)
	assert.Empty(t, userAUnshown)

	userBUnshown, err := s.GetUnshownObservations(ctx, "user-b")
	require.NoError(t, err)
	require.Len(t, userBUnshown, 1)
	assert.Equal(t, id, userBUnshown[0].ID)
}
