import io
import itertools
import json
import re
import pandas as pd

from datetime import timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, text

from database import get_db
from models import Order, Textbook, Class, ClassMapping, OrderItem, ClassRoster, StudentAccount, ClassTextbook, User
from auth import get_current_user

CST = timezone(timedelta(hours=8))


def format_cst(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CST).isoformat()


def _get_val(row, field_cfg):
    if not field_cfg:
        return None
    col = field_cfg.get("col")
    if not col or col not in row:
        return None
    raw = row[col]
    if pd.isna(raw):
        return None
    val = ' '.join(str(raw).split())
    if field_cfg.get("is_composite"):
        delimiter = field_cfg.get("delimiter", " ")
        parts = val.split(delimiter)
        idx = field_cfg.get("part_index", 0)
        return parts[idx].strip() if idx < len(parts) else None
    return val


def _parse_price(val):
    if val is None or val == "":
        return None
    val_str = str(val).strip()
    if val_str.upper().startswith("#"):
        return None
    try:
        return Decimal(val_str)
    except (InvalidOperation, ValueError):
        return None


def _parse_class_name(class_name):
    if not class_name:
        return {"grade": None, "class_no": None}
    grade_match = re.search(r'(\d+)级', class_name)
    class_match = re.search(r'(\d+)班', class_name)
    return {
        "grade": grade_match.group(0) if grade_match else None,
        "class_no": class_match.group(0) if class_match else None,
    }


router = APIRouter(prefix="/api/orders", tags=["orders"])


class OrderCreate(BaseModel):
    name: str
    school_name: str


