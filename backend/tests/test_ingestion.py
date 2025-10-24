import datetime as dt

import pytest
from sqlmodel import select

from app import ingestion
from app.database import get_session
from app.models import Draw, Prize


SAMPLE_HTML = """
<div id="result-tab">
  <div class="table-responsive">
    <table>
      <tr><th>Đặc biệt</th><td><span>12345</span></td></tr>
      <tr><th>Giải nhất</th><td><span>54321</span></td></tr>
      <tr><th>Giải nhì</th><td><span>10101</span><span>20202</span></td></tr>
      <tr><th>Giải ba</th><td><span>30303</span><span>40404</span><span>50505</span><span>60606</span><span>70707</span><span>80808</span></td></tr>
      <tr><th>Giải tư</th><td><span>1111</span></td></tr>
      <tr><th>Giải năm</th><td><span>90909</span><span>00000</span><span>22222</span><span>33333</span><span>44444</span><span>55555</span></td></tr>
      <tr><th>Giải sáu</th><td><span>66666</span><span>77777</span><span>88888</span></td></tr>
      <tr><th>Giải bảy</th><td><span>12</span><span>34</span><span>56</span><span>78</span></td></tr>
    </table>
  </div>
</div>
"""


def test_parse_html_and_save_draw() -> None:
    draw_date = dt.date(2025, 1, 1)
    payload = ingestion.parse_html(SAMPLE_HTML, draw_date, "https://example.com/2025-01-01")

    assert payload.draw_date == draw_date
    assert len(payload.prizes) == 1 + 1 + 2 + 6 + 1 + 6 + 3 + 4

    draw = ingestion.save_draw(payload)
    assert draw.id is not None

    with get_session() as session:
        stored_draw = session.exec(select(Draw).where(Draw.draw_date == draw_date)).first()
        assert stored_draw is not None
        prizes = session.exec(select(Prize).where(Prize.draw_id == stored_draw.id)).all()
        assert len(prizes) == len(payload.prizes)
        assert {p.number for p in prizes} >= {"12345", "54321", "12"}


def test_ingest_range_skips_and_updates(monkeypatch: pytest.MonkeyPatch) -> None:
    base_date = dt.date(2025, 2, 2)

    def fake_fetch_draw(draw_date: dt.date) -> ingestion.DrawPayload:
        suffix = draw_date.strftime("%d%H%M")[-5:]
        prizes = [
            ingestion.PrizeEntry(prize_name="Đặc biệt", prize_rank=1, number=f"9{suffix}", position=1)
        ]
        return ingestion.DrawPayload(draw_date=draw_date, source_url=f"https://fake/{draw_date}", prizes=prizes)

    monkeypatch.setattr(ingestion, "fetch_draw", fake_fetch_draw)

    # seed existing draw
    ingestion.save_draw(fake_fetch_draw(base_date))

    stats = ingestion.ingest_range(base_date, base_date)
    assert stats["skipped"] == 1
    assert stats["created"] == 0
    assert stats["updated"] == 0

    stats_force = ingestion.ingest_range(base_date, base_date, force=True)
    assert stats_force["skipped"] == 0
    assert stats_force["updated"] == 1
    assert stats_force["failed"] == 0