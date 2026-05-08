"""
Blackbox local backend — minimal.

The Pulse / Ask-Blackbox feature has been removed, so this server is now just
a tiny status surface used by the Emergent local preview. It has no external
dependencies beyond FastAPI itself, and it is not part of the Vercel build.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="Blackbox local backend")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "Blackbox local backend is healthy", "runtime": "emergent"}


@api.get("/health")
async def health():
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