@router.post("")
async def create_order(data: OrderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = Order(name=data.name, school_name=data.school_name, status="draft")
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return {"id": order.id, "name": order.name, "school_name": order.school_name, "status": order.status}


@router.get("")
async def list_orders(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    orders = result.scalars().all()

    order_ids = [o.id for o in orders]
    if not order_ids:
        return []

    # Batch count stats
    tb_result = await db.execute(
        select(Textbook.order_id, func.count()).where(Textbook.order_id.in_(order_ids)).group_by(Textbook.order_id)
    )
    tb_counts = {row[0]: row[1] for row in tb_result.all()}

    cls_result = await db.execute(
        select(Class.order_id, func.count()).where(Class.order_id.in_(order_ids)).group_by(Class.order_id)
    )
    cls_counts = {row[0]: row[1] for row in cls_result.all()}

    item_result = await db.execute(
        select(OrderItem.order_id, func.count()).where(OrderItem.order_id.in_(order_ids)).group_by(OrderItem.order_id)
    )
    item_counts = {row[0]: row[1] for row in item_result.all()}

    return [
        {
            "id": o.id,
            "name": o.name,
            "school_name": o.school_name,
            "status": o.status,
            "created_at": format_cst(o.created_at),
            "stats": {
                "textbooks": tb_counts.get(o.id, 0),
                "classes": cls_counts.get(o.id, 0),
                "items": item_counts.get(o.id, 0),
            },
        }
        for o in orders
    ]


@router.get("/{order_id}")
async def get_order(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    tb_result = await db.execute(select(func.count()).where(Textbook.order_id == order_id))
    cls_result = await db.execute(select(func.count()).where(Class.order_id == order_id))
    item_result = await db.execute(select(func.count()).where(OrderItem.order_id == order_id))

    return {
        "id": order.id,
        "name": order.name,
        "school_name": order.school_name,
        "status": order.status,
        "created_at": format_cst(order.created_at),
        "stats": {
            "textbooks": tb_result.scalar(),
            "classes": cls_result.scalar(),
            "items": item_result.scalar(),
        },
    }


@router.post("/{order_id}/preview")
async def preview_excel(order_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    columns = [str(c).strip() for c in df.columns.tolist()]
    preview = []
    for _, row in df.head(5).iterrows():
        preview.append([str(v) if pd.notna(v) else "" for v in row.values])

    suggestions = {}
    for col in columns:
        col_lower = col.lower()
        if "isbn" in col_lower:
            suggestions["ISBN"] = col
        elif any(k in col_lower for k in ["书名", "教材", "名称"]):
            suggestions["教材名"] = col
        elif any(k in col_lower for k in ["价格", "单价", "金额"]):
            suggestions["价格"] = col
        elif "校区" in col_lower:
            suggestions["校区"] = col
        elif "学院" in col_lower or "使用" in col_lower:
            suggestions["学院"] = col
        elif "出版社" in col_lower or "版别" in col_lower:
            suggestions["出版社"] = col
        elif "班级" in col_lower:
            suggestions["班级"] = col
        elif "课程" in col_lower:
            suggestions["课程名"] = col

    return {"columns": columns, "preview": preview, "suggestions": suggestions}


@router.post("/{order_id}/import")
async def import_order(
    order_id: int,
    mapping: str = Form(...),
    file: UploadFile = File(...),
    dry_run: str = Form("false"),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        mapping_dict = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON")

    is_dry_run = dry_run.lower() == "true"

    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    if not is_dry_run:
        # 清除已有数据（重新导入），与后续添加在同一事务中
        await db.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
        await db.execute(delete(Textbook).where(Textbook.order_id == order_id))
        await db.execute(delete(ClassMapping).where(ClassMapping.order_id == order_id))
        await db.execute(delete(Class).where(Class.order_id == order_id))

    warnings = []
    textbooks_map = {}
    classes_map = {}
    mappings_map = {}
    items_keys = set()

    textbook_cfg = mapping_dict.get("教材名")
    isbn_cfg = mapping_dict.get("ISBN")
    price_cfg = mapping_dict.get("价格")
    publisher_cfg = mapping_dict.get("出版社")
    class_cfg = mapping_dict.get("班级")
    headcount_cfg = mapping_dict.get("班级理论人数")
    campus_cfg = mapping_dict.get("校区")
    college_cfg = mapping_dict.get("学院")
    major_cfg = mapping_dict.get("专业")
    course_cfg = mapping_dict.get("课程名")
    # Collect multivalue column configs for expansion
    all_field_cfgs = [
        ("ISBN", isbn_cfg), ("教材名", textbook_cfg), ("价格", price_cfg),
        ("出版社", publisher_cfg), ("班级", class_cfg), ("班级理论人数", headcount_cfg),
        ("校区", campus_cfg), ("学院", college_cfg), ("专业", major_cfg), ("课程名", course_cfg),
    ]
    multivalue_cfgs = [(fk, fc) for fk, fc in all_field_cfgs if fc and fc.get("is_multivalue")]
    logs = []

    # Show multivalue expansion details (first 10 rows)
    detail_logs = []
    if multivalue_cfgs:
        for fk, fc in multivalue_cfgs:
            col = fc.get("col")
            delimiter = fc.get("delimiter", "、")
            logs.append(f"多值列展开: {fk} (分隔符: '{delimiter}')")
            for idx in range(min(10, len(df))):
                row = df.iloc[idx]
                if col and col in row:
                    raw = row[col]
                    val = "" if pd.isna(raw) else str(raw).strip()
                    parts = [v.strip() for v in val.split(delimiter) if v.strip()]
                    if len(parts) > 1:
                        detail_logs.append(f"  第{idx+2}行: \"{val}\" → {', '.join(parts)}")
    else:
        logs.append("无多值列")

    # Expand rows: for each original row, cartesian-product all multivalue columns
    expanded_rows = []
    for idx, row in df.iterrows():
        row_num = idx + 2
        mv_values = {}
        for field_key, field_cfg in multivalue_cfgs:
            col = field_cfg.get("col")
            if col and col in row:
                raw = row[col]
                if pd.isna(raw):
                    val = ""
                else:
                    val = str(raw).strip()
                delimiter = field_cfg.get("delimiter", "、")
                parts = [v.strip() for v in val.split(delimiter) if v.strip()]
                mv_values[field_key] = parts if parts else [""]
        if not mv_values:
            expanded_rows.append((row_num, row))
        else:
            keys = list(mv_values.keys())
            value_lists = [mv_values[k] for k in keys]
            for combo in itertools.product(*value_lists):
                new_row = pd.Series(dict(row), index=row.index)
                for k, v in zip(keys, combo):
                    field_cfg = next(fc for fk, fc in multivalue_cfgs if fk == k)
                    new_row[field_cfg["col"]] = v
                expanded_rows.append((row_num, new_row))
    logs.append(f"行展开: {len(df)} 行 → {len(expanded_rows)} 行")
    logs.extend(detail_logs)

    for row_num, row in expanded_rows:
        # ISBN check
        isbn_raw = _get_val(row, isbn_cfg)
        if not isbn_raw:
            warnings.append(f"第{row_num}行ISBN为空，已跳过")
            continue
        isbn = str(isbn_raw).strip()

        # Class check
        class_name_raw = _get_val(row, class_cfg)
        if not class_name_raw:
            warnings.append(f"第{row_num}行班级名称为空，已跳过")
            continue
        class_name = str(class_name_raw).strip()

        # Textbook
        textbook = textbooks_map.get(isbn)
        if not textbook:
            name = _get_val(row, textbook_cfg) or ""
            price = _parse_price(_get_val(row, price_cfg)) if price_cfg else None
            publisher = _get_val(row, publisher_cfg) if publisher_cfg else None
            textbook = Textbook(
                order_id=order_id,
                name=name,
                isbn=isbn,
                price=price,
                publisher=publisher,
            )
            if not is_dry_run:
                db.add(textbook)
            textbooks_map[isbn] = textbook

        # Class
        cls = classes_map.get(class_name)
        if not cls:
            parsed = _parse_class_name(class_name)
            headcount_raw = _get_val(row, headcount_cfg)
            headcount = None
            if headcount_raw:
                try:
                    headcount = int(float(str(headcount_raw).strip()))
                except (ValueError, TypeError):
                    headcount = None
            cls = Class(
                order_id=order_id,
                class_name=class_name,
                grade=parsed["grade"],
                class_no=parsed["class_no"],
                headcount=headcount,
            )
            if not is_dry_run:
                db.add(cls)
            classes_map[class_name] = cls

        # Collect class mapping info for later creation (after flush)
        campus_val = _get_val(row, campus_cfg)
        college_val = _get_val(row, college_cfg)
        major_val = _get_val(row, major_cfg)
        mapping_key = (class_name, campus_val, college_val)
        if mapping_key not in mappings_map:
            mappings_map[mapping_key] = {"campus": campus_val, "college": college_val, "major": major_val}

        # Course name
        course_name = _get_val(row, course_cfg)

        # Generate items
        item_key = (isbn, class_name, course_name)
        if item_key in items_keys:
            continue
        items_keys.add(item_key)

    if not is_dry_run:
        await db.flush()

        # Build textbook_id and class_id maps
        tb_id_map = {tb.isbn: tb.id for tb in textbooks_map.values()}
        cls_id_map = {cls.class_name: cls.id for cls in classes_map.values()}

        # Create class mappings
        for (class_name, campus_val, college_val), info in mappings_map.items():
            cls_id = cls_id_map.get(class_name)
            if cls_id:
                db.add(ClassMapping(
                    order_id=order_id,
                    class_id=cls_id,
                    campus=campus_val,
                    college=college_val,
                    major=info["major"],
                ))

        # Re-iterate expanded rows to create order items with IDs
        for row_num, row in expanded_rows:
            isbn_raw = _get_val(row, isbn_cfg)
            class_name_raw = _get_val(row, class_cfg)
            if not isbn_raw or not class_name_raw:
                continue
            isbn = str(isbn_raw).strip()
            class_name = str(class_name_raw).strip()

            tb_id = tb_id_map.get(isbn)
            cls_id = cls_id_map.get(class_name)
            if not tb_id or not cls_id:
                continue

            course_name = _get_val(row, course_cfg)
            item_key = (tb_id, cls_id, course_name)
            if item_key in items_keys:
                continue
            items_keys.add(item_key)
            db.add(OrderItem(
                order_id=order_id,
                textbook_id=tb_id,
                class_id=cls_id,
                course_name=course_name,
            ))

        if order.status == "draft":
            order.status = "textbook_imported"
        elif order.status in ("roster_imported", "imported"):
            # 重新导入教材会级联删除已有花名册，状态回到 textbook_imported
            order.status = "textbook_imported"
        await db.commit()

        return {
            "textbooks_count": len(textbooks_map),
            "classes_count": len(classes_map),
            "items_count": len(items_keys),
            "logs": logs,
            "warnings": warnings[:20],
        }

    # dry_run: build preview purely in memory without touching the DB
    tb_class_names = {}
    for row_num, row in expanded_rows:
        isbn_raw = _get_val(row, isbn_cfg)
        class_name_raw = _get_val(row, class_cfg)
        if not isbn_raw or not class_name_raw:
            continue
        isbn = str(isbn_raw).strip()
        class_name = str(class_name_raw).strip()
        tb_class_names.setdefault(isbn, set()).add(class_name)

    cls_name_to_headcount = {cls.class_name: cls.headcount for cls in classes_map.values()}

    textbooks_preview = []
    for tb in textbooks_map.values():
        total = sum((cls_name_to_headcount.get(cn) or 0) for cn in tb_class_names.get(tb.isbn, set()))
        textbooks_preview.append({
            "name": tb.name, "isbn": tb.isbn,
            "price": str(tb.price) if tb.price else None,
            "publisher": tb.publisher,
            "total_headcount": total,
        })

    class_tree = {}
    cls_info_map = {cls.class_name: cls for cls in classes_map.values()}
    for (class_name, campus_val, college_val), info in mappings_map.items():
        campus = campus_val or "未分类校区"
        college = college_val or "未分类学院"
        if campus not in class_tree:
            class_tree[campus] = {}
        if college not in class_tree[campus]:
            class_tree[campus][college] = []
        cls = cls_info_map.get(class_name)
        class_tree[campus][college].append({
            "class_name": class_name,
            "grade": cls.grade if cls else None,
            "class_no": cls.class_no if cls else None,
            "major": info["major"],
        })

    return {
        "dry_run": True,
        "textbooks_count": len(textbooks_map),
        "classes_count": len(classes_map),
        "items_count": len(items_keys),
        "expanded_rows_count": len(expanded_rows),
        "logs": logs,
        "textbooks_preview": textbooks_preview,
        "classes_tree": class_tree,
        "warnings": warnings[:20],
    }


@router.get("/{order_id}/textbooks")
async def list_textbooks(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        text("""
            SELECT id, name, isbn, price, publisher, total_headcount, actual_headcount, previous_version_id
            FROM textbook_view
            WHERE order_id = :order_id
            ORDER BY total_headcount DESC NULLS LAST, id
        """).bindparams(order_id=order_id)
    )
    rows = result.all()
    return [
        {"id": r.id, "name": r.name, "isbn": r.isbn, "price": str(r.price) if r.price else None, "publisher": r.publisher, "total_headcount": r.total_headcount, "actual_headcount": r.actual_headcount, "previous_version_id": r.previous_version_id}
        for r in rows
    ]


class UpdateTextbookReq(BaseModel):
    name: str
    isbn: Optional[str] = None
    price: Optional[str] = None
    publisher: Optional[str] = None


@router.put("/{order_id}/textbooks/{textbook_id}")
async def update_textbook(
    order_id: int,
    textbook_id: int,
    req: UpdateTextbookReq,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """修改教材：id 不变，旧数据复制到新记录，当前记录指向旧版本。"""
    result = await db.execute(
        select(Textbook).where(Textbook.id == textbook_id, Textbook.order_id == order_id)
    )
    tb = result.scalar_one_or_none()
    if not tb:
        raise HTTPException(status_code=404, detail="教材不存在")

    # 1. 复制旧数据到新记录（历史版本）
    old_version = Textbook(
        order_id=tb.order_id,
        name=tb.name,
        isbn=tb.isbn,
        price=tb.price,
        publisher=tb.publisher,
        previous_version_id=tb.previous_version_id,  # 继承更早的版本链
    )
    db.add(old_version)
    await db.flush()  # 获取 old_version.id

    # 2. 更新当前记录（id 不变）
    tb.name = req.name
    tb.isbn = req.isbn
    tb.price = Decimal(req.price) if req.price else None
    tb.publisher = req.publisher
    tb.previous_version_id = old_version.id

    await db.commit()
    return {"message": "教材已更新", "previous_version_id": old_version.id}


@router.get("/{order_id}/classes")
async def list_classes(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    class_result = await db.execute(
        select(Class, ClassMapping)
        .outerjoin(ClassMapping, Class.id == ClassMapping.class_id)
        .where(Class.order_id == order_id)
    )
    rows = class_result.all()

    class_ids = list({cls.id for cls, _ in rows})

    # 批量查询每个班级的教材数量（去重）
    tb_counts = {}
    if class_ids:
        tb_result = await db.execute(
            select(OrderItem.class_id, func.count(OrderItem.textbook_id.distinct()))
            .where(OrderItem.order_id == order_id, OrderItem.class_id.in_(class_ids))
            .group_by(OrderItem.class_id)
        )
        tb_counts = {row[0]: row[1] for row in tb_result.all()}

    # 批量查询每个班级的花名册人数
    roster_counts = {}
    if class_ids:
        roster_result = await db.execute(
            select(ClassRoster.class_id, func.count())
            .where(ClassRoster.order_id == order_id, ClassRoster.class_id.in_(class_ids))
            .group_by(ClassRoster.class_id)
        )
        roster_counts = {row[0]: row[1] for row in roster_result.all()}

    class_map = {}
    for cls, mapping in rows:
        if cls.id not in class_map:
            class_map[cls.id] = {
                "id": cls.id,
                "class_name": cls.class_name,
                "grade": cls.grade,
                "class_no": cls.class_no,
                "headcount": cls.headcount,
                "confirmed_count": cls.confirmed_count,
                "textbook_count": tb_counts.get(cls.id, 0),
                "roster_count": roster_counts.get(cls.id, 0),
                "mappings": [],
            }
        if mapping:
            class_map[cls.id]["mappings"].append({
                "id": mapping.id,
                "campus": mapping.campus,
                "college": mapping.college,
                "major": mapping.major,
            })

    return list(class_map.values())


@router.get("/{order_id}/items")
async def list_items(order_id: int, class_id: Optional[int] = Query(None), textbook_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = (
        select(OrderItem, Textbook, Class)
        .join(Textbook, OrderItem.textbook_id == Textbook.id)
        .join(Class, OrderItem.class_id == Class.id)
        .where(OrderItem.order_id == order_id)
        .order_by(Textbook.id)
    )
    if class_id is not None:
        query = query.where(Class.id == class_id)
    if textbook_id is not None:
        query = query.where(Textbook.id == textbook_id)
    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": item.id,
            "course_name": item.course_name,
            "actual_count": item.actual_count,
            "textbook": {"id": tb.id, "name": tb.name, "isbn": tb.isbn, "publisher": tb.publisher, "price": str(tb.price) if tb.price else None},
            "class": {"id": cls.id, "class_name": cls.class_name, "headcount": cls.headcount, "confirmed_count": cls.confirmed_count},
        }
        for item, tb, cls in rows
    ]


@router.delete("/{order_id}")
async def delete_order(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.execute(delete(StudentAccount).where(StudentAccount.order_id == order_id))
    await db.execute(delete(ClassTextbook).where(ClassTextbook.order_id == order_id))
    await db.execute(delete(ClassRoster).where(ClassRoster.order_id == order_id))
    await db.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
    await db.execute(delete(Textbook).where(Textbook.order_id == order_id))
    await db.execute(delete(ClassMapping).where(ClassMapping.order_id == order_id))
    await db.execute(delete(Class).where(Class.order_id == order_id))
    await db.execute(delete(Order).where(Order.id == order_id))
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{order_id}/rosters/preview")
async def preview_roster(order_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    columns = [str(c).strip() for c in df.columns.tolist()]
    preview = []
    for _, row in df.head(5).iterrows():
        preview.append([str(v) if pd.notna(v) else "" for v in row.values])

    suggestions = {}
    for col in columns:
        col_lower = col.lower()
        if any(k in col_lower for k in ["学号", "学籍", "编号", "id"]):
            suggestions["学号"] = col
        elif any(k in col_lower for k in ["姓名", "名字", "学生", "name"]):
            suggestions["姓名"] = col
        elif any(k in col_lower for k in ["班级", "班号", "class"]):
            suggestions["班级"] = col

    return {"columns": columns, "preview": preview, "suggestions": suggestions}


@router.post("/{order_id}/rosters/import")
async def import_roster(order_id: int, mapping: str = Form(...), file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        mapping_dict = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON")

    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        df.columns = [str(c).strip() for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    student_id_col = mapping_dict.get("学号", {}).get("col")
    name_col = mapping_dict.get("姓名", {}).get("col")
    class_col = mapping_dict.get("班级", {}).get("col")

    if not student_id_col or not name_col or not class_col:
        raise HTTPException(status_code=400, detail="Missing required field mapping")

    # 清除已有花名册数据
    await db.execute(delete(ClassRoster).where(ClassRoster.order_id == order_id))

    # 获取订单下所有班级
    class_result = await db.execute(select(Class).where(Class.order_id == order_id))
    classes = class_result.scalars().all()
    class_map = {c.class_name: c.id for c in classes}

    warnings = []
    inserted = 0
    seen_sids = set()

    for idx, row in df.iterrows():
        row_num = idx + 2
        sid = _get_val(row, {"col": student_id_col}) if student_id_col in row else None
        name = _get_val(row, {"col": name_col}) if name_col in row else None
        class_name = _get_val(row, {"col": class_col}) if class_col in row else None

        if not sid:
            warnings.append(f"第{row_num}行学号为空，已跳过")
            continue
        if not name:
            warnings.append(f"第{row_num}行姓名为空，已跳过")
            continue
        if not class_name:
            warnings.append(f"第{row_num}行班级为空，已跳过")
            continue

        if sid in seen_sids:
            warnings.append(f"第{row_num}行学号 '{sid}' 重复，已跳过")
            continue
        seen_sids.add(sid)

        class_id = class_map.get(class_name)
        if not class_id:
            warnings.append(f"第{row_num}行班级 '{class_name}' 未匹配到系统中的班级，已跳过")
            continue

        db.add(ClassRoster(
            order_id=order_id,
            class_id=class_id,
            student_id=sid,
            name=name,
            class_name=class_name,
        ))
        inserted += 1

    await db.commit()

    # 更新订单状态
    if order.status == "draft":
        order.status = "roster_imported"
    elif order.status in ("textbook_imported", "imported"):
        # 重新导入花名册，保持 imported 状态
        order.status = "imported"
    await db.commit()

    return {
        "inserted": inserted,
        "warnings": warnings[:20],
    }


@router.get("/{order_id}/rosters")
async def list_rosters(order_id: int, class_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(ClassRoster).where(ClassRoster.order_id == order_id)
    if class_id is not None:
        query = query.where(ClassRoster.class_id == class_id)
    query = query.order_by(ClassRoster.student_id)
    result = await db.execute(query)
    rosters = result.scalars().all()
    return [
        {"id": r.id, "student_id": r.student_id, "name": r.name, "class_name": r.class_name}
        for r in rosters
    ]


@router.post("/{order_id}/summary")
async def summarize_order(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """汇总学生选书结果：解析 bitmap 位图，统计各班级-教材的实际选择人数。
    汇总期间对关键表加 SHARE 锁，阻止学生端并发提交导致数据不一致。"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # 加 SHARE 锁：允许读取，阻止写入（UPDATE/DELETE/INSERT）
    # 汇总期间学生端提交选书会等待锁释放或超时失败
    await db.execute(
        text("LOCK TABLE student_accounts, order_items, classes, class_textbooks IN SHARE MODE")
    )

    # Step 1: 清零旧数据
    await db.execute(text("UPDATE order_items SET actual_count = 0 WHERE order_id = :order_id").bindparams(order_id=order_id))
    await db.execute(text("UPDATE classes SET confirmed_count = 0 WHERE order_id = :order_id").bindparams(order_id=order_id))

    # Step 2: 计算班级已确认人数（只统计已提交选书的学生）
    await db.execute(text("""
        UPDATE classes c
        SET confirmed_count = (
            SELECT COUNT(*) FROM student_accounts sa
            WHERE sa.order_id = c.order_id
              AND sa.class_name = c.class_name
              AND sa.is_confirmed = true
        )
        WHERE c.order_id = :order_id
    """).bindparams(order_id=order_id))

    # Step 3: 计算班级-教材实际选择人数（核心位运算）
    await db.execute(text("""
        WITH textbook_positions AS (
            SELECT
                ct.order_id,
                ct.class_name,
                (elem->>'textbook_id')::INTEGER AS textbook_id,
                (ordinality - 1)::INTEGER AS bit_position
            FROM class_textbooks ct,
                 jsonb_array_elements(ct.textbooks_json::jsonb) WITH ORDINALITY AS t(elem, ordinality)
            WHERE ct.order_id = :order_id
        ),
        selection_counts AS (
            SELECT
                c.id AS class_id,
                tp.textbook_id,
                COUNT(*) AS cnt
            FROM textbook_positions tp
            JOIN student_accounts sa
                ON sa.order_id = tp.order_id
                AND sa.class_name = tp.class_name
                AND (sa.selection_bitmap & (1::BIGINT << tp.bit_position)) != 0
            JOIN classes c
                ON c.class_name = tp.class_name AND c.order_id = tp.order_id
            GROUP BY c.id, tp.textbook_id
        )
        UPDATE order_items oi
        SET actual_count = COALESCE(sc.cnt, 0)
        FROM selection_counts sc
        WHERE oi.order_id = :order_id
          AND oi.class_id = sc.class_id
          AND oi.textbook_id = sc.textbook_id
    """).bindparams(order_id=order_id))

    # Step 4: 处理未被匹配到的 order_items（无人选择的置 0）
    await db.execute(text("UPDATE order_items SET actual_count = 0 WHERE order_id = :order_id AND actual_count IS NULL").bindparams(order_id=order_id))

    # Step 5: 处理无学生的班级
    await db.execute(text("UPDATE classes SET confirmed_count = 0 WHERE order_id = :order_id AND confirmed_count IS NULL").bindparams(order_id=order_id))

    await db.commit()

    # 返回汇总统计
    result = await db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM student_accounts WHERE order_id = :order_id) AS total_students,
                (SELECT COUNT(*) FROM student_accounts WHERE order_id = :order_id AND is_confirmed = true) AS confirmed_students,
                (SELECT COALESCE(SUM(actual_count), 0) FROM order_items WHERE order_id = :order_id) AS total_actual,
                (SELECT COALESCE(SUM(headcount), 0) FROM classes WHERE order_id = :order_id) AS total_headcount
        """).bindparams(order_id=order_id)
    )
    row = result.one()

    return {
        "message": "汇总完成",
        "total_students": row.total_students,
        "confirmed_students": row.confirmed_students,
        "total_actual": int(row.total_actual) if row.total_actual else 0,
        "total_headcount": int(row.total_headcount) if row.total_headcount else 0,
    }
