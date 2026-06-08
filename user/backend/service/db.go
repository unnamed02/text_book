package service

import (
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var DB *sqlx.DB

func InitDB(dsn string) error {
	var err error
	DB, err = sqlx.Connect("pgx", dsn)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	DB.SetMaxOpenConns(80)
	DB.SetMaxIdleConns(20)
	DB.SetConnMaxLifetime(time.Hour)
	return DB.Ping()
}
