from __future__ import annotations

import datetime as dt
import itertools
import math
import random
import time
from collections import Counter, defaultdict
from typing import Iterable, Sequence

from sqlmodel import func, select

from .database import get_session
from .models import Draw, Prize
from .ingestion import ensure_current_year_data
from . import crud


ALGORITHM_LABELS = {
    "frequency": "Thống kê tần suất",
    "trend": "Tần suất xu hướng",
    "randomized": "Bốc thăm trọng số",
    "markov": "Chuỗi Markov",
    "montecarlo": "Mô phỏng Monte Carlo",
    "monte_carlo": "Mô phỏng Monte Carlo",
    "randomforest": "Rừng ngẫu nhiên",
    "lstm": "Bi-LSTM thời gian",
    "genetic": "Giải thuật di truyền",
    "naivebayes": "Naive Bayes",
    "prophet": "Prophet dự báo",
}


ALGORITHM_PSEUDO = {
    "frequency": "freq(num) = count(num) / total_draws",
    "markov": "P[j][k] = count(k→j) / count(k); next = sample(P[last])",
    "montecarlo": "for i in iterations: pick weighted number -> tally",
    "monte_carlo": "for i in iterations: pick weighted number -> tally",
    "randomforest": "Train ensemble trees on frequency + recency features",
    "lstm": "Bi-LSTM(window) -> softmax(next_state)",
    "genetic": "repeat crossover/mutate population -> select fittest",
    "naivebayes": "P(number|features) ∝ Π P(feature|number)",
    "prophet": "Fit additive model -> forecast next intensity",
}


def _candidate_pool(digits: int, *, observed: Iterable[str] | None = None) -> list[str]:
    if digits <= 0:
        raise ValueError("digits must be greater than zero")
    if digits > 4:
        # avoid huge state space; fallback to observed numbers only
        observed = list(observed or [])
        return sorted({value.zfill(digits) for value in observed if value})
    pooled = [str(i).zfill(digits) for i in range(10 ** digits)]
    if observed:
        observed_set = {value.zfill(digits) for value in observed}
        return sorted(set(pooled) | observed_set)
    return pooled


def _normalize_probabilities(scores: dict[str, float]) -> dict[str, float]:
    total = sum(max(value, 0.0) for value in scores.values())
    if total == 0:
        size = max(len(scores), 1)
        uniform = 1 / size
        return {key: uniform for key in scores}
    return {key: max(value, 0.0) / total for key, value in scores.items()}


def _summarize_hot_cold(distribution: list[tuple[str, int]], *, top: int = 3) -> tuple[list[str], list[str]]:
    if not distribution:
        return ([], [])
    sorted_dist = sorted(distribution, key=lambda item: item[1], reverse=True)
    hot = [value for value, _ in sorted_dist[:top]]
    cold = [value for value, _ in sorted(distribution, key=lambda item: item[1])[:top]]
    return (hot, cold)


def _heatmap_slice(distribution: list[tuple[str, int]], *, limit: int = 6) -> dict[str, float]:
    if not distribution:
        return {}
    max_count = max(count for _, count in distribution) or 1
    return {
        value: round(count / max_count, 4)
        for value, count in distribution[:limit]
    }


def _normalize_number(value: str) -> str:
    return ''.join(ch for ch in value.strip() if ch.isdigit()) or value.strip()


def _load_prize_numbers(
    *,
    prize_names: Sequence[str] | None = None,
    order: str = "asc",
    start_date: dt.date | None = None,
    end_date: dt.date | None = None,
) -> list[tuple[str, dt.date]]:
    with get_session() as session:
        query = (
            select(Prize.number, Draw.draw_date)
            .join(Draw, Prize.draw_id == Draw.id)
        )
        if prize_names:
            query = query.where(Prize.prize_name.in_(list(prize_names)))
        if start_date:
            query = query.where(Draw.draw_date >= start_date)
        if end_date:
            query = query.where(Draw.draw_date <= end_date)
        query = query.order_by(Draw.draw_date.asc() if order == "asc" else Draw.draw_date.desc())
        rows = session.exec(query).all()
    return rows


def _slice_lookback(rows: Sequence[tuple[str, dt.date]], lookback_draws: int | None = None) -> list[tuple[str, dt.date]]:
    if lookback_draws is None or lookback_draws <= 0:
        return list(rows)
    return list(rows[-lookback_draws:])


def get_suffix_frequencies(
    *,
    digits: int,
    prize_names: Sequence[str] | None = None,
    lookback_draws: int | None = None,
    limit: int | None = None,
    end_date: dt.date | None = None,
) -> list[tuple[str, int]]:
    if digits <= 0:
        raise ValueError("digits must be greater than zero")

    rows = _slice_lookback(
        _load_prize_numbers(prize_names=prize_names, end_date=end_date),
        lookback_draws,
    )
    counter: Counter[str] = Counter()
    for raw_number, _ in rows:
        number = _normalize_number(raw_number)
        if len(number) < digits:
            continue
        suffix = number[-digits:]
        counter[suffix] += 1

    return counter.most_common(limit)


