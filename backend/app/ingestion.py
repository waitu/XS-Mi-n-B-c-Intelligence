from __future__ import annotations

import calendar
import datetime as dt
import logging
import re
from dataclasses import dataclass
from typing import Iterable, Set

import httpx
from bs4 import BeautifulSoup
from sqlmodel import select, delete
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import get_settings
from .database import get_session, init_db
from .models import Draw, Prize

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass(slots=True)
class PrizeEntry:
    prize_name: str
    prize_rank: int
    number: str
    position: int


@dataclass(slots=True)
class DrawPayload:
    draw_date: dt.date
    source_url: str
    prizes: list[PrizeEntry]


HEADERS = {"User-Agent": settings.user_agent}

PRIZE_NAME_ORDER = [
    "Đặc biệt",
    "Giải nhất",
    "Giải nhì",
    "Giải ba",
    "Giải tư",
    "Giải năm",
    "Giải sáu",
    "Giải bảy",
]


def normalize_prize_name(name: str) -> tuple[str, int]:
    name_clean = re.sub(r"\s+", " ", name.strip()).lower()
    for idx, canonical in enumerate(PRIZE_NAME_ORDER, start=1):
        if canonical.lower() in name_clean:
            return canonical, idx
    return name.strip().title(), len(PRIZE_NAME_ORDER) + 1


def map_label_to_canonical(label: str) -> tuple[str, int]:
    """Map site-specific labels (e.g., 'ĐB', '1', '2', ...) to canonical names and ranks.

    Returns (canonical_name, prize_rank). If unknown, falls back to normalize_prize_name.
    """
    raw = label.strip().upper()
    if raw in {"ĐB", "DB", "ĐẶC BIỆT", "DAC BIET"}:
        return "Đặc biệt", 1
    digit_map = {
        "1": ("Giải nhất", 2),
        "2": ("Giải nhì", 3),
        "3": ("Giải ba", 4),
        "4": ("Giải tư", 5),
        "5": ("Giải năm", 6),
        "6": ("Giải sáu", 7),
        "7": ("Giải bảy", 8),
    }
    if raw in digit_map:
        return digit_map[raw]
    return normalize_prize_name(label)


@retry(stop=stop_after_attempt(settings.retry_attempts), wait=wait_exponential(multiplier=settings.retry_backoff_seconds))
def fetch_draw_html(client: httpx.Client, draw_date: dt.date) -> str:
    url = settings.xsmb_source_url_template.format(day=draw_date.day, month=draw_date.month, year=draw_date.year)
    logger.debug("Fetching draw data", extra={"url": url, "draw_date": draw_date.isoformat()})
    response = client.get(url, headers=HEADERS, timeout=settings.request_timeout_seconds)
    response.raise_for_status()
    return response.text


def parse_html(html: str, draw_date: dt.date, source_url: str) -> DrawPayload:
    soup = BeautifulSoup(html, "html.parser")

    # Try multiple structures across different source pages
    table = soup.select_one("div#result-tab div.table-responsive table")
    if table is None:
        table = soup.select_one("table.table-bordered")
    if table is None:
        table = soup.select_one("table.table-result")
    if table is None:
        # Some pages wrap in section#kqngay_*/div[@class='section-content']
        table = soup.select_one("section[id^=kqngay_] div.section-content table.table-result")
    if table is None:
        raise ValueError("Không tìm thấy bảng kết quả trong trang nguồn")

    prizes: list[PrizeEntry] = []

    # Primary approach: directly select spans by known classes / ids present on the site
    mapping = [
        ("special-prize", "Đặc biệt", 1),
        ("prize1", "Giải nhất", 2),
        ("prize2", "Giải nhì", 3),
        ("prize3", "Giải ba", 4),
        ("prize4", "Giải tư", 5),
        ("prize5", "Giải năm", 6),
        ("prize6", "Giải sáu", 7),
        ("prize7", "Giải bảy", 8),
    ]

    # Đặc biệt can also be identified by id prefix 'mb_prizeDB_item'
    special_spans = table.select("span.special-prize")
    if not special_spans:
        special_spans = [s for s in table.select("span[id^=mb_prizeDB_item]")]
    for idx, span in enumerate(special_spans, start=1):
        text = span.get_text(strip=True)
        num = re.findall(r"\b\d{2,5}\b", text)
        for n in num:
            prizes.append(PrizeEntry("Đặc biệt", 1, n, idx))

    # Other prizes by class
    for css, cname, rank in mapping[1:]:
        spans = table.select(f"span.{css}")
        pos = 1
        for span in spans:
            text = span.get_text(strip=True)
            nums = re.findall(r"\b\d{2,5}\b", text)
            for n in nums:
                prizes.append(PrizeEntry(cname, rank, n, pos))
                pos += 1

    # Fallback: row-wise extraction if somehow the classes weren’t found
    if not prizes:
        allowed_labels = {"ĐB", "DB", "1", "2", "3", "4", "5", "6", "7",
                          "Đặc biệt", "Giải nhất", "Giải nhì", "Giải ba", "Giải tư", "Giải năm", "Giải sáu", "Giải bảy"}
        for row in table.find_all("tr"):
            cells = [c for c in row.find_all(["th", "td"], recursive=False)] or [c for c in row.find_all(["th", "td"])]
            if len(cells) < 2:
                continue
            raw_name = cells[0].get_text(strip=True)
            if not raw_name:
                continue
            if raw_name not in allowed_labels and map_label_to_canonical(raw_name)[1] > len(PRIZE_NAME_ORDER):
                continue
            numbers_cell = cells[1]
            if numbers_cell.get("id", "").lower().find("prizecode") != -1:
                continue
            canonical_name, prize_rank = map_label_to_canonical(raw_name)
            text_block = numbers_cell.get_text(" ", strip=True)
            candidate_numbers = re.findall(r"\b\d{2,5}\b", text_block)
            if not candidate_numbers:
                span_texts = [s.get_text(strip=True) for s in numbers_cell.find_all("span")]
                for t in span_texts:
                    candidate_numbers.extend(re.findall(r"\b\d{2,5}\b", t))
            for position, number in enumerate(candidate_numbers, start=1):
                prizes.append(PrizeEntry(canonical_name, prize_rank, number, position))

    if not prizes:
        raise ValueError("Không đọc được dữ liệu giải thưởng từ trang nguồn")

    return DrawPayload(draw_date=draw_date, source_url=source_url, prizes=prizes)


