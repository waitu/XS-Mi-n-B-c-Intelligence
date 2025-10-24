from __future__ import annotations

import datetime as dt
from typing import Mapping, Sequence

from pydantic import BaseModel


class PrizeSchema(BaseModel):
    prize_name: str
    prize_rank: int
    number: str
    position: int


class DrawSchema(BaseModel):
    draw_date: dt.date
    region: str
    source_url: str | None = None
    prizes: Sequence[PrizeSchema]


class SummaryStats(BaseModel):
    total_draws: int
    last_updated: dt.datetime | None
    prizes_per_rank: dict[str, int]


class TailFrequency(BaseModel):
    tail: str
    count: int


class NumberFrequency(BaseModel):
    number: str
    count: int


class TailFrequencyByPrize(BaseModel):
    prize_name: str
    prize_rank: int
    frequencies: list[TailFrequency]


class PredictionResultItem(BaseModel):
    rank: int
    number: str
    probability: float
    supporting_metrics: Mapping[str, float] | None = None
    explanation: str | None = None


class PredictionRelated(BaseModel):
    hot_numbers: list[str]
    cold_numbers: list[str]
    heatmap_slice: Mapping[str, float]
    pseudo_code: str | None = None


class PredictionMetadata(BaseModel):
    lookback_draws: int | None
    digits: int
    runtime_ms: float
    confidence_score: float
    notes: str | None = None
    advanced: bool | None = None
    top_k: int | None = None


class PredictionScore(BaseModel):
    number: str
    probability: float


class PredictionResponse(BaseModel):
    algorithm: str
    label: str
    timestamp: dt.datetime
    metadata: PredictionMetadata
    recommended_heads: list[str]
    results: list[PredictionResultItem]
    scores: list[PredictionScore]
    notes: str | None = None


class PredictionBundle(BaseModel):
    algorithm: str
    label: str
    timestamp: dt.datetime
    metadata: PredictionMetadata
    results: list[PredictionResultItem]
    related: PredictionRelated
    debug: dict[str, object] | None = None


class BacktestPredictionItem(BaseModel):
    rank: int
    number: str
    probability: float
    hit: bool


class BacktestDrawResult(BaseModel):
    draw_date: dt.date
    draw_label: str
    actual_numbers: list[str]
    actual_heads: list[str]
    predictions: list[BacktestPredictionItem]
    matched_numbers: list[str]
    best_rank: int | None = None
    hit: bool
    confidence: float | None = None
    history_size: int


class BacktestSummary(BaseModel):
    evaluated_draws: int
    skipped_draws: int
    hits: int
    hit_rate: float
    average_rank_hit: float | None = None


class BacktestResponse(BaseModel):
    algorithm: str
    label: str
    digits: int
    top_k: int
    lookback_draws: int | None = None
    evaluation_draws: int
    summary: BacktestSummary
    timeline: list[BacktestDrawResult]
    parameters: Mapping[str, object | None]


class PredictionRequest(BaseModel):
    algorithm: str
    top_k: int = 5
    digits: int = 2
    lookback_draws: int | None = None
    prize_names: list[str] | None = None
    iterations: int | None = None
    advanced: bool = False
    seed: int | None = None


class ResultListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[DrawSchema]


class RefreshRequest(BaseModel):
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    force: bool = False


class RefreshResponse(BaseModel):
    start_date: dt.date
    end_date: dt.date
    created: int
    updated: int
    skipped: int
    failed: int
    errors: list[str]


class IngestDayRequest(BaseModel):
    date: dt.date
    force: bool = False


class IngestMonthRequest(BaseModel):
    year: int
    month: int
    force: bool = False


class IngestYearRequest(BaseModel):
    year: int
    force: bool = False
