from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.health import router as health_router
from app.api.rca import router as rca_router
from app.api.anomaly import router as anomaly_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AegisOps AI Service - Anomaly Detection & Incident Reasoning Engine",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="", tags=["Health"])
app.include_router(rca_router, prefix="", tags=["Root Cause Analysis"])
app.include_router(anomaly_router, prefix="", tags=["Anomaly Detection"])

@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "running",
        "docs": "/docs"
    }
