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
from app.scheduler              import start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs at startup — models already loaded by loader.py imports
    print("[main] Supply Chain AI starting up")
    start_scheduler()
    yield
    print("[main] Shutting down")


app = FastAPI(
    title="Supply Chain AI",
    description="Maritime delay prediction with constraint-aware routing",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allows Next.js frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:800",
    ],
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


@app.get("/health")
async def health():
    """Cloud Run uses this to check the service is alive."""
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