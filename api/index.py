"""
Vercel Serverless entrypoint for Blackbox.

This module deliberately uses *only* httpx + FastAPI to keep the function
bundle well under Vercel's 250 MB limit. We talk to the Emergent LLM proxy
directly (OpenAI-compatible /v1/chat/completions endpoint) using the
EMERGENT_LLM_KEY. No litellm, no provider SDKs, no emergentintegrations.

Bundle size with this implementation: ~25 MB unzipped.
(Compare to the previous emergentintegrations build: ~415 MB.)

Environment variables (set in Vercel project settings):
  - EMERGENT_LLM_KEY       (required)  Universal key for Claude Sonnet 4.5
  - EMERGENT_LLM_BASE_URL  (optional)  Override proxy URL. Default works for prod.
  - MONGO_URL              (optional)  Atlas SRV string. If unset, ask logs are skipped.
  - DB_NAME                (optional)  Defaults to "blackbox".
  - CORS_ORIGINS           (optional)  Comma-separated. Defaults to "*".
"""
from __future__ import annotations

import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
EMERGENT_LLM_BASE_URL = os.environ.get(
    "EMERGENT_LLM_BASE_URL",
    "https://integrations.emergentagent.com/llm",
)
MODEL = "claude-sonnet-4-5-20250929"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "blackbox")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

logger = logging.getLogger("blackbox.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# Lazy Mongo: only connect if MONGO_URL is configured
_mongo_client = None
def _get_db():
    global _mongo_client
    if not MONGO_URL:
        return None
    if _mongo_client is None:
        try:
            from pymongo import MongoClient
            _mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        except Exception:
            logger.exception("Mongo init failed; persistence disabled")
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
# Sanitizer
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Blackbox API (Vercel)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
async def root():
    return {"message": "Blackbox API live", "runtime": "vercel"}


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "llm_key_configured": bool(EMERGENT_LLM_KEY),
        "mongo_configured": bool(MONGO_URL),
        "model": MODEL,
    }


async def _call_claude(question: str, context: str) -> str:
    """Direct call to the Emergent LLM proxy (OpenAI-compatible)."""
    user_text = f"AGENT DATA (current view):\n{context}\n\nQUESTION:\n{question}"
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_MESSAGE},
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 1024,
    }
    headers = {
        "Authorization": f"Bearer {EMERGENT_LLM_KEY}",
        "Content-Type": "application/json",
    }

    # connect / read split — fail fast on connect, allow Claude time to think
    timeout = httpx.Timeout(connect=8.0, read=50.0, write=10.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{EMERGENT_LLM_BASE_URL}/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        r.raise_for_status()
        data = r.json()

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise RuntimeError(f"Unexpected LLM response shape: {e}") from e


@app.post("/api/ask", response_model=AskResponse)
async def ask(payload: AskRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured. Add EMERGENT_LLM_KEY to Vercel project environment variables.")
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    session_id = payload.session_id or str(uuid.uuid4())

    try:
        answer = await _call_claude(payload.question, payload.context)
    except httpx.TimeoutException:
        logger.exception("LLM call timed out")
        raise HTTPException(
            status_code=504,
            detail="The AI service took too long to respond. On Vercel Hobby (10s function limit), upgrade to Pro for the 60s ceiling, or try a shorter question.",
        )
    except httpx.HTTPStatusError as e:
        body = (e.response.text or "")[:300]
        logger.exception("LLM proxy returned non-2xx: status=%s body=%s", e.response.status_code, body)
        if e.response.status_code in (401, 403):
            raise HTTPException(status_code=502, detail="The AI service rejected the API key. Verify EMERGENT_LLM_KEY in Vercel env vars is correct and not expired.")
        if e.response.status_code == 429:
            raise HTTPException(status_code=502, detail="The AI service is rate-limiting requests. Try again in a few seconds.")
        raise HTTPException(status_code=502, detail=f"AI service returned {e.response.status_code}. Check Vercel function logs for details.")
    except httpx.HTTPError:
        logger.exception("LLM call network error")
        raise HTTPException(
            status_code=502,
            detail="Could not reach the AI service from Vercel. Check Vercel function logs and verify outbound network is not blocked.",
        )
    except RuntimeError as e:
        logger.exception("LLM response parse error")
        raise HTTPException(status_code=502, detail=f"AI service returned an unexpected response: {e}")

    answer = _sanitize(answer)

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
            logger.warning("Mongo insert failed", exc_info=True)

    return AskResponse(answer=answer, session_id=session_id)
