package model

import "time"

type StudentAccount struct {
	ID              int64      `db:"id" json:"id"`
	OrderID         int64      `db:"order_id" json:"order_id"`
	StudentID       string     `db:"student_id" json:"student_id"`
	Name            string     `db:"name" json:"name"`
	ClassName       string     `db:"class_name" json:"class_name"`
	HashedPassword  string     `db:"hashed_password" json:"-"`
	SelectionBitmap int64      `db:"selection_bitmap" json:"selection_bitmap,string"`
	IsActive        bool       `db:"is_active" json:"is_active"`
	LastSubmittedAt *time.Time `db:"last_submitted_at" json:"last_submitted_at,omitempty"`
	IsConfirmed     bool       `db:"is_confirmed" json:"is_confirmed"`
	IsPasswordChanged  bool       `db:"is_password_changed" json:"is_password_changed"`
}