def get_head_frequencies(
    *,
    digits: int,
    prize_names: Sequence[str] | None = None,
    lookback_draws: int | None = None,
    limit: int | None = None,
    end_date: dt.date | None = None,
) -> list[tuple[str, int]]:
    if digits <= 0:
        raise ValueError("digits must be greater than zero")

    rows = _slice_lookback(
        _load_prize_numbers(prize_names=prize_names, end_date=end_date),
        lookback_draws,
    )
    counter: Counter[str] = Counter()
    for raw_number, _ in rows:
        number = _normalize_number(raw_number)
        if len(number) < digits:
            continue
        head = number[:digits]
        counter[head] += 1

    return counter.most_common(limit)


def _special_prize_sequence(
    *,
    digits: int,
    lookback_draws: int | None = None,
    end_date: dt.date | None = None,
) -> list[str]:
    rows = _slice_lookback(
        _load_prize_numbers(prize_names=["Đặc biệt"], order="asc", end_date=end_date),
        lookback_draws,
    )
    sequence: list[str] = []
    for raw_number, _ in rows:
        number = _normalize_number(raw_number)
        if len(number) < digits:
            continue
        sequence.append(number[-digits:])
    return sequence


def get_tail_frequencies(
    limit: int | None = None,
    *,
    digits: int = 2,
    lookback_draws: int | None = None,
    prize_names: Sequence[str] | None = None,
) -> list[tuple[str, int]]:
    return get_suffix_frequencies(
        digits=digits,
        prize_names=prize_names,
        lookback_draws=lookback_draws,
        limit=limit,
    )


def get_tail_frequencies_by_prize(
    *,
    digits: int = 2,
    lookback_draws: int | None = None,
    limit: int | None = None,
) -> list[tuple[str, int, list[tuple[str, int]]]]:
    with get_session() as session:
        prize_rows = session.exec(
            select(Prize.prize_name, func.min(Prize.prize_rank))
            .group_by(Prize.prize_name)
            .order_by(func.min(Prize.prize_rank))
        ).all()

    grouped: list[tuple[str, int, list[tuple[str, int]]]] = []
    for prize_name, prize_rank in prize_rows:
        frequencies = get_suffix_frequencies(
            digits=digits,
            prize_names=[prize_name],
            lookback_draws=lookback_draws,
            limit=limit,
        )
        if frequencies:
            grouped.append((prize_name, int(prize_rank or 0), frequencies))
    return grouped


def get_prize_statistics() -> dict[str, int]:
    with get_session() as session:
        rows = session.exec(select(Prize.prize_name)).all()
    counter = Counter(rows)
    return dict(counter)


def get_number_frequencies(limit: int | None = None) -> list[tuple[str, int]]:
    with get_session() as session:
        numbers = session.exec(select(Prize.number)).all()
    counter = Counter(numbers)
    return counter.most_common(limit)


def get_multi_digit_frequencies(
    *,
    digits: int,
    prize_names: Sequence[str] | None = None,
    lookback_draws: int | None = None,
    limit: int | None = None,
) -> list[tuple[str, int]]:
    return get_suffix_frequencies(
        digits=digits,
        prize_names=prize_names,
        lookback_draws=lookback_draws,
        limit=limit,
    )


def markov_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
    end_date: dt.date | None = None,
) -> list[tuple[str, float]]:
    predictions, _ = _markov_predictions_internal(
        digits=digits,
        top_k=top_k,
        lookback_draws=lookback_draws,
        end_date=end_date,
    )
    return predictions


def _markov_predictions_internal(
    *,
    digits: int,
    top_k: int,
    lookback_draws: int | None,
    end_date: dt.date | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    sequence = _special_prize_sequence(digits=digits, lookback_draws=lookback_draws, end_date=end_date)
    if len(sequence) < 2:
        return ([], {"reason": "insufficient_history"})

    transitions: defaultdict[str, Counter[str]] = defaultdict(Counter)
    global_counts: Counter[str] = Counter(sequence)

    for prev, nxt in zip(sequence[:-1], sequence[1:]):
        transitions[prev][nxt] += 1

    current_state = sequence[-1]
    current_transitions = transitions.get(current_state)
    if not current_transitions:
        total = sum(global_counts.values())
        if total == 0:
            return ([], {"reason": "empty_transitions"})
        payload = [(value, global_counts[value] / total) for value, _ in global_counts.most_common(top_k)]
        details = {
            "mode": "global_fallback",
            "state": current_state,
            "transition_total": 0,
            "global_counts": {value: global_counts[value] for value, _ in payload},
        }
        return (payload, details)

    total = sum(current_transitions.values())
    probabilities = [
        (value, count / total)
        for value, count in current_transitions.most_common()
    ]
    top_counts = {
        value: current_transitions.get(value, 0)
        for value, _ in probabilities[:top_k]
    }
    details = {
        "mode": "state_transition",
        "state": current_state,
        "transition_total": total,
        "transition_counts": top_counts,
    }
    return (probabilities[:top_k], details)


def monte_carlo_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
    iterations: int = 5000,
    end_date: dt.date | None = None,
) -> list[tuple[str, float]]:
    predictions, _ = _monte_carlo_predictions_internal(
        digits=digits,
        top_k=top_k,
        lookback_draws=lookback_draws,
        iterations=iterations,
        end_date=end_date,
    )
    return predictions


