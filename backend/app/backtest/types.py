from __future__ import annotations

import dataclasses
import datetime as dt
from typing import Callable, Iterable, Sequence


@dataclasses.dataclass(frozen=True)
class PayoutRules:
    jackpot_multiplier: float = 70.0
    loss_multiplier: float = -1.0


@dataclasses.dataclass(frozen=True)
class RiskLimits:
    max_daily_stake_ratio: float = 0.20
    max_single_stake_ratio: float = 0.10

    def clamp_daily(self, capital: float) -> float:
        return max(capital * max(self.max_daily_stake_ratio, 0.0), 0.0)

    def clamp_single(self, capital: float) -> float:
        return max(capital * max(self.max_single_stake_ratio, 0.0), 0.0)


@dataclasses.dataclass(frozen=True)
class StrategyConfig:
    type: str
    options: dict[str, object]
    plugin_id: str | None = None


@dataclasses.dataclass(frozen=True)
class Prediction:
    number: str
    probability: float | None
    rank: int


@dataclasses.dataclass(frozen=True)
class BetDecision:
    number: str
    stake: float


@dataclasses.dataclass(frozen=True)
class HistorySnapshot:
    date: dt.date
    capital_end: float
    pnl: float
    hit: bool


@dataclasses.dataclass
class StrategyContext:
    date: dt.date
    day_index: int
    capital: float
    predictions: Sequence[Prediction]
    history: Sequence[HistorySnapshot]
    config: dict[str, object]
    risk_limits: RiskLimits

    def to_plugin_payload(self) -> dict[str, object]:
        return {
            "date": self.date.isoformat(),
            "dayIndex": self.day_index,
            "capital": self.capital,
            "predictions": [
                {
                    "number": prediction.number,
                    "probability": prediction.probability,
                    "rank": prediction.rank,
                }
                for prediction in self.predictions
            ],
            "history": [
                {
                    "date": snapshot.date.isoformat(),
                    "capitalEnd": snapshot.capital_end,
                    "pnl": snapshot.pnl,
                    "hit": snapshot.hit,
                }
                for snapshot in self.history
            ],
            "config": dict(self.config),
            "riskLimits": {
                "maxDailyStakeRatio": self.risk_limits.max_daily_stake_ratio,
                "maxSingleStakeRatio": self.risk_limits.max_single_stake_ratio,
                "maxDailyStake": self.risk_limits.clamp_daily(self.capital),
                "maxSingleStake": self.risk_limits.clamp_single(self.capital),
            },
        }


@dataclasses.dataclass(frozen=True)
class BacktestConfig:
    capital: float
    date_start: dt.date
    date_end: dt.date
    region: str | None
    model: str
    top_k: int
    digits: int
    strategy: StrategyConfig
    payout_rules: PayoutRules
    risk_limits: RiskLimits
    lookback_draws: int | None = None
    seed: int | None = None


@dataclasses.dataclass(frozen=True)
class TimelineBet:
    number: str
    stake: float
    hit: bool
    payout: float
    probability: float | None
    rank: int | None


@dataclasses.dataclass(frozen=True)
class TimelineEntry:
    date: dt.date
    capital_start: float
    capital_end: float
    stake_total: float
    pnl: float
    bets: Sequence[TimelineBet]
    predictions: Sequence[Prediction]
    hits: Sequence[str]
    drawdown: float
    daily_return: float
    capital_halted: bool


@dataclasses.dataclass(frozen=True)
class BacktestSummary:
    final_balance: float
    total_bets: int
    total_wins: int
    total_losses: int
    win_rate: float
    max_drawdown: float
    best_month: str | None
    best_month_pnl: float | None
    sharpe_like: float | None
    accuracy: float
    stop_reason: str


@dataclasses.dataclass(frozen=True)
class ChartPoint:
    date: dt.date
    value: float


@dataclasses.dataclass(frozen=True)
class BacktestCharts:
    capital_curve: Sequence[ChartPoint]
    accuracy_curve: Sequence[ChartPoint]
    profit_curve: Sequence[ChartPoint]


@dataclasses.dataclass(frozen=True)
class BacktestResult:
    config: dict[str, object]
    summary: BacktestSummary
    timeline: Sequence[TimelineEntry]
    charts: BacktestCharts
    logs: dict[str, object]

    def to_dict(self) -> dict[str, object]:
        timeline_payload: list[dict[str, object]] = []
        for entry in self.timeline:
            hits_set = set(entry.hits)
            timeline_payload.append(
                {
                    "date": entry.date,
                    "capital_start": entry.capital_start,
                    "capital_end": entry.capital_end,
                    "stake_total": entry.stake_total,
                    "pnl": entry.pnl,
                    "bets": [
                        {
                            "number": bet.number,
                            "stake": bet.stake,
                            "hit": bet.hit,
                            "payout": bet.payout,
                            "rank": bet.rank,
                            "probability": bet.probability,
                        }
                        for bet in entry.bets
                    ],
                    "predictions": [
                        {
                            "rank": prediction.rank,
                            "number": prediction.number,
                            "probability": prediction.probability,
                            "hit": prediction.number in hits_set,
                        }
                        for prediction in entry.predictions
                    ],
                    "hits": list(entry.hits),
                    "drawdown": entry.drawdown,
                    "daily_return": entry.daily_return,
                    "capital_halted": entry.capital_halted,
                }
            )

        return {
            "config": self.config,
            "summary": {
                "final_balance": self.summary.final_balance,
                "total_bets": self.summary.total_bets,
                "total_wins": self.summary.total_wins,
                "total_losses": self.summary.total_losses,
                "win_rate": self.summary.win_rate,
                "max_drawdown": self.summary.max_drawdown,
                "best_month": self.summary.best_month,
                "best_month_pnl": self.summary.best_month_pnl,
                "sharpe_like": self.summary.sharpe_like,
                "accuracy": self.summary.accuracy,
                "stop_reason": self.summary.stop_reason,
            },
            "timeline": timeline_payload,
            "charts": {
                "capital_curve": [
                    {"date": point.date, "value": point.value}
                    for point in self.charts.capital_curve
                ],
                "accuracy_curve": [
                    {"date": point.date, "value": point.value}
                    for point in self.charts.accuracy_curve
                ],
                "profit_curve": [
                    {"date": point.date, "value": point.value}
                    for point in self.charts.profit_curve
                ],
            },
            "logs": self.logs,
        }


StrategyCallable = Callable[[StrategyContext], Iterable[BetDecision]]
