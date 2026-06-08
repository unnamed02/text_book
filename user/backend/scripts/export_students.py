"""
导出学生账号列表供 k6 压测使用。

用法:
    cd user/backend/scripts
    python export_students.py
"""

import asyncio
import json
import os

import asyncpg

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/admin")
LIMIT = int(os.getenv("STUDENT_LIMIT", "8000"))


async def main():
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch(
        "SELECT student_id, name, class_name, order_id FROM student_accounts LIMIT $1",
        LIMIT,
    )
    await conn.close()

    students = [dict(r) for r in rows]
    output_path = os.path.join(os.path.dirname(__file__), "students.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(students, f, ensure_ascii=False, indent=2)

    print(f"[INFO] 导出 {len(students)} 个学生账号到 {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