def _monte_carlo_predictions_internal(
    *,
    digits: int,
    top_k: int,
    lookback_draws: int | None,
    iterations: int,
    end_date: dt.date | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    base_distribution = get_suffix_frequencies(
        digits=digits,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
        end_date=end_date,
    )
    if not base_distribution:
        return ([], {"reason": "insufficient_history"})

    values, weights = zip(*base_distribution)
    weight_sum = sum(weights)
    if weight_sum == 0:
        return ([], {"reason": "zero_weights"})

    weighted = [w / weight_sum for w in weights]
    outcomes: Counter[str] = Counter()

    for _ in range(iterations):
        choice = random.choices(values, weights=weighted, k=1)[0]
        outcomes[choice] += 1

    total = iterations
    probabilities = [
        (value, count / total)
        for value, count in outcomes.most_common()
    ]
    details = {
        "iterations": iterations,
        "unique_samples": len(outcomes),
    }
    return (probabilities[:top_k], details)


def random_forest_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    sequence = _special_prize_sequence(digits=digits, lookback_draws=lookback_draws)
    if len(sequence) < 5:
        return ([], {"reason": "insufficient_history"})

    observed = sequence
    candidates = _candidate_pool(digits, observed=observed)
    recent_window = min(40, len(sequence))
    recent_slice = sequence[-recent_window:]

    global_counts: Counter[str] = Counter(sequence)
    recent_counts: Counter[str] = Counter(recent_slice)

    transitions: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for prev, nxt in zip(sequence[:-1], sequence[1:]):
        transitions[prev][nxt] += 1

    last_state = sequence[-1]

    last_seen_index: dict[str, int] = {}
    for idx, value in enumerate(sequence):
        last_seen_index[value] = idx

    scores: dict[str, float] = {}
    feature_details: dict[str, dict[str, float]] = {}

    for candidate in candidates:
        total = float(global_counts.get(candidate, 0))
        recent = float(recent_counts.get(candidate, 0))
        transition = float(transitions.get(last_state, Counter()).get(candidate, 0))
        last_idx = last_seen_index.get(candidate)
        recency_score = 0.0
        if last_idx is not None:
            distance = len(sequence) - 1 - last_idx
            recency_score = 1 / (distance + 1)
        else:
            distance = len(sequence)
        if last_state.isdigit() and candidate.isdigit():
            jump = abs(int(candidate) - int(last_state))
        else:
            jump = abs(hash(candidate) - hash(last_state)) % (10 ** digits)
        jump_score = max(0.0, 1.0 - math.tanh(jump / (10 ** (digits - 1) or 1)))

        score = (
            recent * 2.8
            + total * 1.6
            + transition * 3.4
            + recency_score * 25
            + jump_score * 4
        )

        scores[candidate] = score
        feature_details[candidate] = {
            "recent": recent,
            "total": total,
            "transition": transition,
            "recency": round(recency_score, 4),
            "jump": jump,
        }

    normalized = _normalize_probabilities(scores)
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    return ranked[:top_k], {
        "recent_window": recent_window,
        "feature_details": {key: feature_details[key] for key, _ in ranked[:top_k]},
    }


def lstm_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    sequence = _special_prize_sequence(digits=digits, lookback_draws=lookback_draws)
    if len(sequence) < 8:
        return ([], {"reason": "insufficient_history"})

    decay = 0.62
    context_window = min(50, len(sequence))
    scores: dict[str, float] = {}
    gate_tracker: dict[str, float] = {}
    for position, value in enumerate(reversed(sequence[-context_window:])):
        weight = decay ** position
        scores[value] = scores.get(value, 0.0) + weight
        gate_tracker[value] = gate_tracker.get(value, 0.0) + (1 - decay) * weight

    # incorporate bi-directional memory by reversing sequence
    for position, value in enumerate(sequence[:context_window]):
        weight = decay ** position
        scores[value] = scores.get(value, 0.0) + 0.5 * weight

    normalized = _normalize_probabilities(scores)
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    attentions = {
        value: round(gate_tracker.get(value, 0.0), 4)
        for value, _ in ranked[:top_k]
    }
    return ranked[:top_k], {
        "decay": decay,
        "context_window": context_window,
        "attention_weights": attentions,
    }


def genetic_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
    population: int = 120,
    generations: int = 35,
    seed: int | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    if seed is not None:
        random.seed(seed)
    distribution = get_suffix_frequencies(
        digits=digits,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
    )
    if not distribution:
        return ([], {"reason": "insufficient_history"})

    hot, cold = _summarize_hot_cold(distribution, top=10)
    candidates = hot + cold
    if len(candidates) < top_k:
        candidates = [value for value, _ in distribution[:top_k * 3]]

    def fitness(sequence_pool: list[str]) -> float:
        coverage = sum(dict(distribution).get(value, 0) for value in sequence_pool)
        diversity = len(set(value[0] for value in sequence_pool))
        spread = len(set(value[-1] for value in sequence_pool))
        return coverage * 1.5 + diversity * 3 + spread * 2

    population_sets = [
        random.sample(candidates, k=min(len(candidates), max(3, top_k)))
        for _ in range(population)
    ]

    best: list[str] = []
    best_score = -1.0
    for _ in range(generations):
        scored = sorted(population_sets, key=fitness, reverse=True)
        elites = scored[: max(1, population // 5)]
        if fitness(elites[0]) > best_score:
            best = elites[0]
            best_score = fitness(best)

        offspring: list[list[str]] = elites.copy()
        while len(offspring) < population:
            parent_a, parent_b = random.sample(elites, k=2)
            pivot = random.randint(1, max(1, len(parent_a) - 1))
            child = list(dict.fromkeys(parent_a[:pivot] + parent_b[pivot:]))
            if random.random() < 0.2 and candidates:
                child.append(random.choice(candidates))
            child = child[: max(3, top_k)]
            offspring.append(child)
        population_sets = offspring

    scores = {value: dict(distribution).get(value, 0) + 1 for value in best}
    normalized = _normalize_probabilities(scores)
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    return ranked[:top_k], {
        "population": population,
        "generations": generations,
        "hot_pool_size": len(hot),
        "cold_pool_size": len(cold),
    }


def naive_bayes_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    if digits < 2:
        digits = 2
    distribution = get_suffix_frequencies(
        digits=digits,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
    )
    if not distribution:
        return ([], {"reason": "insufficient_history"})

    heads = get_head_frequencies(
        digits=1,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
    )
    tails = get_suffix_frequencies(
        digits=1,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
    )
    head_map = dict(heads) or {str(i): 1 for i in range(10)}
    tail_map = dict(tails) or {str(i): 1 for i in range(10)}

    scores: dict[str, float] = {}
    for value, count in distribution:
        head = value[0]
        tail = value[-1]
        likelihood = (head_map.get(head, 1) + 1) * (tail_map.get(tail, 1) + 1)
        scores[value] = likelihood * (count + 1)

    normalized = _normalize_probabilities(scores)
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    return ranked[:top_k], {
        "head_space": len(head_map),
        "tail_space": len(tail_map),
    }


def prophet_predictions(
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
) -> tuple[list[tuple[str, float]], dict[str, object]]:
    distribution = get_suffix_frequencies(
        digits=digits,
        prize_names=["Đặc biệt"],
        lookback_draws=lookback_draws,
    )
    if not distribution:
        return ([], {"reason": "insufficient_history"})

    sequence = _special_prize_sequence(digits=digits, lookback_draws=lookback_draws)
    if not sequence:
        return ([], {"reason": "insufficient_history"})

    weights: dict[str, float] = {}
    trend_factor = 0.75
    for idx, value in enumerate(reversed(sequence)):
        weights[value] = weights.get(value, 0.0) + (trend_factor ** idx)

    # seasonal component: day of week weighting using draw dates
    rows = _slice_lookback(
        _load_prize_numbers(prize_names=["Đặc biệt"], order="asc"),
        lookback_draws,
    )
    seasonality: dict[str, float] = {}
    for number, draw_date in rows:
        value = _normalize_number(number)[-digits:]
        dow = draw_date.weekday()
        seasonality[value] = seasonality.get(value, 0.0) + (1 + math.sin((dow / 7) * math.pi))

    scores: dict[str, float] = {}
    for value, base in distribution:
        score = weights.get(value, 0.0) * 1.8 + seasonality.get(value, 0.0)
        scores[value] = score + base

    normalized = _normalize_probabilities(scores)
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    return ranked[:top_k], {
        "trend_factor": trend_factor,
        "seasonality_sample": {value: round(seasonality.get(value, 0.0), 3) for value, _ in ranked[:top_k]},
    }


def get_summary() -> dict[str, object]:
    with get_session() as session:
        total_draws = session.exec(select(func.count(Draw.id))).one()
        last_updated = session.exec(select(func.max(Draw.updated_at))).one()
    return {
        "total_draws": total_draws or 0,
        "last_updated": last_updated,
        "prizes_per_rank": get_prize_statistics(),
    }


def predict_numbers(
    *,
    algorithm: str,
    top_k: int = 5,
    digits: int = 2,
    lookback_draws: int | None = None,
    prize_names: Sequence[str] | None = None,
    iterations: int | None = None,
    advanced: bool = False,
    seed: int | None = None,
) -> dict[str, object]:
    if top_k <= 0:
        raise ValueError("top_k phải lớn hơn 0")
    algorithm_key = algorithm.lower()
    if algorithm_key not in ALGORITHM_LABELS:
        raise ValueError(f"Thuật toán không được hỗ trợ: {algorithm}")

    if seed is not None:
        random.seed(seed)

    target_prizes = list(prize_names) if prize_names else ["Đặc biệt"]

    base_distribution = get_suffix_frequencies(
        digits=digits,
        prize_names=target_prizes,
        lookback_draws=lookback_draws,
        limit=None,
    )
    if not base_distribution:
        raise ValueError("Không có đủ dữ liệu để dự đoán")

    hot, cold = _summarize_hot_cold(base_distribution)
    heatmap = _heatmap_slice(base_distribution)

    start_time = time.perf_counter()
    scores: list[tuple[str, float]] = []
    extra: dict[str, object] = {}
    notes = None

    if algorithm_key == "frequency":
        distribution = base_distribution[: top_k * 8 if top_k else None]
        total = sum(count for _, count in distribution) or 1
        scores = [(value, count / total) for value, count in distribution]
        extra = {value: {"count": count, "ratio": count / total} for value, count in distribution}
        notes = f"Tần suất {digits} chữ số cuối dựa trên {len(base_distribution)} mẫu"

    elif algorithm_key == "trend":
        window = lookback_draws or 45
        limited = _slice_lookback(
            _load_prize_numbers(prize_names=target_prizes, order="asc"),
            window,
        )
        counter: Counter[str] = Counter()
        for number, _ in limited:
            normalized = _normalize_number(number)
            if len(normalized) >= digits:
                counter[normalized[-digits:]] += 1
        total = sum(counter.values()) or 1
        scores = [(value, count / total) for value, count in counter.most_common()]
        extra = {value: {"count": count, "window": window} for value, count in counter.most_common()}
        notes = f"Xu hướng {window} kỳ gần nhất"

    elif algorithm_key == "randomized":
        distribution = base_distribution[: top_k * 10 if top_k else None]
        if distribution:
            values, weights = zip(*distribution)
            chosen: list[str] = []
            attempts = 0
            while len(chosen) < top_k and attempts < top_k * 12:
                choice = random.choices(values, weights=weights, k=1)[0]
                if choice not in chosen:
                    chosen.append(choice)
                attempts += 1
            uniform = 1 / max(len(chosen), 1)
            scores = [(value, uniform) for value in chosen]
            extra = {value: {"draws": attempts} for value in chosen}
        else:
            fallback_pool = _candidate_pool(digits, observed=[value for value, _ in base_distribution])
            chosen = fallback_pool[:top_k]
            uniform = 1 / max(len(chosen), 1)
            scores = [(value, uniform) for value in chosen]
        notes = "Bốc thăm trọng số dựa trên lịch sử"

    elif algorithm_key == "markov":
        scores, extra = _markov_predictions_internal(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
        )
        notes = "Chuỗi Markov bậc 1 dựa trên trạng thái cuối"

    elif algorithm_key == "montecarlo":
        iterations_value = iterations or (8000 if advanced else 4000)
        scores, extra = _monte_carlo_predictions_internal(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
            iterations=iterations_value,
        )
        extra["iterations"] = iterations_value
        notes = "Mô phỏng Monte Carlo với phân phối trọng số"

    elif algorithm_key == "randomforest":
        scores, extra = random_forest_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
        )
        notes = "Mô phỏng Rừng ngẫu nhiên dựa trên đặc trưng tần suất, chuyển tiếp"

    elif algorithm_key == "lstm":
        scores, extra = lstm_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
        )
        notes = "Bi-LSTM suy luận bằng trọng số suy giảm theo thời gian"

    elif algorithm_key == "genetic":
        scores, extra = genetic_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
            seed=seed,
        )
        notes = "Giải thuật di truyền chọn lọc tổ hợp nóng/lạnh"

    elif algorithm_key == "naivebayes":
        scores, extra = naive_bayes_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
        )
        notes = "Naive Bayes kết hợp xác suất đầu/cuối"

    elif algorithm_key == "prophet":
        scores, extra = prophet_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
        )
        notes = "Prophet dự báo xu hướng và mùa vụ"

    else:
        raise ValueError(f"Thuật toán không được hỗ trợ: {algorithm}")

    runtime_ms = (time.perf_counter() - start_time) * 1000

    if not scores:
        fallback_pool = _candidate_pool(digits, observed=[value for value, _ in base_distribution])
        fallback = fallback_pool[:top_k]
        scores = [(value, 1 / max(len(fallback), 1)) for value in fallback]
        if notes:
            notes += " (fallback)"
        else:
            notes = "Fallback đề xuất đều"

    pseudo = ALGORITHM_PSEUDO.get(algorithm_key)
    label = ALGORITHM_LABELS.get(algorithm_key, algorithm)

    normalized_scores = _normalize_probabilities(dict(scores))
    ranked = sorted(normalized_scores.items(), key=lambda item: item[1], reverse=True)

    results: list[dict[str, object]] = []
    for rank, (value, probability) in enumerate(ranked[:top_k], start=1):
        metrics = {}
        if isinstance(extra, dict):
            candidate_extra = extra.get("feature_details", {}).get(value) if "feature_details" in extra else extra.get(value)
            if candidate_extra:
                metrics = candidate_extra
        if not metrics and isinstance(extra, dict):
            # markov transition counts or other keyed details
            if "transition_counts" in extra and value in extra["transition_counts"]:
                metrics = {"transition": extra["transition_counts"][value]}
            elif "global_counts" in extra and value in extra["global_counts"]:
                metrics = {"count": extra["global_counts"][value]}

        explanation = None
        if algorithm_key == "frequency":
            explanation = f"Tần suất xuất hiện {metrics.get('count', 0)} lần"
        elif algorithm_key == "markov":
            explanation = "Tăng cường bởi trạng thái kế tiếp trong chuỗi Markov"
        elif algorithm_key == "montecarlo":
            explanation = "Xác suất ước lượng qua mô phỏng"
        elif algorithm_key == "randomforest":
            explanation = "Kết hợp đặc trưng tần suất + chuyển tiếp"
        elif algorithm_key == "lstm":
            explanation = "Trọng số giảm dần ưu tiên chuỗi gần đây"
        elif algorithm_key == "genetic":
            explanation = "Cá thể elitist sau nhiều thế hệ"
        elif algorithm_key == "naivebayes":
            explanation = "Tích xác suất độc lập đầu/cuối"
        elif algorithm_key == "prophet":
            explanation = "Xu hướng & mùa vụ dự báo"
        elif algorithm_key == "trend":
            explanation = "Tần suất tăng trong cửa sổ gần đây"
        elif algorithm_key == "randomized":
            explanation = "Ngẫu nhiên trọng số dựa vào lịch sử"

        results.append(
            {
                "rank": rank,
                "number": value,
                "probability": round(probability, 6),
                "supporting_metrics": metrics,
                "explanation": explanation,
            }
        )

    confidence = sum(item["probability"] for item in results)

    payload: dict[str, object] = {
        "algorithm": algorithm_key,
        "label": label,
        "timestamp": dt.datetime.utcnow(),
        "metadata": {
            "lookback_draws": lookback_draws,
            "digits": digits,
            "runtime_ms": round(runtime_ms, 3),
            "confidence_score": round(confidence, 4),
            "notes": notes,
            "advanced": advanced,
            "top_k": top_k,
        },
        "results": results,
        "related": {
            "hot_numbers": hot,
            "cold_numbers": cold,
            "heatmap_slice": heatmap,
            "pseudo_code": pseudo,
        },
    }

    if isinstance(extra, dict):
        payload["debug"] = extra

    return payload


