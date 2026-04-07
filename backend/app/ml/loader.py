import os
import json
import joblib
import pandas as pd
import xgboost as xgb

ML_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))

# ── XGBoost models ────────────────────────────────────────────────────
classifier = xgb.XGBClassifier()
classifier.load_model(os.path.join(ML_DIR, "xgb_classifier.ubj"))

regressor = xgb.XGBRegressor()
regressor.load_model(os.path.join(ML_DIR, "xgb_regressor.ubj"))

# ── SHAP + clustering models ──────────────────────────────────────────
shap_explainer = joblib.load(os.path.join(ML_DIR, "shap_explainer.joblib"))
kmeans_model   = joblib.load(os.path.join(ML_DIR, "kmeans_model.joblib"))
kmeans_scaler  = joblib.load(os.path.join(ML_DIR, "kmeans_scaler.joblib"))

# ── Lookup tables ─────────────────────────────────────────────────────
port_zone_lookup       = pd.read_csv(os.path.join(ML_DIR, "port_zone_lookup.csv"))
route_anomaly_baseline = pd.read_csv(os.path.join(ML_DIR, "route_anomaly_baseline.csv"))

# ── Feature column order ──────────────────────────────────────────────
with open(os.path.join(ML_DIR, "feature_cols.json")) as f:
    FEATURE_COLS = json.load(f)

# ── Model metadata ────────────────────────────────────────────────────
with open(os.path.join(ML_DIR, "model_meta.json")) as f:
    MODEL_META = json.load(f)

print(f"[loader] Models loaded — AUC {MODEL_META['classifier_auc']} | "
      f"R² {MODEL_META['regressor_r2']} | "
      f"{MODEL_META['n_features']} features")