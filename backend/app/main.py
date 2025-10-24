from __future__ import annotations

import datetime as dt
import calendar

from fastapi import Body, FastAPI, HTTPException, Query
from sqlmodel import select
from fastapi.responses import StreamingResponse
import io
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware

from . import analytics, crud, ingestion
from .config import get_settings
from .database import init_db
from .models import Draw
from .schemas import (
    BacktestResponse,
    DrawSchema,
    IngestDayRequest,
    IngestMonthRequest,
    IngestYearRequest,
    NumberFrequency,
    PredictionResponse,
    PredictionBundle,
    PredictionRequest,
    PrizeSchema,
    RefreshRequest,
    RefreshResponse,
    ResultListResponse,
    SummaryStats,
    TailFrequency,
    TailFrequencyByPrize,
)

settings = get_settings()
app = FastAPI(
    title="XS Miền Bắc API",
    description="Khai thác, thống kê và dự đoán kết quả xổ số miền Bắc",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    if settings.auto_refresh_on_startup:
        ingestion.ensure_current_year_data(force=False)


def serialize_prizes(draw: Draw) -> list[PrizeSchema]:
    prizes = crud.list_prizes_for_draw(draw.id)
    ordered = sorted(prizes, key=lambda p: (p.prize_rank, p.position))
    return [
        PrizeSchema(
            prize_name=prize.prize_name,
            prize_rank=prize.prize_rank,
            number=prize.number,
            position=prize.position,
        )
        for prize in ordered
    ]


def serialize_draw(draw: Draw) -> DrawSchema:
    return DrawSchema(
        draw_date=draw.draw_date,
        region=draw.region,
        source_url=draw.source_url,
        prizes=serialize_prizes(draw),
    )


@app.get("/export/excel")
def export_draws_excel(
    start_date: dt.date | None = Query(None, description="Ngày bắt đầu (yyyy-mm-dd)"),
    end_date: dt.date | None = Query(None, description="Ngày kết thúc (yyyy-mm-dd)"),
) -> StreamingResponse:
    """Export draw/prize rows as an Excel (.xlsx) file with columns: year, month, day, region, prize_rank, prize_name, number."""
    today = dt.date.today()
    s_date = start_date or dt.date(today.year, 1, 1)
    e_date = end_date or today
    if s_date > e_date:
        raise HTTPException(status_code=400, detail="start_date phải nhỏ hơn hoặc bằng end_date")

    # Query draws in range
    from .database import get_session
    from .models import Draw, Prize

    with get_session() as session:
        stmt = (
            select(Draw)
            .where(Draw.draw_date >= s_date)
            .where(Draw.draw_date <= e_date)
            .order_by(Draw.draw_date.asc())
        )
        draws = session.exec(stmt).all()

        # Build flat rows: year, month, day, region, prize_rank, prize_name, number
        rows: list[dict[str, object]] = []
        for draw in draws:
            prizes = session.exec(select(Prize).where(Prize.draw_id == draw.id)).all()
            for prize in sorted(prizes, key=lambda p: (p.prize_rank, p.position)):
                rows.append(
                    {
                        "year": draw.draw_date.year,
                        "month": draw.draw_date.month,
                        "day": draw.draw_date.day,
                        "date": draw.draw_date.isoformat(),
                        "region": draw.region,
                        "prize_rank": int(prize.prize_rank),
                        "prize_name": prize.prize_name,
                        "number": prize.number,
                    }
                )

    if not rows:
        # Return a small empty Excel with header row
        df_empty = pd.DataFrame(columns=["year", "month", "day", "date", "region", "prize_rank", "prize_name", "number"])
        buffer = io.BytesIO()
        df_empty.to_excel(buffer, index=False)
        buffer.seek(0)
        headers = {
            "Content-Disposition": f"attachment; filename=xsmb_{s_date.isoformat()}_to_{e_date.isoformat()}.xlsx"
        }
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

    df = pd.DataFrame(rows)
    # Optionally reorder columns
    df = df[["year", "month", "day", "date", "region", "prize_rank", "prize_name", "number"]]

    buffer = io.BytesIO()
    # pandas will choose openpyxl engine if available
    df.to_excel(buffer, index=False)
    buffer.seek(0)

    headers = {
        "Content-Disposition": f"attachment; filename=xsmb_{s_date.isoformat()}_to_{e_date.isoformat()}.xlsx"
    }

    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/results", response_model=ResultListResponse)
def list_results(
    limit: int = Query(30, ge=1),
    offset: int = Query(0, ge=0),
    date: dt.date | None = Query(None, description="Lọc theo ngày quay"),
) -> ResultListResponse:
    effective_limit = min(limit, settings.max_results_per_page)
    draws = crud.list_draws(limit=effective_limit, offset=offset, date=date)
    total = crud.count_draws(date=date)
    items = [serialize_draw(draw) for draw in draws]
    return ResultListResponse(total=total, limit=effective_limit, offset=offset, items=items)


@app.get("/results/{draw_date}", response_model=DrawSchema)
def get_result(draw_date: dt.date) -> DrawSchema:
    draw = crud.get_draw_with_prizes(draw_date)
    if not draw:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ quay cho ngày này")
    return serialize_draw(draw)


@app.get("/stats/summary", response_model=SummaryStats)
def stats_summary() -> SummaryStats:
    summary = analytics.get_summary()
    return SummaryStats(**summary)


@app.get("/stats/frequencies", response_model=list[NumberFrequency])
def number_frequencies(limit: int = Query(100, ge=1, le=500)) -> list[NumberFrequency]:
    numbers = analytics.get_number_frequencies(limit=limit)
    return [NumberFrequency(number=number, count=count) for number, count in numbers]


@app.get("/stats/tail-frequencies", response_model=list[TailFrequency])
def tail_frequencies(limit: int = Query(20, ge=1, le=100)) -> list[TailFrequency]:
    tails = analytics.get_tail_frequencies(limit=limit)
    return [TailFrequency(tail=tail, count=count) for tail, count in tails]


@app.get("/stats/tail-frequencies/by-prize", response_model=list[TailFrequencyByPrize])
def tail_frequencies_by_prize(
    limit: int = Query(5, ge=1, le=20),
    digits: int = Query(2, ge=1, le=5),
    lookback_draws: int | None = Query(None, ge=1),
) -> list[TailFrequencyByPrize]:
    grouped = analytics.get_tail_frequencies_by_prize(
        digits=digits,
        lookback_draws=lookback_draws,
        limit=limit,
    )
    response: list[TailFrequencyByPrize] = []
    for prize_name, prize_rank, frequencies in grouped:
        response.append(
            TailFrequencyByPrize(
                prize_name=prize_name,
                prize_rank=prize_rank,
                frequencies=[TailFrequency(tail=tail, count=count) for tail, count in frequencies],
            )
        )
    return response


@app.get("/predictions/heads", response_model=PredictionResponse)
def predict_heads(
    algorithm: str = Query("frequency", description="Thuật toán: frequency | trend | randomized"),
    top_k: int = Query(5, ge=1, le=10),
    digits: int = Query(1, ge=1, le=5),
    lookback_draws: int | None = Query(None, ge=1),
) -> PredictionResponse:
    try:
        payload = analytics.predict_heads(
            algorithm=algorithm,
            top_k=top_k,
            digits=digits,
            lookback_draws=lookback_draws,
        )
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PredictionResponse(**payload)


@app.post("/predictions", response_model=PredictionBundle)
def create_prediction_bundle(request: PredictionRequest = Body(...)) -> PredictionBundle:
    try:
        payload = analytics.predict_numbers(
            algorithm=request.algorithm,
            top_k=request.top_k,
            digits=request.digits,
            lookback_draws=request.lookback_draws,
            prize_names=request.prize_names,
            iterations=request.iterations,
            advanced=request.advanced,
            seed=request.seed,
        )
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PredictionBundle(**payload)


@app.get("/analytics/backtest/heads", response_model=BacktestResponse)
def backtest_heads_endpoint(
    algorithm: str = Query("frequency"),
    top_k: int = Query(5, ge=1, le=10),
    digits: int = Query(2, ge=1, le=5),
    lookback_draws: int | None = Query(None, ge=1),
    evaluation_draws: int = Query(30, ge=1, le=200),
    end_date: dt.date | None = Query(None),
) -> BacktestResponse:
    try:
        payload = analytics.backtest_heads(
            algorithm=algorithm,
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
            evaluation_draws=evaluation_draws,
            end_date=end_date,
        )
    except ValueError as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return BacktestResponse(**payload)


@app.post("/ingest/refresh", response_model=RefreshResponse)
def refresh_data(request: RefreshRequest = Body(default=RefreshRequest())) -> RefreshResponse:
    today = dt.date.today()
    start_date = request.start_date or dt.date(today.year, 1, 1)
    end_date = request.end_date or today

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date phải nhỏ hơn hoặc bằng end_date")

    stats = ingestion.ingest_range(start_date, end_date, force=request.force)

    return RefreshResponse(
        start_date=start_date,
        end_date=end_date,
        created=stats.get("created", 0),
        updated=stats.get("updated", 0),
        skipped=stats.get("skipped", 0),
        failed=stats.get("failed", 0),
        errors=list(stats.get("errors", [])),
    )


@app.post("/ingest/day", response_model=RefreshResponse)
def refresh_day(request: IngestDayRequest = Body(...)) -> RefreshResponse:
    stats = ingestion.ingest_day(request.date, force=request.force)
    return RefreshResponse(
        start_date=request.date,
        end_date=request.date,
        created=stats.get("created", 0),
        updated=stats.get("updated", 0),
        skipped=stats.get("skipped", 0),
        failed=stats.get("failed", 0),
        errors=list(stats.get("errors", [])),
    )


@app.post("/ingest/month", response_model=RefreshResponse)
def refresh_month(request: IngestMonthRequest = Body(...)) -> RefreshResponse:
    if request.month < 1 or request.month > 12:
        raise HTTPException(status_code=400, detail="month phải nằm trong khoảng 1-12")

    start_date = dt.date(request.year, request.month, 1)
    last_day = calendar.monthrange(request.year, request.month)[1]
    end_date = dt.date(request.year, request.month, last_day)
    today = dt.date.today()
    if start_date > today:
        raise HTTPException(status_code=400, detail="Ngày bắt đầu không được ở tương lai")
    if end_date > today:
        end_date = today

    stats = ingestion.ingest_month(request.year, request.month, force=request.force)

    return RefreshResponse(
        start_date=start_date,
        end_date=end_date,
        created=stats.get("created", 0),
        updated=stats.get("updated", 0),
        skipped=stats.get("skipped", 0),
        failed=stats.get("failed", 0),
        errors=list(stats.get("errors", [])),
    )


@app.post("/ingest/year", response_model=RefreshResponse)
def refresh_year(request: IngestYearRequest = Body(...)) -> RefreshResponse:
    today = dt.date.today()
    start_date = dt.date(request.year, 1, 1)
    if start_date > today:
        raise HTTPException(status_code=400, detail="Năm không được ở tương lai")
    end_date = dt.date(request.year, 12, 31)
    if end_date > today:
        end_date = today

    stats = ingestion.ingest_year(request.year, force=request.force)

    return RefreshResponse(
        start_date=start_date,
        end_date=end_date,
        created=stats.get("created", 0),
        updated=stats.get("updated", 0),
        skipped=stats.get("skipped", 0),
        failed=stats.get("failed", 0),
        errors=list(stats.get("errors", [])),
    )