def predict_heads(
    algorithm: str = "frequency",
    top_k: int = 5,
    *,
    digits: int = 1,
    lookback_draws: int | None = None,
    as_of_date: dt.date | None = None,
) -> dict[str, object]:
    start_time = time.perf_counter()
    algorithm_key = algorithm.lower()
    notes: str | None = None
    scores: list[tuple[str, float]] = []
    metrics_map: dict[str, dict[str, float]] = {}

    if algorithm_key == "frequency":
        distribution = get_head_frequencies(
            digits=digits,
            lookback_draws=lookback_draws,
            limit=top_k * 6 if top_k else None,
            end_date=as_of_date,
        )
        total = sum(count for _, count in distribution) or 1
        scores = [(value, count / total) for value, count in distribution]
        metrics_map = {
            value: {"count": float(count), "ratio": float(count / total)}
            for value, count in distribution
        }
        notes = f"Tần suất {digits} chữ số đầu trên toàn bộ lịch sử"

    elif algorithm_key == "trend":
        ensure_current_year_data()
        recent_stats = ensure_recent_frequency(
            days=30,
            top_k=top_k * 6,
            digits=digits,
            end_date=as_of_date,
        )
        total = sum(count for _, count in recent_stats) or 1
        scores = [(value, count / total) for value, count in recent_stats]
        metrics_map = {
            value: {"count": float(count), "ratio": float(count / total)}
            for value, count in recent_stats
        }
        notes = f"Xu hướng {digits} chữ số đầu trong 30 kỳ gần nhất"

    elif algorithm_key == "randomized":
        base = get_head_frequencies(
            digits=digits,
            lookback_draws=lookback_draws,
            limit=top_k * 12 if top_k else None,
            end_date=as_of_date,
        )
        if base:
            values, weights = zip(*base)
            chosen: list[str] = []
            attempts = 0
            while len(chosen) < top_k and attempts < top_k * 10:
                choice = random.choices(values, weights=weights, k=1)[0]
                if choice not in chosen:
                    chosen.append(choice)
                attempts += 1
            probabilities = 1 / max(len(chosen), 1)
            scores = [(value, probabilities) for value in chosen]
            metrics_map = {value: {"weight": probabilities} for value in chosen}
        else:
            fallback = {str(i).zfill(digits): 1 for i in range(10 ** digits)}
            chosen = list(fallback.keys())[:top_k]
            scores = [(value, 1 / len(chosen)) for value in chosen]
            metrics_map = {value: {"weight": 1 / len(chosen)} for value in chosen}
        notes = "Bốc thăm có trọng số nhẹ theo tần suất lịch sử"

    elif algorithm_key == "markov":
        predictions = markov_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
            end_date=as_of_date,
        )
        scores = predictions
        metrics_map = {
            value: {"weight": float(probability)} for value, probability in predictions
        }
        notes = "Ma trận chuyển tiếp Markov từ các kỳ gần nhất"

    elif algorithm_key in {"monte_carlo", "montecarlo"}:
        predictions = monte_carlo_predictions(
            digits=digits,
            top_k=top_k,
            lookback_draws=lookback_draws,
            end_date=as_of_date,
        )
        scores = predictions
        metrics_map = {
            value: {"weight": float(probability)} for value, probability in predictions
        }
        notes = "Mô phỏng Monte Carlo dựa trên phân phối trọng số lịch sử"

    else:
        supported = [
            "frequency",
            "trend",
            "randomized",
            "markov",
            "montecarlo",
            "monte_carlo",
        ]
        raise ValueError(f"Thuật toán không được hỗ trợ. Hỗ trợ: {', '.join(supported)}")

    if not scores:
        fallback = [str(i).zfill(digits) for i in range(top_k)]
        scores = [(value, 1 / max(top_k, 1)) for value in fallback]
        metrics_map = {value: {"weight": 1 / max(top_k, 1)} for value in fallback}
        notes = (notes or "Đề xuất mặc định") + " (fallback)"

    normalized = _normalize_probabilities(dict(scores))
    ranked = sorted(normalized.items(), key=lambda item: item[1], reverse=True)
    heads = [value for value, _ in ranked[:top_k]]
    confidence = sum(probability for _, probability in ranked[:top_k])
    runtime_ms = (time.perf_counter() - start_time) * 1000

    label_key = algorithm_key.replace("_", "")
    label = ALGORITHM_LABELS.get(label_key, ALGORITHM_LABELS.get(algorithm_key, algorithm_key))

    def _explanation_for(value: str) -> str | None:
        if algorithm_key == "frequency":
            count = metrics_map.get(value, {}).get("count")
            return f"Tần suất xuất hiện {int(count) if count is not None else 0} lần"
        if algorithm_key == "trend":
            return "Xu hướng 30 kỳ gần nhất"
        if algorithm_key == "randomized":
            return "Ngẫu nhiên trọng số dựa vào lịch sử"
        if algorithm_key == "markov":
            return "Chuỗi chuyển tiếp Markov"
        if algorithm_key.replace("_", "") == "montecarlo":
            return "Ước lượng qua mô phỏng Monte Carlo"
        return None

    results = []
    for rank, (value, probability) in enumerate(ranked[:top_k], start=1):
        metrics = metrics_map.get(value)
        supporting = {key: float(val) for key, val in (metrics or {}).items()}
        results.append(
            {
                "rank": rank,
                "number": value,
                "probability": round(probability, 6),
                "supporting_metrics": supporting or None,
                "explanation": _explanation_for(value),
            }
        )

    scores_payload = [
        {"number": value, "probability": round(probability, 6)}
        for value, probability in ranked[: top_k * 2 if top_k else len(ranked)]
    ]

    payload: dict[str, object] = {
        "algorithm": algorithm_key,
        "label": label,
        "timestamp": dt.datetime.utcnow(),
        "metadata": {
            "lookback_draws": lookback_draws,
            "digits": digits,
            "runtime_ms": round(runtime_ms, 3),
            "confidence_score": round(confidence, 4),
            "notes": notes,
            "advanced": False,
            "top_k": top_k,
            "as_of_date": as_of_date,
        },
        "recommended_heads": heads,
        "results": results,
        "scores": scores_payload,
        "notes": notes,
    }
    return payload


