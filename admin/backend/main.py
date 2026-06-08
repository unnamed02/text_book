import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from database import engine, Base, AsyncSessionLocal
from models import User
from auth import verify_password, create_access_token, get_current_user, get_password_hash
from orders import router as orders_router
from dispatch import router as dispatch_router
import redis_client
from redis_client import init_redis, close_redis

import uuid

load_dotenv()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Drop materialized view if migrating from old version, then create ordinary view
        await conn.execute(text("DROP VIEW IF EXISTS textbook_view"))
        await conn.execute(text("DROP MATERIALIZED VIEW IF EXISTS textbook_view"))
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
                FROM (
                    SELECT DISTINCT textbook_id, class_id FROM order_items
                ) oi
                JOIN classes c ON oi.class_id = c.id
                GROUP BY oi.textbook_id
            ) usage ON t.id = usage.textbook_id
            LEFT JOIN (
                SELECT textbook_id, SUM(actual_count) AS total
                FROM order_items
                GROUP BY textbook_id
            ) actual_usage ON t.id = actual_usage.textbook_id
        """))


async def create_admin_user():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        user = result.scalar_one_or_none()
        if not user:
            admin = User(
                username="admin",
                hashed_password=get_password_hash("admin-Default-2026!"),
                is_active=True,
            )
            db.add(admin)
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await create_admin_user()
    await init_redis()
    print("[lifespan] Redis initialized:", redis_client.redis is not None)
    yield
    await close_redis()


app = FastAPI(title="Admin API", lifespan=lifespan)
app.include_router(orders_router)
app.include_router(dispatch_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _ensure_redis():
    if redis_client.redis is None:
        await init_redis()


@app.post("/api/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    await _ensure_redis()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == form_data.username))
        user = result.scalar_one_or_none()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # 单点登录：生成唯一 jti 存入 Redis
        jti = str(uuid.uuid4())
        await redis_client.redis.set(f"user_session:{user.id}", jti, ex=60 * 60 * 24)  # 24小时过期
        access_token = create_access_token(data={"sub": user.username, "jti": jti})
        return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/me")
async def read_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_active": current_user.is_active,
    }


@app.post("/api/logout")
async def logout(current_user: User = Depends(get_current_user)):
    await redis_client.redis.delete(f"user_session:{current_user.id}")
    return {"message": "Logged out successfully"}
