"""
验证压测结果：对比日志中的最终 bitmap 和数据库中的实际值。

用法:
    # 先跑完压测，日志保存到 test.log
    docker run --rm -v "${PWD}:/scripts" -w /scripts grafana/k6 run realistic_test.js 2> test.log

    # 然后验证
    cd user/backend/scripts
    python verify_results.py test.log

说明:
    - 解析 test.log 中每个学生的最后 SUBMIT 或 DONE 日志行
    - 从 PostgreSQL 读取 student_accounts.selection_bitmap
    - 对比是否一致
"""

import asyncio
import os
import re
import sys

import asyncpg

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:123456@localhost:5432/admin")


def parse_log(log_path):
    """解析日志，获取每个学生的最终 bitmap"""
    final_bitmaps = {}  # student_id -> bitmap

    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()

            # 匹配 SUBMIT 行: LOG|SUBMIT|{sid}|round=N|bitmap=X|status=200
            m = re.search(r'LOG\|SUBMIT\|([^|]+)\|round=(\d+)\|bitmap=(\d+)\|status=(\d+)', line)
            if m:
                sid, _round, bitmap, status = m.groups()
                if status == "200":
                    final_bitmaps[sid] = int(bitmap)
                continue

            # 匹配 DONE 行: LOG|DONE|{sid}|final_bitmap=X
            m = re.search(r'LOG\|DONE\|([^|]+)\|final_bitmap=(\d+)', line)
            if m:
                sid, bitmap = m.groups()
                final_bitmaps[sid] = int(bitmap)

    return final_bitmaps


async def fetch_db_bitmaps(student_ids):
    """从数据库读取 bitmap"""
    conn = await asyncpg.connect(DB_URL)
    placeholders = ','.join(f'${i+1}' for i in range(len(student_ids)))
    rows = await conn.fetch(
        f"SELECT student_id, selection_bitmap FROM student_accounts WHERE student_id IN ({placeholders})",
        *student_ids,
    )
    await conn.close()
    return {r["student_id"]: int(r["selection_bitmap"]) for r in rows}


async def main():
    if len(sys.argv) < 2:
        print("用法: python verify_results.py <test.log>")
        sys.exit(1)

    log_path = sys.argv[1]
    print(f"[INFO] 解析日志: {log_path}")

    log_bitmaps = parse_log(log_path)
    print(f"[INFO] 日志中记录了 {len(log_bitmaps)} 个学生的最终 bitmap")

    if not log_bitmaps:
        print("[WARN] 没有解析到任何提交记录")
        sys.exit(0)

    db_bitmaps = await fetch_db_bitmaps(list(log_bitmaps.keys()))
    print(f"[INFO] 数据库中查到 {len(db_bitmaps)} 条记录")

    # 对比
    match = 0
    mismatch = 0
    missing = 0

    for sid, expected in log_bitmaps.items():
        actual = db_bitmaps.get(sid)
        if actual is None:
            missing += 1
            print(f"  [MISSING] {sid}: 数据库中没有记录")
        elif actual == expected:
            match += 1
        else:
            mismatch += 1
            print(f"  [MISMATCH] {sid}: 日志={expected}, 数据库={actual}")

    print(f"\n{'='*50}")
    print(f"验证结果:")
    print(f"  一致:   {match}")
    print(f"  不一致: {mismatch}")
    print(f"  缺失:   {missing}")
    print(f"  总计:   {len(log_bitmaps)}")
    if mismatch == 0 and missing == 0:
        print(f"  ✅ 全部一致！")
    else:
        print(f"  ❌ 存在差异，请检查")


if __name__ == "__main__":
    asyncio.run(main())
