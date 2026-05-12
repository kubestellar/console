package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// GPU Reservation methods

// encodeGPUTypes serializes the multi-type preference list into the JSON
// form persisted in the gpu_reservations.gpu_types column (gpu-multitype). An
// empty or nil list becomes an empty string, which is what the schema
// default emits for pre-migration rows — this keeps the round trip
// idempotent and lets a NULL/empty column decode back to "no preference".
func encodeGPUTypes(types []string) string {
	if len(types) == 0 {
		return ""
	}
	b, err := json.Marshal(types)
	if err != nil {
		// Marshaling a []string cannot realistically fail, but if it
		// does we fall back to an empty encoding rather than
		// corrupting the row. The legacy gpu_type column still
		// carries the primary type as a safety net.
		return ""
	}
	return string(b)
}

// decodeGPUTypes is the inverse of encodeGPUTypes. Empty/whitespace/
// non-JSON values decode to nil so callers can rely on
// NormalizeGPUTypes to promote the legacy gpu_type column into a
// single-element list on read.
func decodeGPUTypes(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(trimmed), &out); err != nil {
		return nil
	}
	return out
}

func (s *SQLiteStore) CreateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error {
	if reservation.ID == uuid.Nil {
		reservation.ID = uuid.New()
	}
	reservation.CreatedAt = time.Now()
	if reservation.Status == "" {
		reservation.Status = models.ReservationStatusActive
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	_, err := s.db.ExecContext(ctx, `INSERT INTO gpu_reservations (id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		reservation.ID.String(), reservation.UserID.String(), reservation.UserName,
		reservation.Title, reservation.Description, reservation.Cluster, reservation.Namespace,
		reservation.GPUCount, reservation.GPUType, gpuTypesEncoded, reservation.StartDate, reservation.DurationHours,
		reservation.Notes, string(reservation.Status), reservation.QuotaName,
		boolToInt(reservation.QuotaEnforced), reservation.CreatedAt)
	return err
}

// ErrGPUQuotaExceeded is returned by CreateGPUReservationWithCapacity when
// the atomic capacity check fails — either the active reservation count is
// already at or above capacity, or the caller's requested gpu_count would
// push it over. Handlers should map this error to HTTP 409 Conflict.
var ErrGPUQuotaExceeded = errors.New("gpu cluster capacity exceeded")

// ErrGPUReservationNotFound is returned when an update targets a
// reservation ID that does not exist, so callers can return HTTP 404.
var ErrGPUReservationNotFound = errors.New("gpu reservation not found")

// CreateGPUReservationWithCapacity atomically enforces a cluster GPU
// capacity cap and inserts the reservation in a single SQL statement.
//
// #6612: the previous flow was a two-step "SELECT SUM then INSERT", which
// under WAL mode lets two concurrent creates both observe the same stale
// reserved total, both proceed to insert, and push the cluster above its
// declared capacity. This method mirrors the CreateCardWithLimit pattern:
// INSERT ... SELECT ... WHERE (SELECT SUM(...) FROM ...) + ? <= capacity,
// so SQLite evaluates the check and the insert under a single write lock
// and a second concurrent insert cannot observe a pre-insert tally.
//
// If capacity <= 0 the function behaves identically to CreateGPUReservation
// (capacity checks skipped — matches the existing handler semantics when
// no capacity provider is configured).
//
// Returns ErrGPUQuotaExceeded when the insert is rejected by the WHERE
// clause, so handlers can distinguish "over-allocated" from other errors.
func (s *SQLiteStore) CreateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	if reservation.ID == uuid.Nil {
		reservation.ID = uuid.New()
	}
	reservation.CreatedAt = time.Now()
	if reservation.Status == "" {
		reservation.Status = models.ReservationStatusActive
	}
	if capacity <= 0 {
		// No capacity cap — fall through to the unchecked insert. Matches
		// the existing ClusterCapacityProvider==nil handler behaviour.
		return s.CreateGPUReservation(ctx, reservation)
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	result, err := s.db.ExecContext(ctx,
		`INSERT INTO gpu_reservations (id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at)
		 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		 WHERE (COALESCE((SELECT SUM(gpu_count) FROM gpu_reservations WHERE cluster = ? AND status = 'active'), 0) + ?) <= ?`,
		reservation.ID.String(), reservation.UserID.String(), reservation.UserName,
		reservation.Title, reservation.Description, reservation.Cluster, reservation.Namespace,
		reservation.GPUCount, reservation.GPUType, gpuTypesEncoded, reservation.StartDate, reservation.DurationHours,
		reservation.Notes, string(reservation.Status), reservation.QuotaName,
		boolToInt(reservation.QuotaEnforced), reservation.CreatedAt,
		reservation.Cluster, reservation.GPUCount, capacity,
	)
	if err != nil {
		return fmt.Errorf("insert gpu reservation: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read rows affected: %w", err)
	}
	if rows == 0 {
		return ErrGPUQuotaExceeded
	}
	return nil
}

func (s *SQLiteStore) GetGPUReservation(ctx context.Context, id uuid.UUID) (*models.GPUReservation, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE id = ?`, id.String())
	return s.scanGPUReservation(ctx, row)
}

// gpuReservationsMaxRows is the defense-in-depth cap applied to the GPU
// reservation list queries (#6604). The UI only ever renders a small number
// of reservations per user/admin view, so 5000 is already well beyond any
// realistic production workload — the cap only exists so a corrupted table
// or a forgotten cleanup cron cannot return an unbounded slice.
const gpuReservationsMaxRows = 5000

func (s *SQLiteStore) ListGPUReservations(ctx context.Context) ([]models.GPUReservation, error) {
	// #6604: bound the result set. The UI has no expectation of seeing
	// more than a few hundred reservations at once; if an operator ever
	// needs a full dump they can query the DB directly.
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations ORDER BY start_date DESC LIMIT ?`, gpuReservationsMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}

func (s *SQLiteStore) ListUserGPUReservations(ctx context.Context, userID uuid.UUID) ([]models.GPUReservation, error) {
	// #6604: same defense-in-depth LIMIT as ListGPUReservations.
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE user_id = ? ORDER BY start_date DESC LIMIT ?`, userID.String(), gpuReservationsMaxRows)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}

