package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"user-backend/service"
)

var jwtSecret []byte

func SetJWTSecret(secret string) {
	jwtSecret = []byte(secret)
}

type LoginReq struct {
	StudentID string `json:"student_id"`
	Password  string `json:"password"`
}

type ChangePasswordReq struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ========== 登录失败锁定 ==========

type loginRecord struct {
	failCount   int       // 连续失败次数
	lockedUntil time.Time // 锁定截止时间
}

var (
	loginRecords = make(map[string]*loginRecord)
	loginMutex   sync.Mutex
)

// 清理过期的锁定记录（每小时运行一次）
func StartLoginRecordCleaner() {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanupLoginRecords()
		}
	}()
}

func cleanupLoginRecords() {
	loginMutex.Lock()
	defer loginMutex.Unlock()

	now := time.Now()
	for sid, rec := range loginRecords {
		if rec.lockedUntil.Before(now) {
			delete(loginRecords, sid)
		}
	}
}

// 检查是否被锁定
func checkLoginLocked(studentID string) string {
	loginMutex.Lock()
	defer loginMutex.Unlock()

	rec, exists := loginRecords[studentID]
	if !exists {
		return ""
	}

	if rec.lockedUntil.After(time.Now()) {
		remain := rec.lockedUntil.Sub(time.Now())
		return "登录失败次数过多，请 " + formatDuration(remain) + " 后再试"
	}

	return ""
}

// 记录登录成功
func recordLoginSuccess(studentID string) {
	loginMutex.Lock()
	defer loginMutex.Unlock()

	rec, exists := loginRecords[studentID]
	if !exists {
		return
	}
	rec.failCount = 0 // 成功登录重置连续失败计数
	rec.lockedUntil = time.Time{}
}

// 记录登录失败
func recordLoginFailure(studentID string) {
	loginMutex.Lock()
	defer loginMutex.Unlock()

	rec, exists := loginRecords[studentID]
	if !exists {
		rec = &loginRecord{}
		loginRecords[studentID] = rec
	}
	rec.failCount++

	// 连续5次失败锁定15分钟
	if rec.failCount >= 5 {
		rec.lockedUntil = time.Now().Add(15 * time.Minute)
		rec.failCount = 0
	}
}

func formatDuration(d time.Duration) string {
	m := int(d.Minutes())
	if m < 1 {
		return "1分钟"
	}
	return fmt.Sprintf("%d分钟", m)
}

// ========== 密码工具 ==========

// 生成 16 字节随机 salt
func generateSalt() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// 对明文密码做一次 sha256，得到预哈希值（前端也做同样的操作）
func sha256Plain(password string) string {
	h := sha256.New()
	h.Write([]byte(password))
	return hex.EncodeToString(h.Sum(nil))
}

// 生成存储哈希（输入为明文密码）
// 内部先对明文做 sha256 得到 prehash，再用 salt 做二次哈希
// 格式：salt$sha256(salt + prehash)
func sha256Hash(password string) string {
	salt := generateSalt()
	inner := sha256Plain(password)
	h := sha256.New()
	h.Write([]byte(salt + inner))
	hash := hex.EncodeToString(h.Sum(nil))
	return salt + "$" + hash
}

// 生成存储哈希（输入已经是预哈希值）
// 用于修改密码接口，前端已做预哈希，后端直接做二次哈希
// 格式：salt$sha256(salt + prehash)
func sha256HashPrehash(prehash string) string {
	salt := generateSalt()
	h := sha256.New()
	h.Write([]byte(salt + prehash))
	hash := hex.EncodeToString(h.Sum(nil))
	return salt + "$" + hash
}

// 验证前端传来的预哈希值
// prehash 是前端对明文密码做 sha256 后的结果
func sha256Verify(prehash, hashed string) bool {
	parts := strings.SplitN(hashed, "$", 2)
	if len(parts) != 2 {
		return false
	}
	salt, hashValue := parts[0], parts[1]
	h := sha256.New()
	h.Write([]byte(salt + prehash))
	newHash := hex.EncodeToString(h.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(newHash), []byte(hashValue)) == 1
}

