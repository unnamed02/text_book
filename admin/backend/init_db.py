"""
数据库初始化/重建脚本

用法:
    cd backend
    python init_db.py              # 清空所有数据，重建表结构
    python init_db.py --keep-users # 保留用户数据，只重建业务表

说明:
    - 删除所有现有表（CASCADE）和视图
    - 使用最新的模型定义重新创建所有表
    - 重建 textbook_view 视图
    - 根据参数决定是否保留用户数据
    - 如果不保留用户数据，创建默认 admin 用户
"""

import argparse
import asyncio
import os
import sys

# 确保能导入 backend 目录下的模块
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/admin")

from database import Base
from models import User
from auth import get_password_hash


async def reset_database(keep_users: bool = False):
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # 获取当前所有表
        result = await conn.execute(text("""
            SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        """))
        tables = [row[0] for row in result.all()]

        print(f"[INFO] 发现 {len(tables)} 个表: {', '.join(tables) if tables else '无'}")

        # 如果保留用户数据，先备份
        users_backup = []
        if keep_users and "users" in tables:
            result = await conn.execute(text(
                "SELECT id, username, hashed_password, is_active, created_at, updated_at FROM users"
            ))
            users_backup = [dict(row._mapping) for row in result.all()]
            print(f"[INFO] 备份 {len(users_backup)} 个用户")

        # 删除所有表（CASCADE 确保关联对象一起删除）
        for table in tables:
            await conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
            print(f"[DROP] 已删除表: {table}")

        # 删除视图
        await conn.execute(text("DROP VIEW IF EXISTS textbook_view"))
        await conn.execute(text("DROP MATERIALIZED VIEW IF EXISTS textbook_view"))
        print("[DROP] 已删除视图: textbook_view")

    # 使用 Base.metadata 重新创建所有表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("[CREATE] 已重新创建所有表")

    # 处理用户数据
    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    if keep_users and users_backup:
        async with AsyncSessionLocal() as session:
            for u in users_backup:
                # 跳过 id，让数据库自增生成（避免序列冲突）
                user = User(
                    username=u["username"],
                    hashed_password=u["hashed_password"],
                    is_active=u["is_active"],
                )
                session.add(user)
            await session.commit()
            print(f"[RESTORE] 已恢复 {len(users_backup)} 个用户")
    else:
        async with AsyncSessionLocal() as session:
            admin = User(
                username="admin",
                hashed_password=get_password_hash("123"),
                is_active=True,
            )
            session.add(admin)
            await session.commit()
            print("[CREATE] 已创建默认 admin 用户 (username: admin, password: 123)")

    # 重建视图
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE OR REPLACE VIEW textbook_view AS
            SELECT
                t.id,
                t.order_id,
                t.name,
                t.isbn,
                t.price,
                t.publisher,
                t.previous_version_id,
                COALESCE(usage.total, 0) AS total_headcount,
                COALESCE(actual_usage.total, 0) AS actual_headcount
            FROM textbooks t
            LEFT JOIN (
                SELECT oi.textbook_id, SUM(c.headcount) AS total
                FROM (SELECT DISTINCT textbook_id, class_id FROM order_items) oi
                JOIN classes c ON oi.class_id = c.id
                GROUP BY oi.textbook_id
            ) usage ON t.id = usage.textbook_id
            LEFT JOIN (
                SELECT textbook_id, SUM(actual_count) AS total
                FROM order_items
                GROUP BY textbook_id
            ) actual_usage ON t.id = actual_usage.textbook_id
        """))
        print("[CREATE] 已重建视图: textbook_view")

    await engine.dispose()
    print("\n[SUCCESS] 数据库初始化完成！")


def main():
    parser = argparse.ArgumentParser(description="初始化/重置数据库")
    parser.add_argument(
        "--keep-users",
        action="store_true",
        help="保留 users 表中的数据，其他表全部重建",
    )
    args = parser.parse_args()

    if not args.keep_users:
        print("[WARNING] 此操作将删除所有数据并重建数据库！")
        print("          如需保留用户数据，请添加 --keep-users 参数。\n")

    asyncio.run(reset_database(keep_users=args.keep_users))


if __name__ == "__main__":
    main()