func (s *SQLiteStore) UpdateGPUReservation(ctx context.Context, reservation *models.GPUReservation) error {
	now := time.Now()
	reservation.UpdatedAt = &now
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	_, err := s.db.ExecContext(ctx, `UPDATE gpu_reservations SET user_name = ?, title = ?, description = ?, cluster = ?, namespace = ?, gpu_count = ?, gpu_type = ?, gpu_types = ?, start_date = ?, duration_hours = ?, notes = ?, status = ?, quota_name = ?, quota_enforced = ?, updated_at = ? WHERE id = ?`,
		reservation.UserName, reservation.Title, reservation.Description,
		reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.GPUType, gpuTypesEncoded,
		reservation.StartDate, reservation.DurationHours, reservation.Notes,
		string(reservation.Status), reservation.QuotaName, boolToInt(reservation.QuotaEnforced),
		reservation.UpdatedAt, reservation.ID.String())
	return err
}

// UpdateGPUReservationWithCapacity atomically enforces a cluster GPU capacity
// cap when updating a reservation (#6957). The WHERE clause ensures the update
// only succeeds if the cluster's total reserved GPUs (excluding this
// reservation) plus the new count stays within the given capacity.
// Returns ErrGPUQuotaExceeded when the capacity check fails.
func (s *SQLiteStore) UpdateGPUReservationWithCapacity(ctx context.Context, reservation *models.GPUReservation, capacity int) error {
	now := time.Now()
	reservation.UpdatedAt = &now

	if capacity <= 0 {
		return s.UpdateGPUReservation(ctx, reservation)
	}
	reservation.NormalizeGPUTypes()
	gpuTypesEncoded := encodeGPUTypes(reservation.GPUTypes)

	result, err := s.db.ExecContext(ctx,
		`UPDATE gpu_reservations
		 SET user_name = ?, title = ?, description = ?, cluster = ?, namespace = ?,
		     gpu_count = ?, gpu_type = ?, gpu_types = ?, start_date = ?, duration_hours = ?,
		     notes = ?, status = ?, quota_name = ?, quota_enforced = ?, updated_at = ?
		 WHERE id = ?
		   AND (COALESCE((SELECT SUM(gpu_count) FROM gpu_reservations
		                   WHERE cluster = ? AND status = 'active' AND id != ?), 0) + ?) <= ?`,
		reservation.UserName, reservation.Title, reservation.Description,
		reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.GPUType, gpuTypesEncoded,
		reservation.StartDate, reservation.DurationHours, reservation.Notes,
		string(reservation.Status), reservation.QuotaName, boolToInt(reservation.QuotaEnforced),
		reservation.UpdatedAt, reservation.ID.String(),
		reservation.Cluster, reservation.ID.String(), reservation.GPUCount, capacity,
	)
	if err != nil {
		return fmt.Errorf("update gpu reservation: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read rows affected: %w", err)
	}
	if rows == 0 {
		// Distinguish "row not found" from "capacity exceeded": if the
		// reservation does not exist at all, return ErrGPUReservationNotFound
		// so the caller can map it to HTTP 404 instead of 409.
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM gpu_reservations WHERE id = ?`, reservation.ID.String()).Scan(&exists); err != nil {
			return ErrGPUReservationNotFound
		}
		return ErrGPUQuotaExceeded
	}
	return nil
}

func (s *SQLiteStore) DeleteGPUReservation(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM gpu_reservations WHERE id = ?`, id.String())
	return err
}

