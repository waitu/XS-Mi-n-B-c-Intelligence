from __future__ import annotations

import datetime as dt
import math
import statistics
from collections import defaultdict
from typing import Iterable, Sequence

from sqlmodel import select

from ..analytics import predict_numbers
from ..database import get_session
from ..models import Draw, Prize
from .. import crud
from .strategies import STRATEGY_RISK_LEVELS, get_strategy_callable
from .types import (
    BacktestConfig,
    BacktestResult,
    BacktestSummary,
    BetDecision,
    ChartPoint,
    HistorySnapshot,
    PayoutRules,
    Prediction,
    RiskLimits,
    StrategyContext,
    TimelineBet,
    TimelineEntry,
    BacktestCharts,
)


def _normalize_model_key(model: str) -> str:
    aliases = {
        "rf": "randomforest",
        "random_forest": "randomforest",
        "randomforest": "randomforest",
        "markov": "markov",
        "frequency": "frequency",
        "trend": "trend",
        "montecarlo": "montecarlo",
        "monte_carlo": "montecarlo",
        "lstm": "lstm",
    }
    key = model.lower().strip()
    if key not in aliases:
        raise ValueError(f"Thuật toán không được hỗ trợ: {model}")
    return aliases[key]


def _normalize_number(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def _fetch_draws(date_start: dt.date, date_end: dt.date, region: str | None) -> Sequence[Draw]:
    with get_session() as session:
        statement = (
            select(Draw)
            .where(Draw.draw_date >= date_start)
            .where(Draw.draw_date <= date_end)
            .order_by(Draw.draw_date.asc())
        )
        if region:
            statement = statement.where(Draw.region == region)
        draws = session.exec(statement).all()
    return draws


def _collect_predictions(
    *,
    draw_date: dt.date,
    config: BacktestConfig,
    algorithm_key: str,
) -> Sequence[Prediction]:
    as_of_date = draw_date - dt.timedelta(days=1)
    payload = predict_numbers(
        algorithm=algorithm_key,
        top_k=config.top_k,
        digits=config.digits,
        lookback_draws=config.lookback_draws,
        advanced=False,
        seed=config.seed,
        as_of_date=as_of_date,
    )
    items = payload.get("results", [])
    predictions: list[Prediction] = []
    for item in items:
        number = str(item.get("number", "")).strip()
        if not number:
            continue
        probability = item.get("probability")
        if probability is not None:
            probability = float(probability)
        rank = int(item.get("rank", len(predictions) + 1))
        predictions.append(Prediction(number=number, probability=probability, rank=rank))
    return predictions


def _list_prizes(draw: Draw) -> Sequence[Prize]:
    return crud.list_prizes_for_draw(draw.id)  # type: ignore[arg-type]


def _enforce_risk_limits(
    capital: float,
    bets: Iterable[BetDecision],
    risk_limits: RiskLimits,
) -> list[BetDecision]:
    filtered: list[BetDecision] = []
    single_cap = risk_limits.clamp_single(capital)
    for bet in bets:
        if bet.stake <= 0:
            continue
        stake = min(float(bet.stake), single_cap)
        if stake <= 0:
            continue
        filtered.append(BetDecision(number=bet.number, stake=stake))
    if not filtered:
        return []
    total_stake = sum(bet.stake for bet in filtered)
    max_daily = min(risk_limits.clamp_daily(capital), capital)
    if max_daily <= 0:
        return []
    if total_stake <= max_daily:
        return filtered
    scale = max_daily / total_stake if total_stake else 0.0
    return [BetDecision(number=bet.number, stake=bet.stake * scale) for bet in filtered]


def _compute_sharpe(daily_returns: Sequence[float]) -> float | None:
    samples = [value for value in daily_returns if math.isfinite(value)]
    if len(samples) < 2:
        return None
    avg = statistics.mean(samples)
    stdev = statistics.pstdev(samples)
    if stdev == 0:
        return None
    return avg / stdev * math.sqrt(365)


def run_backtest(config: BacktestConfig) -> BacktestResult:
    if config.capital <= 0:
        raise ValueError("Vốn khởi điểm phải lớn hơn 0")
    if config.date_start > config.date_end:
        raise ValueError("date_start phải nhỏ hơn hoặc bằng date_end")
    if config.top_k <= 0:
        raise ValueError("top_k phải lớn hơn 0")
    algorithm_key = _normalize_model_key(config.model)

    draws = _fetch_draws(config.date_start, config.date_end, config.region)
    if not draws:
        raise ValueError("Không có kỳ quay nào trong khoảng thời gian đã chọn")

    strategy_callable = get_strategy_callable(config.strategy)

    capital = float(config.capital)
    peak_capital = capital
    cumulative_pnl = 0.0
    timeline: list[TimelineEntry] = []
    history: list[HistorySnapshot] = []
    hits_draws = 0
    daily_returns: list[float] = []
    total_bets = 0
    total_wins = 0
    cumulative_accuracy_curve: list[ChartPoint] = []
    capital_curve: list[ChartPoint] = []
    profit_curve: list[ChartPoint] = []
    month_pnl: defaultdict[str, float] = defaultdict(float)

    stop_reason = "completed"

    for day_index, draw in enumerate(draws):
        capital_start = capital
        if capital_start <= 0:
            stop_reason = "capital_depleted"
            break

        predictions = _collect_predictions(draw_date=draw.draw_date, config=config, algorithm_key=algorithm_key)
        context = StrategyContext(
            date=draw.draw_date,
            day_index=day_index,
            capital=capital_start,
            predictions=predictions,
            history=list(history[-30:]),
            config=config.strategy.options,
            risk_limits=config.risk_limits,
        )
        try:
            raw_bets = list(strategy_callable(context))
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Chiến lược gặp lỗi tại ngày {draw.draw_date}: {exc}") from exc

        bets = _enforce_risk_limits(capital_start, raw_bets, config.risk_limits)
        if not bets:
            timeline.append(
                TimelineEntry(
                    date=draw.draw_date,
                    capital_start=capital_start,
                    capital_end=capital_start,
                    stake_total=0.0,
                    pnl=0.0,
                    bets=[],
                    predictions=predictions,
                    hits=[],
                    drawdown=peak_capital - capital_start,
                    daily_return=0.0,
                    capital_halted=False,
                )
            )
            capital_curve.append(ChartPoint(date=draw.draw_date, value=capital_start))
            cumulative_accuracy_curve.append(ChartPoint(date=draw.draw_date, value=hits_draws / (day_index + 1)))
            profit_curve.append(ChartPoint(date=draw.draw_date, value=cumulative_pnl))
            history.append(HistorySnapshot(date=draw.draw_date, capital_end=capital_start, pnl=0.0, hit=False))
            continue

        total_bets += len(bets)

        prizes = _list_prizes(draw)
        actual_suffixes = set()
        actual_hits: list[str] = []
        for prize in prizes:
            if prize.prize_name.lower() != "đặc biệt":
                continue
            normalized = _normalize_number(prize.number)
            if len(normalized) < config.digits:
                continue
            suffix = normalized[-config.digits :]
            actual_suffixes.add(suffix)
            actual_hits.append(suffix)

        pnl = 0.0
        bet_entries: list[TimelineBet] = []
        hit_any = False
        for bet in bets:
            hit = bet.number in actual_suffixes
            if hit:
                total_wins += 1
                hit_any = True
                payout = bet.stake * config.payout_rules.jackpot_multiplier
            else:
                payout = bet.stake * config.payout_rules.loss_multiplier
            pnl += payout
            probability = None
            rank = None
            for prediction in predictions:
                if prediction.number == bet.number:
                    probability = prediction.probability
                    rank = prediction.rank
                    break
            bet_entries.append(
                TimelineBet(
                    number=bet.number,
                    stake=bet.stake,
                    hit=hit,
                    payout=payout,
                    probability=probability,
                    rank=rank,
                )
            )

        total_losses = total_bets - total_wins

        capital_end = capital_start + pnl
        cumulative_pnl += pnl
        peak_capital = max(peak_capital, capital_end)
        drawdown = peak_capital - capital_end
        daily_return = pnl / capital_start if capital_start > 0 else 0.0
        daily_returns.append(daily_return)

        if hit_any:
            hits_draws += 1

        month_key = draw.draw_date.strftime("%Y-%m")
        month_pnl[month_key] += pnl

        capital_curve.append(ChartPoint(date=draw.draw_date, value=capital_end))
        cumulative_accuracy_curve.append(
            ChartPoint(date=draw.draw_date, value=hits_draws / (day_index + 1))
        )
        profit_curve.append(ChartPoint(date=draw.draw_date, value=cumulative_pnl))

        timeline.append(
            TimelineEntry(
                date=draw.draw_date,
                capital_start=capital_start,
                capital_end=capital_end,
                stake_total=sum(bet.stake for bet in bets),
                pnl=pnl,
                bets=bet_entries,
                predictions=predictions,
                hits=actual_hits,
                drawdown=drawdown,
                daily_return=daily_return,
                capital_halted=capital_end <= 0,
            )
        )

        history.append(HistorySnapshot(date=draw.draw_date, capital_end=capital_end, pnl=pnl, hit=hit_any))
        capital = capital_end

        if capital <= 0:
            stop_reason = "capital_depleted"
            break

    if not timeline:
        raise ValueError("Không có dữ liệu giao dịch sau khi áp dụng chiến lược")

    final_balance = timeline[-1].capital_end
    total_losses = total_bets - total_wins
    win_rate = total_wins / total_bets if total_bets else 0.0
    accuracy = hits_draws / len(timeline)
    best_month, best_month_value = None, None
    if month_pnl:
        best_month, best_month_value = max(month_pnl.items(), key=lambda item: item[1])
    sharpe_like = _compute_sharpe(daily_returns)

    summary = BacktestSummary(
        final_balance=final_balance,
        total_bets=total_bets,
        total_wins=total_wins,
        total_losses=total_losses,
        win_rate=win_rate,
        max_drawdown=max(entry.drawdown for entry in timeline),
        best_month=best_month,
        best_month_pnl=best_month_value,
        sharpe_like=sharpe_like,
        accuracy=accuracy,
        stop_reason=stop_reason,
    )

    charts = BacktestCharts(
        capital_curve=capital_curve,
        accuracy_curve=cumulative_accuracy_curve,
        profit_curve=profit_curve,
    )

    logs = {
        "trades": [
            {
                "date": entry.date.isoformat(),
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
                "hits": entry.hits,
                "drawdown": entry.drawdown,
                "daily_return": entry.daily_return,
                "capital_halted": entry.capital_halted,
            }
            for entry in timeline
        ],
        "statistics": {
            "daily_returns": daily_returns,
            "cumulative_pnl": cumulative_pnl,
        },
    }

    config_payload = {
        "capital": config.capital,
        "date_start": config.date_start.isoformat(),
        "date_end": config.date_end.isoformat(),
        "region": config.region,
        "model": algorithm_key,
        "top_k": config.top_k,
        "digits": config.digits,
        "strategy": {
            "type": config.strategy.type,
            "options": config.strategy.options,
            "plugin_id": config.strategy.plugin_id,
            "risk_level": STRATEGY_RISK_LEVELS.get(config.strategy.type, "Không xác định"),
        },
        "payout_rules": {
            "jackpot_multiplier": config.payout_rules.jackpot_multiplier,
            "loss_multiplier": config.payout_rules.loss_multiplier,
        },
        "risk_limits": {
            "max_daily_stake_ratio": config.risk_limits.max_daily_stake_ratio,
            "max_single_stake_ratio": config.risk_limits.max_single_stake_ratio,
        },
        "lookback_draws": config.lookback_draws,
        "seed": config.seed,
    }

    return BacktestResult(
        config=config_payload,
        summary=summary,
        timeline=timeline,
        charts=charts,
        logs=logs,
    )
