package model

import "encoding/json"

type ClassTextbook struct {
	ID            int64           `db:"id" json:"-"`
	OrderID       int64           `db:"order_id" json:"-"`
	ClassName     string          `db:"class_name" json:"-"`
	TextbooksJSON json.RawMessage `db:"textbooks_json" json:"textbooks_json"`
}