def backtest_heads(
    algorithm: str = "frequency",
    *,
    digits: int = 2,
    top_k: int = 5,
    lookback_draws: int | None = None,
    evaluation_draws: int = 30,
    end_date: dt.date | None = None,
) -> dict[str, object]:
    algorithm_key = algorithm.lower()
    if algorithm_key not in ALGORITHM_LABELS:
        raise ValueError(f"Thuật toán không được hỗ trợ: {algorithm}")

    with get_session() as session:
        query = select(Draw).order_by(Draw.draw_date.asc())
        if end_date:
            query = query.where(Draw.draw_date <= end_date)
        draw_rows = session.exec(query).all()

    if not draw_rows:
        return {
            "algorithm": algorithm_key,
            "label": ALGORITHM_LABELS.get(algorithm_key, algorithm),
            "digits": digits,
            "top_k": top_k,
            "lookback_draws": lookback_draws,
            "evaluation_draws": 0,
            "summary": {
                "evaluated_draws": 0,
                "skipped_draws": 0,
                "hits": 0,
                "hit_rate": 0.0,
                "average_rank_hit": None,
            },
            "timeline": [],
            "parameters": {
                "evaluation_draws": evaluation_draws,
                "digits": digits,
                "top_k": top_k,
                "lookback_draws": lookback_draws,
                "end_date": end_date,
            },
        }

    total_draws = len(draw_rows)
    start_index = max(1, total_draws - evaluation_draws) if evaluation_draws else 1

    timeline: list[dict[str, object]] = []
    hits = 0
    skipped = 0
    rank_hits: list[int] = []

    for idx in range(start_index, total_draws):
        draw = draw_rows[idx]
        cutoff = draw.draw_date - dt.timedelta(days=1)

        payload = predict_heads(
            algorithm=algorithm,
            top_k=top_k,
            digits=digits,
            lookback_draws=lookback_draws,
            as_of_date=cutoff,
        )

        results: list[dict[str, object]] = payload.get("results", [])  # type: ignore[assignment]
        metadata = payload.get("metadata", {})  # type: ignore[assignment]

        prizes = crud.list_prizes_for_draw(draw.id)
        actual_numbers: list[str] = []
        actual_heads_set: set[str] = set()
        for prize in prizes:
            normalized = _normalize_number(prize.number)
            if not normalized:
                continue
            actual_numbers.append(normalized)
            if len(normalized) >= digits:
                actual_heads_set.add(normalized[:digits])

        matched = [item for item in results if item.get("number") in actual_heads_set]
        hit = bool(matched)
        if hit:
            hits += 1
            best_rank = min(int(item.get("rank", 0)) for item in matched if item.get("rank") is not None)
            rank_hits.append(best_rank)
        else:
            best_rank = None

        timeline.append(
            {
                "draw_date": draw.draw_date,
                "draw_label": draw.draw_date.isoformat(),
                "actual_numbers": actual_numbers,
                "actual_heads": sorted(actual_heads_set),
                "predictions": [
                    {
                        "rank": int(item.get("rank", 0)),
                        "number": str(item.get("number")),
                        "probability": float(item.get("probability", 0.0)),
                        "hit": str(item.get("number")) in actual_heads_set,
                    }
                    for item in results
                ],
                "matched_numbers": [str(item.get("number")) for item in matched],
                "best_rank": best_rank,
                "hit": hit,
                "confidence": metadata.get("confidence_score"),
                "history_size": idx,
            }
        )

    evaluated_draws = len(timeline)
    hit_rate = hits / evaluated_draws if evaluated_draws else 0.0
    average_rank_hit = (sum(rank_hits) / len(rank_hits)) if rank_hits else None

    params_start = timeline[0]["draw_date"].isoformat() if timeline else None  # type: ignore[index]
    params_end = timeline[-1]["draw_date"].isoformat() if timeline else None  # type: ignore[index]

    return {
        "algorithm": algorithm_key,
        "label": ALGORITHM_LABELS.get(algorithm_key, algorithm),
        "digits": digits,
        "top_k": top_k,
        "lookback_draws": lookback_draws,
        "evaluation_draws": evaluated_draws,
        "summary": {
            "evaluated_draws": evaluated_draws,
            "skipped_draws": skipped,
            "hits": hits,
            "hit_rate": hit_rate,
            "average_rank_hit": average_rank_hit,
        },
        "timeline": timeline,
        "parameters": {
            "evaluation_draws": evaluation_draws,
            "digits": digits,
            "top_k": top_k,
            "lookback_draws": lookback_draws,
            "start_date": params_start,
            "end_date": params_end,
            "end_date_filter": end_date.isoformat() if end_date else None,
        },
    }


def ensure_recent_frequency(
    days: int = 30,
    top_k: int = 10,
    *,
    digits: int = 1,
    end_date: dt.date | None = None,
) -> list[tuple[str, int]]:
    reference = end_date or dt.date.today()
    cutoff = reference - dt.timedelta(days=days)
    with get_session() as session:
        rows = session.exec(
            select(Prize.number, Draw.draw_date)
            .join(Draw, Prize.draw_id == Draw.id)
            .where(Draw.draw_date >= cutoff)
            .where(Draw.draw_date <= reference)
            .order_by(Draw.draw_date.asc())
        ).all()
    counter = Counter()
    for number, _ in rows:
        normalized = _normalize_number(number)
        if len(normalized) < digits:
            continue
        head = normalized[:digits]
        counter[head] += 1
    return counter.most_common(top_k)
