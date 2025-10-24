from __future__ import annotations

import datetime as dt
from typing import Sequence

from sqlmodel import func, select

from .database import get_session
from .models import Draw, Prize


def list_draws(limit: int = 30, offset: int = 0, date: dt.date | None = None) -> Sequence[Draw]:
    with get_session() as session:
        statement = select(Draw).order_by(Draw.draw_date.desc())
        if date:
            statement = statement.where(Draw.draw_date == date)
        statement = statement.offset(offset).limit(limit)
        return list(session.exec(statement))


def get_draw_with_prizes(draw_date: dt.date) -> Draw | None:
    with get_session() as session:
        draw = session.exec(
            select(Draw)
            .where(Draw.draw_date == draw_date)
        ).first()
        if not draw:
            return None
        return draw


def count_draws(date: dt.date | None = None) -> int:
    with get_session() as session:
        stmt = select(func.count(Draw.id))
        if date:
            stmt = stmt.where(Draw.draw_date == date)
        return session.exec(stmt).one() or 0


def upsert_draw(draw: Draw) -> Draw:
    with get_session() as session:
        session.add(draw)
        session.commit()
        session.refresh(draw)
        return draw


def list_prizes_for_draw(draw_id: int) -> list[Prize]:
    with get_session() as session:
        prizes = session.exec(select(Prize).where(Prize.draw_id == draw_id)).all()
        return list(prizes)
