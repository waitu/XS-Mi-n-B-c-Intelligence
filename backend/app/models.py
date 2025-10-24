from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlmodel import Field, SQLModel


class Draw(SQLModel, table=True):
    __tablename__ = "draws"

    id: Optional[int] = Field(default=None, primary_key=True)
    draw_date: dt.date = Field(index=True, unique=True)
    region: str = Field(default="mien-bac", max_length=25)
    source_url: Optional[str] = Field(default=None, max_length=255)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    # relationships are intentionally omitted for compatibility with SQLAlchemy 2.x


class Prize(SQLModel, table=True):
    __tablename__ = "prizes"

    id: Optional[int] = Field(default=None, primary_key=True)
    draw_id: int = Field(foreign_key="draws.id", index=True)
    prize_name: str = Field(max_length=50, index=True)
    prize_rank: int = Field(default=0, index=True)
    number: str = Field(max_length=5, index=True)
    position: int = Field(default=0)

    # relationships are intentionally omitted for compatibility with SQLAlchemy 2.x


class DrawWithPrizes(SQLModel):
    draw_date: dt.date
    region: str
    source_url: Optional[str]
    prizes: list[Prize]
