"""
Vercel Serverless entrypoint for Blackbox.

Vercel routes every `/api/*` request to this single Python function (see
vercel.json rewrites). We expose a FastAPI ASGI `app` which Vercel's Python
runtime can serve directly.

Same business logic as /app/backend/server.py — kept in sync deliberately so
local Emergent preview and Vercel production behave identically.

Environment variables (set in Vercel project settings):
  - EMERGENT_LLM_KEY   (required)  Universal key for Claude Sonnet 4.5
  - MONGO_URL          (optional)  e.g. MongoDB Atlas SRV string. If unset,
                                   ask logs are simply skipped.
  - DB_NAME            (optional)  Defaults to "blackbox"
  - CORS_ORIGINS       (optional)  Comma-separated. Defaults to "*".
"""
from __future__ import annotations

import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "blackbox")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

logger = logging.getLogger("blackbox.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# Lazy Mongo: only connect if MONGO_URL is configured. Pymongo (sync) is
# lighter than motor and friendlier for short-lived serverless functions.
_mongo_client = None
def _get_db():
    global _mongo_client
    if not MONGO_URL:
        return None
    if _mongo_client is None:
        try:
            from pymongo import MongoClient  # imported lazily to keep cold start small
            _mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        except Exception:
            logger.exception("Mongo init failed; persistence disabled for this invocation")
            return None
    try:
        return _mongo_client[DB_NAME]
    except Exception:
        logger.exception("Mongo db handle failed")
        return None


SYSTEM_MESSAGE = """You are Pulse, the AI analyst inside the Blackbox Agent Health Intelligence platform.

You help Product Managers understand the health of their AI agents. You have access to the current week's agent performance data, which is provided to you in the user message under the "AGENT DATA" section.

Style rules (strict):
- Plain text only. No markdown. No asterisks for bold. No headers. No backticks.
- NEVER use em dashes (—) or en dashes (–). Use a period, comma, or colon instead.
- NEVER mention specific calendar dates, months, or years. Do NOT write things like "April 15", "April 2026", "Apr 28", "May 4", "Q2", "2026", or "last Thursday". Refer to time only as "this week", "last week", "the past N weeks", or "Week 1 / Week 2 / Week 3 / Week 4".
- Use straight punctuation: regular hyphens (-) are fine.
- Bullets only when listing 3 or more items, and prefix each line with "- ".
- Be concise. PMs are busy. Default to 3 to 6 short sentences unless the user asks for more depth.
- Lead with the answer. Numbers first, explanation second.

Content rules:
- Cite specific metrics from the data (agent name, score, % change, conversation counts).
- If the data does not contain the answer, say so explicitly. Do not invent numbers.
- When asked why something happened, ground the explanation in the listed issues and detail fields, but rephrase any dates from those fields as "earlier this period" or "a few weeks ago".
- When asked for recommendations, prioritize by severity (high, then medium, then low) and quantify impact when the data allows.
- Tone: calm, analytical, peer to peer. You are talking to a senior PM, not a beginner."""


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str
    context: str
    session_id: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    session_id: str


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

# IMPORTANT: this app is mounted at the project root on Vercel. The vercel.json
# rewrites send `/api/<path>` to this single function, so route prefix is "/api".
app = FastAPI(title="Blackbox API (Vercel)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_DASH_RE = re.compile(r",\s*,")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_MONTH_PATTERN = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
)
_MONTH_DAY_RE = re.compile(rf"\b{_MONTH_PATTERN}\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s+\d{{4}})?\b", re.IGNORECASE)
_MONTH_YEAR_RE = re.compile(rf"\b{_MONTH_PATTERN}\s+\d{{4}}\b", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_QUARTER_RE = re.compile(r"\bQ[1-4]\s*(?:19|20)?\d{0,2}\b")

def _sanitize(answer: str) -> str:
    if not isinstance(answer, str):
        return answer
    answer = _BOLD_RE.sub(r"\1", answer)
    answer = answer.replace(" — ", ", ").replace("—", ", ")
    answer = answer.replace(" – ", ", ").replace("–", ", ")
    answer = _MONTH_DAY_RE.sub("earlier this period", answer)
    answer = _MONTH_YEAR_RE.sub("earlier this period", answer)
    answer = _YEAR_RE.sub("this period", answer)
    answer = _QUARTER_RE.sub("this period", answer)
    return _DASH_RE.sub(",", answer).strip()


@app.get("/api/")
async def root():
    return {"message": "Blackbox API live", "runtime": "vercel"}


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "llm_key_configured": bool(EMERGENT_LLM_KEY),
        "mongo_configured": bool(MONGO_URL),
    }


@app.post("/api/ask", response_model=AskResponse)
async def ask(payload: AskRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    session_id = payload.session_id or str(uuid.uuid4())

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=SYSTEM_MESSAGE,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    user_text = f"AGENT DATA (current view):\n{payload.context}\n\nQUESTION:\n{payload.question}"

    try:
        answer = await chat.send_message(UserMessage(text=user_text))
    except Exception:
        logger.exception("Claude call failed")
        raise HTTPException(status_code=502, detail="The assistant is unavailable right now. Please try again.")

    answer = _sanitize(answer)

    # Optional persistence — only if MONGO_URL is set
    db = _get_db()
    if db is not None:
        try:
            db.ask_logs.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "question": payload.question,
                "answer": answer,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            # Persistence is best-effort. Never break the user response.
            logger.warning("Mongo insert failed", exc_info=True)

    return AskResponse(answer=answer, session_id=session_id)