// ========== 接口 ==========

func Login(c *gin.Context) {
	var req LoginReq
	if err := c.BindJSON(&req); err != nil {
		log.Printf("[LOGIN_FAIL] invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// 检查是否被锁定
	if lockMsg := checkLoginLocked(req.StudentID); lockMsg != "" {
		log.Printf("[LOGIN_FAIL] sid=%s locked: %s", req.StudentID, lockMsg)
		c.JSON(http.StatusTooManyRequests, gin.H{"error": lockMsg})
		return
	}

	var account struct {
		StudentID         string `db:"student_id"`
		Name              string `db:"name"`
		ClassName         string `db:"class_name"`
		OrderID           int64  `db:"order_id"`
		HashedPassword    string `db:"hashed_password"`
		IsActive          bool   `db:"is_active"`
		IsPasswordChanged bool   `db:"is_password_changed"`
	}
	err := service.DB.Get(&account,
		"SELECT student_id, name, class_name, order_id, hashed_password, is_active, is_password_changed FROM student_accounts WHERE student_id=$1",
		req.StudentID)
	if err != nil {
		recordLoginFailure(req.StudentID)
		log.Printf("[LOGIN_FAIL] sid=%s db error: %v", req.StudentID, err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid student_id or password"})
		return
	}
	if !sha256Verify(req.Password, account.HashedPassword) {
		recordLoginFailure(req.StudentID)
		log.Printf("[LOGIN_FAIL] sid=%s password mismatch", req.StudentID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid student_id or password"})
		return
	}

	// 验证通过，记录成功并激活账号
	recordLoginSuccess(req.StudentID)
	if !account.IsActive {
		_, _ = service.DB.Exec("UPDATE student_accounts SET is_active=true WHERE student_id=$1", req.StudentID)
	}

	// 单点登录：生成唯一 jti 存入 Redis
	jti := uuid.New().String()
	ctx := c.Request.Context()
	err = service.RDB.Set(ctx, "student_session:"+account.StudentID, jti, time.Hour*2).Err()
	if err != nil {
		log.Printf("[LOGIN_FAIL] sid=%s redis error: %v", req.StudentID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session creation failed"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"student_id": account.StudentID,
		"class_name": account.ClassName,
		"order_id":   account.OrderID,
		"jti":        jti,
		"exp":        time.Now().Add(time.Hour * 2).Unix(), // 2小时有效期
	})
	tokenStr, err := token.SignedString(jwtSecret)
	if err != nil {
		log.Printf("[LOGIN_FAIL] sid=%s jwt sign error: %v", req.StudentID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token generation failed"})
		return
	}

	log.Printf("[LOGIN_OK] sid=%s", req.StudentID)
	c.JSON(http.StatusOK, gin.H{
		"token":                tokenStr,
		"student_id":           account.StudentID,
		"name":                 account.Name,
		"class_name":           account.ClassName,
		"need_change_password": !account.IsPasswordChanged,
	})
}

func Logout(c *gin.Context) {
	studentID := c.GetString("student_id")
	if studentID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	ctx := c.Request.Context()
	err := service.RDB.Del(ctx, "student_session:"+studentID).Err()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "logout failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "logout success"})
}

func ChangePassword(c *gin.Context) {
	studentID := c.GetString("student_id")

	var req ChangePasswordReq
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if len(req.OldPassword) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入旧密码"})
		return
	}
	if len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少6位"})
		return
	}

	// 验证旧密码
	var hashedPassword string
	err := service.DB.Get(&hashedPassword,
		"SELECT hashed_password FROM student_accounts WHERE student_id=$1",
		studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	if !sha256Verify(req.OldPassword, hashedPassword) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "旧密码错误"})
		return
	}

	// 更新密码（req.NewPassword 已经是前端预哈希值，直接做二次哈希）
	newHash := sha256HashPrehash(req.NewPassword)
	_, err = service.DB.Exec(
		"UPDATE student_accounts SET hashed_password=$1, is_password_changed=true WHERE student_id=$2",
		newHash, studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"msg": "密码修改成功"})
}