// GetGPUReservationsByIDs fetches multiple reservations in a single batched
// query, avoiding N+1 round-trips for ownership verification (#6963).
func (s *SQLiteStore) GetGPUReservationsByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*models.GPUReservation, error) {
	result := make(map[uuid.UUID]*models.GPUReservation, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	// Batch in chunks to respect SQLite variable limits.
	for start := 0; start < len(ids); start += sqliteMaxVars {
		end := start + sqliteMaxVars
		if end > len(ids) {
			end = len(ids)
		}
		chunk := ids[start:end]

		placeholders := strings.Repeat("?,", len(chunk))
		placeholders = placeholders[:len(placeholders)-1]

		args := make([]interface{}, len(chunk))
		for i, id := range chunk {
			args[i] = id.String()
		}

		rows, err := s.db.QueryContext(ctx,
			fmt.Sprintf(`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE id IN (%s)`, placeholders),
			args...,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			r, err := s.scanGPUReservationRow(ctx, rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			result[r.ID] = r
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// GetClusterReservedGPUCount returns the total GPU count for active reservations on a cluster.
// If excludeID is provided, that reservation is excluded (useful for updates).
func (s *SQLiteStore) GetClusterReservedGPUCount(ctx context.Context, cluster string, excludeID *uuid.UUID) (int, error) {
	var total int
	var err error
	if excludeID != nil {
		err = s.db.QueryRowContext(ctx,
			`SELECT COALESCE(SUM(gpu_count), 0) FROM gpu_reservations WHERE cluster = ? AND status = 'active' AND id != ?`,
			cluster, excludeID.String(),
		).Scan(&total)
	} else {
		err = s.db.QueryRowContext(ctx,
			`SELECT COALESCE(SUM(gpu_count), 0) FROM gpu_reservations WHERE cluster = ? AND status = 'active'`,
			cluster,
		).Scan(&total)
	}
	return total, err
}

func (s *SQLiteStore) scanGPUReservation(ctx context.Context, row *sql.Row) (*models.GPUReservation, error) {
	var r models.GPUReservation
	var idStr, userIDStr, status string
	var quotaEnforced int
	var updatedAt sql.NullTime
	var gpuTypesRaw string

	err := row.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &gpuTypesRaw, &r.StartDate,
		&r.DurationHours, &r.Notes, &status, &r.QuotaName, &quotaEnforced,
		&r.CreatedAt, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.Status = models.ReservationStatus(status)
	r.QuotaEnforced = quotaEnforced == 1
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	// Decode multi-type list and promote legacy single-type
	// reservations to a one-element list so callers always see a
	// populated GPUTypes slice.
	r.GPUTypes = decodeGPUTypes(gpuTypesRaw)
	r.NormalizeGPUTypes()
	return &r, nil
}

func (s *SQLiteStore) scanGPUReservationRow(ctx context.Context, rows *sql.Rows) (*models.GPUReservation, error) {
	var r models.GPUReservation
	var idStr, userIDStr, status string
	var quotaEnforced int
	var updatedAt sql.NullTime
	var gpuTypesRaw string

	err := rows.Scan(&idStr, &userIDStr, &r.UserName, &r.Title, &r.Description,
		&r.Cluster, &r.Namespace, &r.GPUCount, &r.GPUType, &gpuTypesRaw, &r.StartDate,
		&r.DurationHours, &r.Notes, &status, &r.QuotaName, &quotaEnforced,
		&r.CreatedAt, &updatedAt)
	if err != nil {
		return nil, err
	}

	r.ID = parseUUID(idStr, "r.ID")
	r.UserID = parseUUID(userIDStr, "r.UserID")
	r.Status = models.ReservationStatus(status)
	r.QuotaEnforced = quotaEnforced == 1
	if updatedAt.Valid {
		r.UpdatedAt = &updatedAt.Time
	}
	// See scanGPUReservation — same normalization logic.
	r.GPUTypes = decodeGPUTypes(gpuTypesRaw)
	r.NormalizeGPUTypes()
	return &r, nil
}

// --- GPU Utilization Snapshots ---

// InsertUtilizationSnapshot writes a single GPU utilization sample. #6608:
// previously this blindly passed snapshot.ID through to the INSERT, so a
// caller that forgot to populate the id (or a future call path that fed us
// a zero-value snapshot) would end up inserting an empty-string primary
// key, collide on the next insert, and silently drop data. We now generate
// a UUID defensively when the caller left ID blank so the row is always
// written with a unique primary key.
func (s *SQLiteStore) InsertUtilizationSnapshot(ctx context.Context, snapshot *models.GPUUtilizationSnapshot) error {
	if snapshot.ID == "" {
		snapshot.ID = uuid.New().String()
	}
	if snapshot.Timestamp.IsZero() {
		snapshot.Timestamp = time.Now()
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO gpu_utilization_snapshots (id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		snapshot.ID, snapshot.ReservationID, snapshot.Timestamp,
		snapshot.GPUUtilizationPct, snapshot.MemoryUtilizationPct,
		snapshot.ActiveGPUCount, snapshot.TotalGPUCount,
	)
	return err
}

func (s *SQLiteStore) GetUtilizationSnapshots(ctx context.Context, reservationID string, limit int) ([]models.GPUUtilizationSnapshot, error) {
	if limit <= 0 {
		limit = DefaultSnapshotQueryLimit
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count FROM gpu_utilization_snapshots WHERE reservation_id = ? ORDER BY timestamp DESC LIMIT ?`,
		reservationID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snapshots []models.GPUUtilizationSnapshot
	for rows.Next() {
		var snap models.GPUUtilizationSnapshot
		if err := rows.Scan(&snap.ID, &snap.ReservationID, &snap.Timestamp,
			&snap.GPUUtilizationPct, &snap.MemoryUtilizationPct,
			&snap.ActiveGPUCount, &snap.TotalGPUCount); err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snap)
	}
	return snapshots, rows.Err()
}

// DefaultSnapshotQueryLimit caps the number of rows returned by
// GetUtilizationSnapshots to prevent unbounded result sets for
// long-lived reservations (#6965). Configurable via the limit parameter.
const DefaultSnapshotQueryLimit = 500

// sqliteMaxVars is the maximum number of bind variables per SQL statement.
// SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 999; we use 500 as a safe
// batch size to stay well under that limit (#6888).
const sqliteMaxVars = 500

// bulkUtilizationMaxRowsPerReservation caps the number of snapshot rows
// returned per reservation in a single GetBulkUtilizationSnapshots call.
// Each reservation typically has hours to days of hourly snapshots, so 500
// per reservation is well beyond any realistic view (#6964).
const bulkUtilizationMaxRowsPerReservation = 500

func (s *SQLiteStore) GetBulkUtilizationSnapshots(ctx context.Context, reservationIDs []string) (map[string][]models.GPUUtilizationSnapshot, error) {
	result := make(map[string][]models.GPUUtilizationSnapshot)
	if len(reservationIDs) == 0 {
		return result, nil
	}

	// #6888: batch the IN clause to respect SQLite's variable limit.
	// Instead of rejecting requests with > sqliteMaxVars IDs, we chunk
	// the input and merge results across batches.
	for start := 0; start < len(reservationIDs); start += sqliteMaxVars {
		end := start + sqliteMaxVars
		if end > len(reservationIDs) {
			end = len(reservationIDs)
		}
		chunk := reservationIDs[start:end]

		if err := s.queryUtilizationChunk(ctx, chunk, result); err != nil {
			return nil, err
		}
	}
	return result, nil
}

// queryUtilizationChunk executes a single batched query for a chunk of
// reservation IDs and merges rows into the provided result map.
// Uses ROW_NUMBER() to apply a per-reservation row limit so that
// reservations with many snapshots cannot starve others (#6964).
func (s *SQLiteStore) queryUtilizationChunk(ctx context.Context, ids []string, result map[string][]models.GPUUtilizationSnapshot) error {
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1] // trim trailing comma

	// +1 slot for the per-reservation LIMIT parameter.
	args := make([]interface{}, 0, len(ids)+1)
	for _, id := range ids {
		args = append(args, id)
	}
	args = append(args, bulkUtilizationMaxRowsPerReservation)

	// Use a window function to number rows per reservation, then filter to
	// only the first N rows per reservation ordered by timestamp.
	query := fmt.Sprintf(`SELECT id, reservation_id, timestamp, gpu_utilization_pct, memory_utilization_pct, active_gpu_count, total_gpu_count
		FROM (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY reservation_id ORDER BY timestamp ASC) AS rn
			FROM gpu_utilization_snapshots
			WHERE reservation_id IN (%s)
		)
		WHERE rn <= ?
		ORDER BY reservation_id, timestamp ASC`, placeholders)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var snap models.GPUUtilizationSnapshot
		if err := rows.Scan(&snap.ID, &snap.ReservationID, &snap.Timestamp,
			&snap.GPUUtilizationPct, &snap.MemoryUtilizationPct,
			&snap.ActiveGPUCount, &snap.TotalGPUCount); err != nil {
			return err
		}
		result[snap.ReservationID] = append(result[snap.ReservationID], snap)
	}
	return rows.Err()
}

func (s *SQLiteStore) DeleteOldUtilizationSnapshots(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM gpu_utilization_snapshots WHERE timestamp < ?`, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *SQLiteStore) ListActiveGPUReservations(ctx context.Context) ([]models.GPUReservation, error) {
	// #6604: same defense-in-depth LIMIT as ListGPUReservations.
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, user_name, title, description, cluster, namespace, gpu_count, gpu_type, gpu_types, start_date, duration_hours, notes, status, quota_name, quota_enforced, created_at, updated_at FROM gpu_reservations WHERE status = 'active' ORDER BY start_date DESC LIMIT ?`,
		gpuReservationsMaxRows,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []models.GPUReservation
	for rows.Next() {
		r, err := s.scanGPUReservationRow(ctx, rows)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, *r)
	}
	return reservations, rows.Err()
}
