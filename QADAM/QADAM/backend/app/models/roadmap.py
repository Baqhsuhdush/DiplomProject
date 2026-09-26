import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Roadmap(Base):
    __tablename__ = "roadmaps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    steps: Mapped[list["RoadmapStep"]] = relationship(
        "RoadmapStep",
        back_populates="roadmap",
        cascade="all, delete-orphan",
    )


class RoadmapStep(Base):
    __tablename__ = "roadmap_steps"
    __table_args__ = (UniqueConstraint("roadmap_id", "sequence_no", name="uq_roadmap_step_sequence"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    roadmap_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roadmaps.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    roadmap: Mapped["Roadmap"] = relationship("Roadmap", back_populates="steps")
    tasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="roadmap_step",
        cascade="all, delete-orphan",
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    roadmap_step_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roadmap_steps.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    task_type: Mapped[str] = mapped_column(String(32), nullable=False, default="learn", index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_nudge_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nudge_count_date_utc: Mapped[date | None] = mapped_column(Date, nullable=True)
    nudges_sent_on_day: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    roadmap_step: Mapped["RoadmapStep"] = relationship("RoadmapStep", back_populates="tasks")
    resources: Mapped[list["LearningResource"]] = relationship(
        "LearningResource",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    tests: Mapped[list["Test"]] = relationship(
        "Test",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    homework_submissions: Mapped[list["HomeworkSubmission"]] = relationship(
        "HomeworkSubmission",
        back_populates="task",
        cascade="all, delete-orphan",
    )
