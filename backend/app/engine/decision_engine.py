import numpy as np
from datetime import datetime
from app.core.config import W1_DELAY_RISK, W2_RELIABILITY, W3_COST, W4_TIME
from app.ml.features import build_feature_vector
from app.ml.predictor import predict


def score_route(route: dict, departure_date: datetime,
                constraint_statuses: dict) -> dict:
    feature_df = build_feature_vector(route, departure_date, constraint_statuses)
    prediction = predict(feature_df)

    return {
        **route,
        "prediction": prediction,
    }


def rank_routes(routes: list, departure_date: datetime,
                constraint_statuses: dict) -> list:
    # Separate feasible and blocked
    feasible = [r for r in routes if r.get("is_feasible", False)]
    blocked  = [r for r in routes if not r.get("is_feasible", True)]

    if not feasible:
        return blocked  # all routes blocked — return with reasons

    # Score all feasible routes
    scored = []
    for route in feasible:
        scored_route = score_route(route, departure_date, constraint_statuses)
        scored.append(scored_route)

    # Normalise cost and time for composite score
    costs  = [r["cost_estimate"] for r in scored]
    times  = [r["base_time_hrs"] for r in scored]
    min_c, max_c = min(costs), max(costs)
    min_t, max_t = min(times), max(times)

    for route in scored:
        risk        = route["prediction"]["risk_score"]
        reliability = route["reliability_score"]
        norm_cost   = ((route["cost_estimate"] - min_c) / (max_c - min_c + 1e-9))
        norm_time   = ((route["base_time_hrs"] - min_t) / (max_t - min_t + 1e-9))

        composite = (
            W1_DELAY_RISK  * risk +
            W2_RELIABILITY * (1 - reliability) +
            W3_COST        * norm_cost +
            W4_TIME        * norm_time
        )
        route["composite_score"] = round(composite, 4)

    # Sort by composite score — lowest is best
    scored.sort(key=lambda r: r["composite_score"])

    # Add rank
    for i, route in enumerate(scored):
        route["rank"] = i + 1

    return scored + blocked