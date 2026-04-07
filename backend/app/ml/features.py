import numpy as np
import pandas as pd
import requests
from datetime import datetime
from app.core.config import PORT_COORDS, CHOKEPOINT_MAP
from app.ml import loader


def get_weather_severity(port: str, date: datetime) -> float:
    coords = PORT_COORDS.get(port)
    if not coords:
        return 1.0

    date_str = date.strftime("%Y-%m-%d")
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={coords['lat']}&longitude={coords['lon']}"
        f"&start_date={date_str}&end_date={date_str}"
        f"&daily=precipitation_sum,windspeed_10m_max"
        f"&timezone=UTC"
    )
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        precip = (data["daily"]["precipitation_sum"] or [0])[0] or 0
        wind   = (data["daily"]["windspeed_10m_max"]  or [0])[0] or 0
        precip_score = min(precip / 16, 5)
        wind_score   = min(wind   / 20, 5)
        return round(precip_score * 0.6 + wind_score * 0.4, 3)
    except Exception:
        return 1.0


def get_zone_features(port: str) -> dict:

    lookup = loader.port_zone_lookup
    row    = lookup[lookup["port"] == port]

    if not row.empty:
        return {
            "zone_id":         int(row["zone_id"].values[0]),
            "zone_risk_score": float(row["zone_risk_score"].values[0]),
        }

    # Port not in lookup — predict zone using K-Means (Option B)
    coords = PORT_COORDS.get(port)
    if coords:
        X = np.array([[coords["lat"], coords["lon"], 0.55]])
        X_scaled = loader.kmeans_scaler.transform(X)
        zone_id  = int(loader.kmeans_model.predict(X_scaled)[0])

        # Get zone risk from existing ports in that zone
        zone_rows = lookup[lookup["zone_id"] == zone_id]
        zone_risk = float(zone_rows["zone_risk_score"].mean()) if not zone_rows.empty else 0.55

        return {"zone_id": zone_id, "zone_risk_score": zone_risk}

    return {"zone_id": 0, "zone_risk_score": 0.55}


def get_anomaly_flag(route: dict, weather_route: float,
                     constraint_penalty: float) -> int:

    baseline = loader.route_anomaly_baseline
    origin   = route.get("origin", "")
    dest     = route.get("destination", "")

    row = baseline[
        (baseline["origin"] == origin) &
        (baseline["destination"] == dest)
    ]

    if row.empty:
        return 0

    avg_w = float(row["avg_weather"].values[0])
    std_w = float(row["std_weather"].values[0]) or 0.1
    avg_c = float(row["avg_constraint"].values[0])
    std_c = float(row["std_constraint"].values[0]) or 0.01

    weather_z    = (weather_route    - avg_w) / std_w
    constraint_z = (constraint_penalty - avg_c) / std_c
    anomaly_score = weather_z * 0.5 + constraint_z * 0.5

    # Top 5% threshold ≈ z-score of 1.28
    return int(anomaly_score >= 1.28)


def get_constraint_features(passes_through: list,
                             constraint_statuses: dict) -> dict:

    n_restricted = sum(
        1 for r in passes_through
        if constraint_statuses.get(r) == "restricted"
    )
    n_blocked = sum(
        1 for r in passes_through
        if constraint_statuses.get(r) == "blocked"
    )
    penalty = (n_restricted * 1.0 + n_blocked * 3.0) / max(len(passes_through), 1)

    chokepoints = {v: 0 for v in CHOKEPOINT_MAP.values()}
    for region in passes_through:
        col = CHOKEPOINT_MAP.get(region)
        if col:
            chokepoints[col] = 1

    return {
        "n_restricted_regions": n_restricted,
        "n_blocked_regions":    n_blocked,
        "constraint_penalty":   round(penalty, 4),
        **chokepoints,
    }


def build_feature_vector(route: dict, departure_date: datetime,
                          constraint_statuses: dict,
                          weather_override: float = None) -> pd.DataFrame:

    passes_through = route.get("passes_through", [])

    # Weather
    weather_origin = (weather_override
                      if weather_override is not None
                      else get_weather_severity(route["origin"], departure_date))
    weather_route  = round(weather_origin + np.random.normal(0, 0.15), 3)
    weather_route  = float(np.clip(weather_route, 0, 5))

    # Constraint features
    c_feats = get_constraint_features(passes_through, constraint_statuses)

    # Zone features
    z_feats = get_zone_features(route["origin"])

    # Anomaly flag
    anomaly = get_anomaly_flag(route, weather_route, c_feats["constraint_penalty"])

    # Temporal
    month       = departure_date.month
    is_peak     = int(month in [10, 11, 12])
    is_monsoon  = int(month in [6,  7,  8,  9])

    feature_dict = {
        "distance_km":              route["distance_km"],
        "base_time_hrs":            route["base_time_hrs"],
        "reliability_score":        route["reliability_score"],
        "weather_severity_origin":  weather_origin,
        "weather_severity_route":   weather_route,
        "n_restricted_regions":     c_feats["n_restricted_regions"],
        "n_blocked_regions":        c_feats["n_blocked_regions"],
        "constraint_penalty":       c_feats["constraint_penalty"],
        "passes_suez":              c_feats["passes_suez"],
        "passes_hormuz":            c_feats["passes_hormuz"],
        "passes_malacca":           c_feats["passes_malacca"],
        "passes_bab_el_mandeb":     c_feats["passes_bab_el_mandeb"],
        "passes_cape":              c_feats["passes_cape"],
        "passes_taiwan_strait":     c_feats["passes_taiwan_strait"],
        "passes_south_china_sea":   c_feats["passes_south_china_sea"],
        "departure_month":          month,
        "is_peak_season":           is_peak,
        "is_monsoon_season":        is_monsoon,
        "zone_id":                  z_feats["zone_id"],
        "zone_risk_score":          z_feats["zone_risk_score"],
        "anomaly_flag":             anomaly,
    }

    return pd.DataFrame([feature_dict])[loader.FEATURE_COLS]