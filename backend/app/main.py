from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base
from .config import get_settings
from .routers import shipments, labels, settings, scanforms

settings_config = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create database tables
    Base.metadata.create_all(bind=engine)
    print(f"Database tables created")
    print(f"EasyPost Environment: {'PRODUCTION' if settings_config.EASYPOST_API_KEY.startswith('EZAK') else 'TEST'}")
    yield
    # Shutdown
    print("Application shutting down")


app = FastAPI(
    title="Shipping Management Platform",
    description="Manage shipping labels with EasyPost integration",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(shipments.router)
app.include_router(labels.router)
app.include_router(settings.router)
app.include_router(scanforms.router)


@app.get("/")
async def root():
    return {
        "message": "Shipping Management Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
