package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"user-backend/service"
)

func GetTextbooks(c *gin.Context) {
	studentID := c.GetString("student_id")
	className := c.GetString("class_name")
	orderID, _ := c.Get("order_id")

	var selectionBitmap int64
	var isConfirmed bool
	var lastSubmittedAt sql.NullTime
	err := service.DB.QueryRow(
		"SELECT selection_bitmap, is_confirmed, last_submitted_at FROM student_accounts WHERE student_id=$1 AND order_id=$2 AND is_active=true",
		studentID, orderID).Scan(&selectionBitmap, &isConfirmed, &lastSubmittedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	var textbooksJSON json.RawMessage
	err = service.DB.Get(&textbooksJSON,
		"SELECT textbooks_json FROM class_textbooks WHERE order_id=$1 AND class_name=$2",
		orderID, className)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"selection_bitmap": selectionBitmap,
		"is_confirmed":     isConfirmed,
		"textbooks_json":   textbooksJSON,
	})
}

type UpdateBitmapReq struct {
	NewBitmap int64 `json:"new_bitmap,string"`
}

func UpdateBitmap(c *gin.Context) {
	studentID := c.GetString("student_id")
	orderID, _ := c.Get("order_id")

	var req UpdateBitmapReq
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// check cooldown
	var lastSubmittedAt sql.NullTime
	var isConfirmed bool
	err := service.DB.QueryRow(
		"SELECT last_submitted_at, is_confirmed FROM student_accounts WHERE student_id=$1 AND order_id=$2 AND is_active=true",
		studentID, orderID).Scan(&lastSubmittedAt, &isConfirmed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	if isConfirmed {
		c.JSON(http.StatusForbidden, gin.H{"error": "already confirmed"})
		return
	}

	if lastSubmittedAt.Valid {
		elapsed := time.Since(lastSubmittedAt.Time).Seconds()
		if elapsed < 10 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too frequent", "cooldown_seconds": int64(10 - elapsed)})
			return
		}
	}

	_, err = service.DB.Exec(
		"UPDATE student_accounts SET selection_bitmap=$1, is_confirmed=true, last_submitted_at=NOW() WHERE student_id=$2 AND order_id=$3 AND is_active=true",
		req.NewBitmap, studentID, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"msg": "confirmed"})
}

func CancelConfirm(c *gin.Context) {
	studentID := c.GetString("student_id")
	orderID, _ := c.Get("order_id")

	var lastSubmittedAt sql.NullTime
	var isConfirmed bool
	err := service.DB.QueryRow(
		"SELECT last_submitted_at, is_confirmed FROM student_accounts WHERE student_id=$1 AND order_id=$2 AND is_active=true",
		studentID, orderID).Scan(&lastSubmittedAt, &isConfirmed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query failed"})
		return
	}

	if !isConfirmed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not confirmed"})
		return
	}

	if lastSubmittedAt.Valid {
		elapsed := time.Since(lastSubmittedAt.Time).Seconds()
		if elapsed < 10 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "cooldown not finished", "cooldown_seconds": int64(10 - elapsed)})
			return
		}
	}

	_, err = service.DB.Exec(
		"UPDATE student_accounts SET is_confirmed=false, last_submitted_at=NOW() WHERE student_id=$1 AND order_id=$2 AND is_active=true",
		studentID, orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cancel failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"msg": "cancelled"})
}
