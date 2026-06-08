"""
预先生成 JWT token 列表供 k6 压测使用。

用法:
    cd user/backend/scripts
    python prepare_tokens.py

说明:
    - 从 PostgreSQL 读取 student_accounts 表的前 N 条记录
    - 逐个调用 login API 获取 JWT token
    - 将 token 列表写入 tokens.json
"""

import asyncio
import json
import os
import sys

import asyncpg
import httpx

# 配置
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/admin")
API_BASE = os.getenv("API_BASE", "http://101.37.238.186")
LIMIT = int(os.getenv("TOKEN_LIMIT", "100"))  # 预生成多少个 token


async def fetch_students():
    """从数据库读取学生账号"""
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch(
        "SELECT student_id, name, class_name, order_id FROM student_accounts LIMIT $1",
        LIMIT,
    )
    await conn.close()
    return [dict(r) for r in rows]


async def login_all(students):
    """批量登录获取 token"""
    tokens = []
    total = len(students)
    async with httpx.AsyncClient() as client:
        for i, s in enumerate(students, 1):
            if i % 50 == 0 or i == total:
                print(f"  进度: {i}/{total} ({i*100//total}%)")
            try:
                resp = await client.post(
                    f"{API_BASE}/api/student/login",
                    json={"student_id": s["student_id"], "password": "123456"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    tokens.append({
                        "student_id": s["student_id"],
                        "name": s["name"],
                        "class_name": s["class_name"],
                        "order_id": s["order_id"],
                        "token": data["token"],
                    })
                else:
                    print(f"  登录失败 {s['student_id']}: {resp.status_code} {resp.text}")
            except Exception as e:
                print(f"  异常 {s['student_id']}: {e}")
    return tokens


async def main():
    print(f"[INFO] 连接数据库: {DB_URL.replace(DB_URL.split('@')[0], '***')}")
    students = await fetch_students()
    print(f"[INFO] 读取到 {len(students)} 个学生账号")

    if not students:
        print("[ERROR] 没有可用的学生账号，请先通过 admin 端下发征订单")
        sys.exit(1)

    print(f"[INFO] 开始登录获取 token (limit={LIMIT})...")
    tokens = await login_all(students)
    print(f"[INFO] 成功获取 {len(tokens)} 个 token")

    output_path = os.path.join(os.path.dirname(__file__), "tokens.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(tokens, f, ensure_ascii=False, indent=2)
    print(f"[INFO] 已保存到 {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
