from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class AskRequest(BaseModel):
    question: str
    context: str  # Pre-formatted agent data summary built on the client
    session_id: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    session_id: str


SYSTEM_MESSAGE = """You are Blackbox AI, an analytics assistant embedded inside the Blackbox Agent Health Intelligence platform.

You help Product Managers understand the health of their AI agents. You have access to the current week's agent performance data, which is provided to you in the user message under the "AGENT DATA" section.

Guidelines:
- Be concise. PMs are busy. Default to 3-6 short sentences unless the user asks for more depth.
- Lead with the answer. Numbers first, explanation second.
- Use plain text. No markdown headers. Bullets only when listing 3+ items.
- Cite specific metrics from the data (agent name, score, % change, conversation counts).
- If the data does not contain the answer, say so explicitly. Do not invent numbers.
- When asked "why" something happened, ground the explanation in the listed issues / detail fields.
- When asked for recommendations, prioritize by severity (high > medium > low) and quantify impact when the data allows.
- Tone: calm, analytical, peer-to-peer. You are talking to a senior PM, not a beginner."""


@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.post("/ask", response_model=AskResponse)
async def ask_blackbox(payload: AskRequest):
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
    except Exception as e:
        logger.exception("Claude call failed")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    # Persist for future analytics (no _id in response)
    doc = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "question": payload.question,
        "answer": answer,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.ask_logs.insert_one(doc)
    except Exception:
        logger.warning("Failed to persist ask log", exc_info=True)

    return AskResponse(answer=answer, session_id=session_id)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
