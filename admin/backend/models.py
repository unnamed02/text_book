from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, BigInteger, String, Boolean, DateTime, Numeric,
    ForeignKey, UniqueConstraint, CheckConstraint, JSON, Index,
)
from sqlalchemy.orm import relationship
from database import Base


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    """自动添加 created_at 和 updated_at 审计字段的 Mixin"""
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    session_version = Column(Integer, default=0, server_default="0", nullable=False)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    school_name = Column(String(100), nullable=False)
    status = Column(String(20), default="draft", server_default="draft", nullable=False)
    dispatched_at = Column(DateTime, nullable=True)

    textbooks = relationship("Textbook", back_populates="order", cascade="all, delete-orphan")
    classes = relationship("Class", back_populates="order", cascade="all, delete-orphan")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    rosters = relationship("ClassRoster", back_populates="order", cascade="all, delete-orphan")
    student_accounts = relationship("StudentAccount", back_populates="order", cascade="all, delete-orphan")
    class_textbooks = relationship("ClassTextbook", back_populates="order", cascade="all, delete-orphan")


class Textbook(Base, TimestampMixin):
    __tablename__ = "textbooks"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    isbn = Column(String(20), nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    publisher = Column(String(100), nullable=True)
    previous_version_id = Column(Integer, ForeignKey("textbooks.id", ondelete="SET NULL"), nullable=True, index=True)

    order = relationship("Order", back_populates="textbooks")
    items = relationship("OrderItem", back_populates="textbook")
    previous_version = relationship("Textbook", remote_side="Textbook.id", backref="new_versions")

    __table_args__ = (
        UniqueConstraint("order_id", "isbn", name="uq_textbook_order_isbn"),
        CheckConstraint("price IS NULL OR price >= 0", name="ck_textbook_price"),
    )


class Class(Base, TimestampMixin):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    grade = Column(String(10), nullable=True)
    class_no = Column(String(10), nullable=True)
    headcount = Column(Integer, nullable=True)
    confirmed_count = Column(Integer, nullable=True)

    order = relationship("Order", back_populates="classes")
    items = relationship("OrderItem", back_populates="cls")
    mappings = relationship("ClassMapping", back_populates="cls", cascade="all, delete-orphan")
    rosters = relationship("ClassRoster", back_populates="cls", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("order_id", "class_name", name="uq_class_order_name"),
        CheckConstraint("headcount IS NULL OR headcount >= 0", name="ck_class_headcount"),
    )


class ClassRoster(Base, TimestampMixin):
    __tablename__ = "class_rosters"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(20), nullable=False)
    name = Column(String(50), nullable=False)
    class_name = Column(String(50), nullable=False)

    order = relationship("Order", back_populates="rosters")
    cls = relationship("Class", back_populates="rosters")

    __table_args__ = (
        UniqueConstraint("order_id", "student_id", name="uq_roster_order_student"),
    )


class ClassMapping(Base, TimestampMixin):
    __tablename__ = "class_mappings"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    campus = Column(String(50), nullable=True)
    college = Column(String(50), nullable=True)
    major = Column(String(50), nullable=True)

    cls = relationship("Class", back_populates="mappings")

    __table_args__ = (
        UniqueConstraint("class_id", "college", "campus", name="uq_mapping_class_college_campus"),
    )


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("textbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    course_name = Column(String(100), nullable=True)
    actual_count = Column(Integer, nullable=True)

    order = relationship("Order", back_populates="items")
    textbook = relationship("Textbook", back_populates="items")
    cls = relationship("Class", back_populates="items")

    __table_args__ = (
        UniqueConstraint(
            "order_id", "textbook_id", "class_id", "course_name",
            name="uq_item_order_tb_cls_course",
        ),
    )


class StudentAccount(Base, TimestampMixin):
    __tablename__ = "student_accounts"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(20), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    class_name = Column(String(50), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    selection_bitmap = Column(BigInteger, default=0, server_default="0", nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    last_submitted_at = Column(DateTime, nullable=True)
    is_confirmed = Column(Boolean, default=False, server_default="false", nullable=False)
    is_password_changed = Column(Boolean, default=False, server_default="false", nullable=False)

    order = relationship("Order", back_populates="student_accounts")

    __table_args__ = (
        UniqueConstraint("order_id", "student_id", name="uq_student_account_order_sid"),
        Index("ix_student_account_order_class", "order_id", "class_name"),
    )


class ClassTextbook(Base, TimestampMixin):
    __tablename__ = "class_textbooks"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    textbooks_json = Column(JSON, nullable=False)

    order = relationship("Order", back_populates="class_textbooks")

    __table_args__ = (
        UniqueConstraint("order_id", "class_name", name="uq_class_textbook_order_class"),
    )