def fetch_draw(draw_date: dt.date) -> DrawPayload:
    with httpx.Client() as client:
        html = fetch_draw_html(client, draw_date)
    url = settings.xsmb_source_url_template.format(day=draw_date.day, month=draw_date.month, year=draw_date.year)
    return parse_html(html, draw_date, url)


def save_draw(payload: DrawPayload) -> Draw:
    with get_session() as session:
        existing_draw = session.exec(select(Draw).where(Draw.draw_date == payload.draw_date)).first()
        if existing_draw:
            draw = existing_draw
            draw.updated_at = dt.datetime.utcnow()
            draw.source_url = payload.source_url
            session.add(draw)
            session.commit()
            session.refresh(draw)

            # Remove existing prizes and replace to keep data accurate
            session.exec(delete(Prize).where(Prize.draw_id == draw.id))
            session.commit()
        else:
            draw = Draw(draw_date=payload.draw_date, source_url=payload.source_url)
            session.add(draw)
            session.commit()
            session.refresh(draw)

        for prize_entry in payload.prizes:
            prize = Prize(
                draw_id=draw.id,
                prize_name=prize_entry.prize_name,
                prize_rank=prize_entry.prize_rank,
                number=prize_entry.number,
                position=prize_entry.position,
            )
            session.add(prize)
        session.commit()
        session.refresh(draw)
        return draw


def ingest_range(start_date: dt.date, end_date: dt.date, *, force: bool = False) -> dict[str, object]:
    if start_date > end_date:
        raise ValueError("start_date must be before or equal to end_date")
    init_db()
    created = 0
    updated = 0
    skipped = 0
    failed: list[str] = []

    with get_session() as session:
        existing_dates: Set[dt.date] = set(session.exec(select(Draw.draw_date)))

    def _worker(date: dt.date) -> None:
        nonlocal created, updated, skipped
        try:
            existed_before = date in existing_dates
            if existed_before and not force:
                skipped += 1
                return

            payload = fetch_draw(date)
            save_draw(payload)
            if existed_before:
                updated += 1
            else:
                created += 1
                existing_dates.add(date)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to ingest draw", extra={"date": date.isoformat()})
            failed.append(f"{date.isoformat()}: {exc}")

    for day_offset in range((end_date - start_date).days + 1):
        current_date = start_date + dt.timedelta(days=day_offset)
        _worker(current_date)

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "failed": len(failed),
        "errors": failed,
    }


def get_draw(draw_date: dt.date) -> Draw | None:
    with get_session() as session:
        return session.exec(select(Draw).where(Draw.draw_date == draw_date)).first()


def ensure_current_year_data(today: dt.date | None = None, *, force: bool = False) -> dict[str, object]:
    today = today or dt.date.today()
    start_date = dt.date(today.year, 1, 1)
    init_db()
    return ingest_range(start_date, today, force=force)


def ingest_day(target_date: dt.date, *, force: bool = False) -> dict[str, object]:
    return ingest_range(target_date, target_date, force=force)


def ingest_month(year: int, month: int, *, force: bool = False) -> dict[str, object]:
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12")
    last_day = calendar.monthrange(year, month)[1]
    start_date = dt.date(year, month, 1)
    end_date = dt.date(year, month, last_day)
    today = dt.date.today()
    if end_date > today:
        end_date = today
    return ingest_range(start_date, end_date, force=force)


def ingest_year(year: int, *, force: bool = False) -> dict[str, object]:
    today = dt.date.today()
    start_date = dt.date(year, 1, 1)
    end_date = dt.date(year, 12, 31)
    if end_date > today:
        end_date = today
    if start_date > end_date:
        raise ValueError("year cannot be in the future")
    return ingest_range(start_date, end_date, force=force)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    stats = ensure_current_year_data()
    logger.info("Ingestion completed", extra=stats)
    print(stats)
