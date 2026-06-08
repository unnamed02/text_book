import asyncio
import os
import asyncpg

DB_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:123456@localhost:5432/admin")
# asyncpg 需要去掉 +asyncpg 前缀
clean_url = DB_URL.replace("+asyncpg", "")

async def main():
    conn = await asyncpg.connect(clean_url)
    try:
        await conn.execute(
            "ALTER TABLE student_accounts ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE"
        )
        print("[OK] is_confirmed column added to student_accounts")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
