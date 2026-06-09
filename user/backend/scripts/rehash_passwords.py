"""
批量更新学生密码哈希为 sha256+salt。

用法:
    cd user/backend/scripts
    python rehash_passwords.py
"""

import asyncio
import hashlib
import os
import secrets

import asyncpg

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/admin")
DEFAULT_PASSWORD = "123456"


def sha256_plain(password: str) -> str:
    """前端预哈希：对明文做一次 sha256"""
    return hashlib.sha256(password.encode()).hexdigest()


def sha256_hash(password: str) -> str:
    """后端存储哈希：salt$sha256(salt + prehash)"""
    prehash = sha256_plain(password)
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + prehash).encode()).hexdigest()
    return f"{salt}${h}"


async def main():
    conn = await asyncpg.connect(DB_URL)

    rows = await conn.fetch("SELECT id, student_id FROM student_accounts")
    print(f"[INFO] 共 {len(rows)} 个学生账号需要更新")

    new_hash = sha256_hash(DEFAULT_PASSWORD)
    print(f"[INFO] 新哈希示例: {new_hash[:40]}...")

    updated = 0
    for r in rows:
        await conn.execute(
            "UPDATE student_accounts SET hashed_password=$1 WHERE id=$2",
            new_hash, r["id"],
        )
        updated += 1
        if updated % 100 == 0:
            print(f"  进度: {updated}/{len(rows)}")

    # 同时重置选书状态，确保测试可以重复跑
    reset = await conn.execute(
        "UPDATE student_accounts SET is_confirmed=false, selection_bitmap=0, last_submitted_at=NULL"
    )
    print(f"[INFO] 已重置 {reset} 个学生的选书状态")

    await conn.close()
    print(f"[INFO] 完成，已更新 {updated} 个账号")
    print("[INFO] 重启 Go 后端后，sha256 验证生效")


if __name__ == "__main__":
    asyncio.run(main())
