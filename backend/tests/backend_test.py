"""Backend API tests for Blackbox Agent Health Intelligence.

Covers:
- Health: GET /api/
- Status: POST /api/status, GET /api/status (existing scaffold)
- Ask Blackbox: POST /api/ask (Claude Sonnet 4.5 via emergentintegrations)
  * 400 on empty question
  * 200 with non-empty answer + session_id reuse
  * Mongo persistence in `ask_logs` (no _id leakage)
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# Load backend env to access MONGO_URL/DB_NAME for persistence verification
BACKEND_ENV = Path("/app/backend/.env")
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback to frontend env
    fe_env = Path("/app/frontend/.env")
    if fe_env.exists():
        for line in fe_env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

DEMO_CONTEXT = (
    "Week: Apr 14 – 20\n"
    "Agent: Customer Support Bot — health 72 (-7 vs prior week). "
    "Conversations 3200, failed 192. Cost/conv $0.98 (prev $0.94).\n"
    "Top issue: Prompt update causing longer responses (medium severity, +12% cost, 420 affected)."
)


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME not configured")
    c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    yield c[DB_NAME]
    c.close()


# ────────── Health ──────────
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json() == {"message": "Hello World"}


# ────────── Existing Status scaffold ──────────
class TestStatus:
    def test_create_and_list_status(self, api_client):
        payload = {"client_name": "TEST_pytest_client"}
        r = api_client.post(f"{API}/status", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["client_name"] == "TEST_pytest_client"
        assert "id" in data and isinstance(data["id"], str)
        assert "timestamp" in data
        assert "_id" not in data  # no Mongo leakage

        r2 = api_client.get(f"{API}/status")
        assert r2.status_code == 200
        items = r2.json()
        assert isinstance(items, list)
        assert any(i.get("client_name") == "TEST_pytest_client" for i in items)
        # Verify no _id leakage in list
        for it in items:
            assert "_id" not in it


# ────────── Ask Blackbox ──────────
class TestAskBlackbox:
    def test_empty_question_returns_400(self, api_client):
        r = api_client.post(f"{API}/ask", json={"question": "   ", "context": DEMO_CONTEXT})
        assert r.status_code == 400, r.text
        body = r.json()
        assert "detail" in body
        assert "empty" in body["detail"].lower()

    def test_missing_question_field_returns_422(self, api_client):
        r = api_client.post(f"{API}/ask", json={"context": DEMO_CONTEXT})
        # FastAPI validation
        assert r.status_code == 422

    def test_ask_returns_answer_and_session(self, api_client):
        r = api_client.post(
            f"{API}/ask",
            json={
                "question": "Which agent is unhealthy and why?",
                "context": DEMO_CONTEXT,
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "answer" in data and isinstance(data["answer"], str)
        assert len(data["answer"].strip()) > 0
        assert "session_id" in data and isinstance(data["session_id"], str)
        # session_id should be a valid uuid string
        uuid.UUID(data["session_id"])
        # save for follow-up test
        pytest.shared_session_id = data["session_id"]
        pytest.shared_first_answer = data["answer"]

    def test_ask_session_reuse(self, api_client):
        sid = getattr(pytest, "shared_session_id", None)
        if not sid:
            pytest.skip("No prior session_id to reuse")
        r = api_client.post(
            f"{API}/ask",
            json={
                "question": "Summarize that in one sentence.",
                "context": DEMO_CONTEXT,
                "session_id": sid,
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_id"] == sid
        assert len(data["answer"].strip()) > 0

    def test_ask_persists_to_mongo_without_id_leakage(self, api_client, mongo_db):
        unique_q = f"TEST_persist_check_{uuid.uuid4().hex[:8]} - what is the weekly cost?"
        r = api_client.post(
            f"{API}/ask",
            json={"question": unique_q, "context": DEMO_CONTEXT},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Response should NOT contain Mongo _id
        assert "_id" not in body

        # Allow brief async flush
        time.sleep(0.4)
        doc = mongo_db.ask_logs.find_one({"question": unique_q})
        assert doc is not None, "ask_logs document not persisted"
        # Required fields
        for k in ("id", "session_id", "question", "answer", "created_at"):
            assert k in doc, f"missing field: {k}"
        assert isinstance(doc["created_at"], str)  # ISO string
        assert doc["question"] == unique_q
        assert doc["session_id"] == body["session_id"]

        # cleanup
        mongo_db.ask_logs.delete_one({"_id": doc["_id"]})
