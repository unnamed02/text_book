import hashlib
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from database import get_db
from models import Order, Class, Textbook, OrderItem, ClassRoster, StudentAccount, ClassTextbook, utc_now, User
from auth import get_current_user

router = APIRouter(prefix="/api/orders", tags=["dispatch"])


def _sha256_password(password: str) -> str:
    """
    与学生端 auth.go 保持一致。
    前端对明文做 sha256 得到 prehash，后端存储 sha256(salt + prehash)。
    格式：salt$hash
    """
    salt = os.urandom(16).hex()
    prehash = hashlib.sha256(password.encode()).hexdigest()
    h = hashlib.sha256((salt + prehash).encode()).hexdigest()
    return f"{salt}${h}"


@router.post("/{order_id}/dispatch")
async def dispatch_order(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "imported":
        raise HTTPException(status_code=400, detail="订单状态不正确，需要先完成征订表和名单表导入")

    # 清除之前可能存在的下发数据
    await db.execute(delete(StudentAccount).where(StudentAccount.order_id == order_id))
    await db.execute(delete(ClassTextbook).where(ClassTextbook.order_id == order_id))

    # 按班级聚合教材，生成 textbooks_json（按 textbook_id 排序保证顺序稳定）
    result = await db.execute(
        select(Class.class_name, Textbook, OrderItem.course_name)
        .join(OrderItem, Class.id == OrderItem.class_id)
        .join(Textbook, OrderItem.textbook_id == Textbook.id)
        .where(Class.order_id == order_id)
        .order_by(Class.class_name, Textbook.id)
    )
    rows = result.all()

    class_textbooks = {}
    for class_name, tb, course_name in rows:
        if class_name not in class_textbooks:
            class_textbooks[class_name] = []
        class_textbooks[class_name].append({
            "textbook_id": tb.id,
            "name": tb.name,
            "isbn": tb.isbn,
            "price": str(tb.price) if tb.price else None,
            "publisher": tb.publisher,
            "course_name": course_name,
        })

    # 写入 class_textbooks
    for class_name, textbooks in class_textbooks.items():
        db.add(ClassTextbook(
            order_id=order_id,
            class_name=class_name,
            textbooks_json=textbooks,
        ))

    # 预计算默认密码哈希（与学生端 sha256Verify 兼容）
    default_password_hash = _sha256_password("123456")

    # 查询学生花名册，创建 student_accounts
    result = await db.execute(
        select(ClassRoster).where(ClassRoster.order_id == order_id)
    )
    rosters = result.scalars().all()

    for roster in rosters:
        db.add(StudentAccount(
            order_id=order_id,
            student_id=roster.student_id,
            name=roster.name,
            class_name=roster.class_name,
            hashed_password=default_password_hash,
            selection_bitmap=0,
            is_password_changed=False,
        ))

    # 更新订单状态
    order.status = "dispatched"
    order.dispatched_at = utc_now()

    await db.commit()

    return {
        "message": "下发成功",
        "student_count": len(rosters),
        "class_count": len(class_textbooks),
    }


@router.get("/{order_id}/dispatch-status")
async def get_dispatch_status(order_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    student_count = 0
    class_count = 0
    if order.status == "dispatched":
        sc_result = await db.execute(
            select(StudentAccount).where(StudentAccount.order_id == order_id)
        )
        student_count = len(sc_result.scalars().all())

        ct_result = await db.execute(
            select(ClassTextbook).where(ClassTextbook.order_id == order_id)
        )
        class_count = len(ct_result.scalars().all())

    return {
        "status": order.status,
        "dispatched_at": order.dispatched_at.isoformat() if order.dispatched_at else None,
        "student_count": student_count,
        "class_count": class_count,
    }


@router.get("/{order_id}/students")
async def list_students(
    order_id: int,
    class_name: str = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """查询订单下的学生账号列表"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    query = select(StudentAccount).where(StudentAccount.order_id == order_id)
    if class_name:
        query = query.where(StudentAccount.class_name == class_name)
    query = query.order_by(StudentAccount.class_name, StudentAccount.student_id)

    result = await db.execute(query)
    students = result.scalars().all()

    def count_bits(bitmap: int) -> int:
        """统计 bitmap 中 1 的位数（学生确认选择的教材数量）"""
        return bin(bitmap).count("1") if bitmap else 0

    return [
        {
            "id": s.id,
            "student_id": s.student_id,
            "name": s.name,
            "class_name": s.class_name,
            "selection_bitmap": s.selection_bitmap,
            "confirmed_count": count_bits(s.selection_bitmap),
        }
        for s in students
    ]


@router.post("/{order_id}/students/{student_id}/reset-password")
async def reset_student_password(
    order_id: int,
    student_id: str,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """重置学生密码为初始密码 123456"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    default_password_hash = _sha256_password("123456")
    result = await db.execute(
        update(StudentAccount)
        .where(
            StudentAccount.order_id == order_id,
            StudentAccount.student_id == student_id,
        )
        .values(hashed_password=default_password_hash, is_password_changed=False)
    )
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Student not found")

    return {"message": "密码已重置为初始密码 123456", "student_id": student_id}


@router.post("/{order_id}/students/reset-password-batch")
async def reset_passwords_batch(
    order_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """批量重置学生密码
    data: {"student_ids": ["2021001", "2021002"]}
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    student_ids = data.get("student_ids", [])
    if not student_ids:
        raise HTTPException(status_code=400, detail="student_ids 不能为空")

    default_password_hash = _sha256_password("123456")
    result = await db.execute(
        update(StudentAccount)
        .where(
            StudentAccount.order_id == order_id,
            StudentAccount.student_id.in_(student_ids),
        )
        .values(hashed_password=default_password_hash, is_password_changed=False)
    )
    await db.commit()

    return {"message": "批量重置密码成功", "reset_count": result.rowcount}


@router.post("/{order_id}/students/reset-all")
async def reset_all_students(
    order_id: int,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """一键重置所有学生：密码恢复为 123456"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    default_password_hash = _sha256_password("123456")
    pwd_result = await db.execute(
        update(StudentAccount)
        .where(StudentAccount.order_id == order_id)
        .values(hashed_password=default_password_hash, is_password_changed=False)
    )
    await db.commit()

    return {
        "message": "一键重置完成",
        "reset_count": pwd_result.rowcount,
    }
