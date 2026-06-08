import os
import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

redis: aioredis.Redis | None = None


async def init_redis():
    global redis
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis.ping()  # 验证连接可用


async def close_redis():
    global redis
    if redis:
        await redis.close()
