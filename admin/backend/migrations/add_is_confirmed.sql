-- 为 student_accounts 表添加 is_confirmed 字段
-- 执行方式：在 psql 中运行，或通过 Admin 后端的 Python 脚本执行

ALTER TABLE student_accounts
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
