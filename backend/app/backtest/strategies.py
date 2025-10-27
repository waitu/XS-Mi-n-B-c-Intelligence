from __future__ import annotations

import math
from typing import Iterable

from .plugins import load_plugin_strategy
from .types import BetDecision, Prediction, StrategyCallable, StrategyConfig, StrategyContext


STRATEGY_RISK_LEVELS: dict[str, str] = {
    "fixed": "Thấp",
    "percentage": "Trung bình",
    "kelly": "Trung bình+",
    "martingale": "Cao",
    "probability_weighted": "Trung bình",
    "plugin": "Tùy thuộc",
}


def _ensure_positive(predictions: Iterable[Prediction]) -> list[Prediction]:
    return [prediction for prediction in predictions if prediction.number]


def strategy_fixed(context: StrategyContext) -> Iterable[BetDecision]:
    amount = float(context.config.get("amount", 10000))
    count = int(context.config.get("count") or len(context.predictions))
    if count <= 0:
        count = len(context.predictions)
    picks = _ensure_positive(context.predictions)[:count]
    for prediction in picks:
        stake = min(amount, context.risk_limits.clamp_single(context.capital))
        if stake <= 0:
            continue
        yield BetDecision(number=prediction.number, stake=stake)


def strategy_percentage(context: StrategyContext) -> Iterable[BetDecision]:
    percent = float(context.config.get("percent", 0.02))
    percent = max(min(percent, 1.0), 0.0)
    picks = _ensure_positive(context.predictions)
    if not picks:
        return
    total_budget = context.capital * percent
    per_pick = total_budget / len(picks)
    single_cap = context.risk_limits.clamp_single(context.capital)
    for prediction in picks:
        stake = min(per_pick, single_cap)
        if stake <= 0:
            continue
        yield BetDecision(number=prediction.number, stake=stake)


def strategy_kelly(context: StrategyContext) -> Iterable[BetDecision]:
    multiplier = float(context.config.get("jackpot_multiplier", 70.0))
    cap_ratio = float(context.config.get("max_ratio", 0.10))
    cap_ratio = max(min(cap_ratio, 0.20), 0.0)
    single_cap = context.risk_limits.clamp_single(context.capital)
    for prediction in _ensure_positive(context.predictions):
        p = max(min(prediction.probability or 0.0, 1.0), 0.0)
        if p <= 0:
            continue
        edge = p * multiplier - (1 - p)
        denom = multiplier
        if denom <= 0:
            continue
        fraction = edge / denom
        fraction = max(min(fraction, cap_ratio), 0.0)
        stake = min(context.capital * fraction, single_cap)
        if stake <= 0:
            continue
        yield BetDecision(number=prediction.number, stake=stake)


def strategy_martingale(context: StrategyContext) -> Iterable[BetDecision]:
    base = float(context.config.get("base", 10000))
    streak = 0
    for snapshot in reversed(context.history):
        if snapshot.hit:
            break
        streak += 1
    multiplier = float(context.config.get("multiplier", 2.0))
    stake = base * (multiplier ** streak)
    stake = min(stake, context.risk_limits.clamp_single(context.capital))
    picks = _ensure_positive(context.predictions)
    if not picks:
        return
    per_pick = stake / len(picks)
    for prediction in picks:
        if per_pick <= 0:
            continue
        yield BetDecision(number=prediction.number, stake=per_pick)


def strategy_probability_weighted(context: StrategyContext) -> Iterable[BetDecision]:
    picks = [prediction for prediction in _ensure_positive(context.predictions) if prediction.probability]
    total_prob = sum(prediction.probability or 0.0 for prediction in picks)
    if total_prob <= 0:
        return
    daily_budget_ratio = float(context.config.get("budget_ratio", 0.10))
    budget = context.capital * max(min(daily_budget_ratio, 0.5), 0.0)
    single_cap = context.risk_limits.clamp_single(context.capital)
    for prediction in picks:
        weight = (prediction.probability or 0.0) / total_prob
        stake = min(budget * weight, single_cap)
        if stake <= 0:
            continue
        yield BetDecision(number=prediction.number, stake=stake)


STRATEGY_REGISTRY: dict[str, StrategyCallable] = {
    "fixed": strategy_fixed,
    "percentage": strategy_percentage,
    "kelly": strategy_kelly,
    "martingale": strategy_martingale,
    "probability_weighted": strategy_probability_weighted,
}


def get_strategy_callable(config: StrategyConfig) -> StrategyCallable:
    strategy_type = config.type.lower()
    if strategy_type == "plugin":
        if not config.plugin_id:
            raise ValueError("plugin_id is required for custom plugin strategies")
        return load_plugin_strategy(config.plugin_id)
    if strategy_type not in STRATEGY_REGISTRY:
        raise ValueError(f"Không tìm thấy chiến lược: {config.type}")
    return STRATEGY_REGISTRY[strategy_type]
