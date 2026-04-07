"""
Runs predictions and computes SHAP values.
Returns structured prediction output.
"""
import numpy as np
import pandas as pd
from app.ml import loader
from app.core.config import RISK_THRESHOLD_HIGH, RISK_THRESHOLD_MEDIUM


def predict(feature_df: pd.DataFrame) -> dict:
    risk_score = float(loader.classifier.predict_proba(feature_df)[0][1])

    delay_days = 0.0
    if risk_score >= RISK_THRESHOLD_MEDIUM:
        raw        = loader.regressor.predict(feature_df)[0]
        delay_days = round(float(max(0, raw)), 2)

    if risk_score >= RISK_THRESHOLD_HIGH:
        status = "at_risk"
    elif risk_score >= RISK_THRESHOLD_MEDIUM:
        status = "watch"
    else:
        status = "on_time"

    shap_vals     = loader.shap_explainer.shap_values(feature_df)[0]
    feature_names = loader.FEATURE_COLS

    contributions = [
        {
            "feature":    feature_names[i],
            "value":      round(float(feature_df.iloc[0, i]), 4),
            "shap_value": round(float(shap_vals[i]), 4),
            "direction":  "increases_risk" if shap_vals[i] > 0 else "decreases_risk",
        }
        for i in range(len(feature_names))
    ]
    contributions.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    return {
        "risk_score":     round(risk_score, 4),
        "delay_days":     delay_days,
        "status":         status,
        "top_shap":       contributions[:5],
        "feature_values": feature_df.iloc[0].to_dict(),
    }