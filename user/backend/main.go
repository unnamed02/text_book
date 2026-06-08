package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"user-backend/config"
	"user-backend/handler"
	"user-backend/middleware"
	"user-backend/service"
)

func main() {
	cfg := config.Load()

	if err := service.InitDB(cfg.DatabaseURL); err != nil {
		log.Fatal("数据库连接失败: ", err)
	}
	defer service.DB.Close()

	service.InitRedis()

	middleware.SetJWTSecret(cfg.JWTSecret)
	handler.SetJWTSecret(cfg.JWTSecret)
	handler.StartLoginRecordCleaner()

	r := gin.Default()

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5174"
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     strings.Split(allowedOrigins, ","),
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.POST("/api/student/login", handler.Login)

	auth := r.Group("/api/student")
	auth.Use(middleware.JWTAuth())
	{
		auth.GET("/textbooks", handler.GetTextbooks)
		auth.POST("/bitmap", handler.UpdateBitmap)
		auth.POST("/cancel-confirm", handler.CancelConfirm)
		auth.POST("/change-password", handler.ChangePassword)
		auth.POST("/logout", handler.Logout)
	}

	 srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Println("Server running on :" + cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server failed: ", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown: ", err)
	}
	log.Println("Server exited")
}
