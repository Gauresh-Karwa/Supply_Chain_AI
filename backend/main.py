import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.predict        import router as predict_router
from app.api.shipments      import router as shipments_router
from app.api.routes_api     import router as routes_router
from app.api.constraints_api import router as constraints_router
from app.api.cost_analysis      import router as cost_analysis_router
from app.api.port_congestion    import router as port_congestion_router
from app.api.inventory          import router as inventory_router
from app.api.scenarios          import router as scenarios_router
from app.scheduler              import start_scheduler
from app.core.demo_shipments    import init_demo_shipments
from app.core.demo_ledger       import init_demo_ledger
from app.api.esg import router as esg_router


# ── No cloud-specific bootstrap needed for Render ────────────────────────────
# ML model files are baked into the Docker image at build time.


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs at startup — models already loaded by loader.py imports
    print("[main] Supply Chain AI starting up")
    start_scheduler()
    init_demo_shipments()
    init_demo_ledger()
    yield
    print("[main] Shutting down")


app = FastAPI(
    title="Supply Chain AI",
    description="Maritime delay prediction with constraint-aware routing",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow local dev + any onrender.com subdomain + custom domain
_FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if _FRONTEND_URL:
    _ALLOWED_ORIGINS.append(_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(predict_router)
app.include_router(shipments_router)
app.include_router(routes_router)
app.include_router(constraints_router)
app.include_router(cost_analysis_router)
app.include_router(port_congestion_router)
app.include_router(inventory_router)
app.include_router(scenarios_router)
app.include_router(esg_router)

@app.get("/health")
async def health():
    """Render health-check endpoint — must return 2xx."""
    from app.ml.loader import MODEL_META
    return {
        "status":         "healthy",
        "model_auc":      MODEL_META["classifier_auc"],
        "model_r2":       MODEL_META["regressor_r2"],
        "features":       MODEL_META["n_features"],
        "dataset":        MODEL_META["dataset"],
    }


@app.get("/")
async def root():
    return {
        "service": "Supply Chain AI — Maritime Delay Intelligence",
        "docs":    "/docs",
        "health":  "/health",
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))  # Render injects PORT=10000
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)