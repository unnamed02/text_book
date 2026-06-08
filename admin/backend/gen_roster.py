import asyncio
import os
import sys
import random
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/admin")

SURNAMES = [
    "王", "李", "张", "刘", "陈", "杨", "黄", "赵", "吴", "周", "徐", "孙", "马", "朱", "胡",
    "郭", "何", "林", "罗", "高", "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹",
    "彭", "曾", "肖", "田", "董", "袁", "潘", "于", "蒋", "蔡", "余", "杜", "叶", "程", "苏",
    "魏", "吕", "丁", "任", "沈", "姚", "卢", "姜", "崔", "钟", "谭", "陆", "汪", "范", "金",
    "石", "廖", "贾", "夏", "韦", "傅", "方", "白", "邹", "孟", "熊", "秦", "邱", "江", "尹",
    "薛", "闫", "段", "雷", "侯", "龙", "史", "陶", "黎", "贺", "顾", "毛", "郝", "龚", "邵",
    "万", "钱", "严", "覃", "武", "戴", "孔", "向", "汤", "赖", "文", "常", "傅", "皮", "卞",
]

NAME_CHARS = [
    "伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋", "勇", "艳", "杰", "娟",
    "涛", "明", "超", "秀", "霞", "平", "刚", "桂", "英", "华", "建", "文", "辉", "玲",
    "婷", "宇", "博", "浩", "凯", "欣", "雨", "晨", "轩", "昊", "瑞", "嘉", "梓", "涵",
    "思", "语", "彤", "怡", "萱", "琪", "瑶", "妍", "茜", "琳", "璐", "彤", "琦", "莹",
    "智", "翔", "鹏", "飞", "旭", "阳", "睿", "诚", "毅", "航", "坤", "宸", "泽", "源",
    "志", "国", "栋", "林", "森", "楠", "榕", "桦", "柏", "松", "梅", "兰", "竹", "菊",
    "雪", "冰", "洁", "清", "澜", "波", "海", "江", "河", "湖", "溪", "泉", "云", "风",
]


def gen_name():
    surname = random.choice(SURNAMES)
    length = random.choice([2, 3])
    if length == 2:
        return surname + random.choice(NAME_CHARS)
    return surname + random.choice(NAME_CHARS) + random.choice(NAME_CHARS)


def extract_grade_class(class_name):
    grade_match = re.search(r'(\d+)级', str(class_name))
    class_match = re.search(r'(\d+)班', str(class_name))
    grade = grade_match.group(1) if grade_match else '00'
    class_no = class_match.group(1).zfill(2) if class_match else '00'
    return grade, class_no


def assign_major_codes(class_list):
    """
    为所有班级分配专业编码。
    有专业名称的按名称分配，没有的从已有编码后继续递增分配。
    用 set 确保所有编码唯一。
    """
    # 收集所有唯一的专业名称（非空）
    unique_majors = sorted({c["major"] for c in class_list if c["major"]})

    # 为每个专业名称分配编码
    major_code = {}
    code_set = set()
    for i, name in enumerate(unique_majors, 1):
        code = str(i).zfill(2)
        major_code[name] = code
        code_set.add(code)

    # 为没有专业名称的班级分配递增编码
    next_code = len(unique_majors) + 1
    result = {}
    for cls in class_list:
        name = cls["major"]
        if name:
            result[cls["id"]] = major_code[name]
        else:
            # 递归找下一个不在 set 中的编码
            while str(next_code).zfill(2) in code_set:
                next_code += 1
            code = str(next_code).zfill(2)
            result[cls["id"]] = code
            code_set.add(code)
            next_code += 1

    return result


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT id FROM orders ORDER BY id DESC LIMIT 1"))
        row = result.fetchone()
        if not row:
            print("数据库中没有订单")
            return
        order_id = row[0]

        result = await conn.execute(text("""
            SELECT c.id, c.class_name, c.headcount, m.major
            FROM classes c
            LEFT JOIN class_mappings m ON c.id = m.class_id
            WHERE c.order_id = :oid
            ORDER BY c.id
        """).bindparams(oid=order_id))

        class_list = []
        seen_ids = set()
        for r in result.all():
            cid = r[0]
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            class_list.append({
                "id": cid,
                "class_name": r[1],
                "headcount": r[2] or random.randint(30, 55),
                "major": r[3] or "",
            })

    await engine.dispose()

    print(f"订单 {order_id} 共 {len(class_list)} 个班级")

    # 分配专业编码
    class_major_codes = assign_major_codes(class_list)

    # 生成学生数据
    rows = []
    for cls in class_list:
        grade, class_no = extract_grade_class(cls["class_name"])
        major = class_major_codes[cls["id"]]

        count = cls["headcount"]
        for i in range(1, count + 1):
            seq = str(i).zfill(3)
            # 学号: 专业(2) + 年级(2) + 班号(2) + 序号(3) = 9位
            sid = f"{major}{grade}{class_no}{seq}"
            rows.append({
                "班级": cls["class_name"],
                "学号": sid,
                "姓名": gen_name(),
            })

    df = pd.DataFrame(rows)
    out = r'D:\Work\text_book\admin\安康学院班级名单表_生成_v2.xlsx'
    df.to_excel(out, index=False)

    print(f"\n已生成: {out}")
    print(f"总学生数: {len(df)}")
    print(f"学号示例:")
    for _, r in df.head(5).iterrows():
        print(f"  {r['班级']} | {r['学号']} | {r['姓名']}")


if __name__ == "__main__":
    asyncio.run(main())
