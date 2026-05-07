# Blackbox - Agent Health Intelligence

## Original Problem
Add 3 features to existing Blackbox project:
1. Ask Blackbox - Claude API answers PM questions about agent data
2. PDF export of weekly report (browser-only, jsPDF + html2canvas)
3. Typing animation on AI responses + subtle loading states

## User Persona
Jennifer, a senior PM ("4 years PM experience") tracking 3 production AI agents (Customer Support Bot, Knowledge Assistant, Lead Qualifier). Wants share-ready outputs for Monday standups.

## Tech Stack
- Frontend: React 19 (CRA + craco), recharts, jsPDF, html2canvas, axios
- Backend: FastAPI + emergentintegrations (Anthropic Claude Sonnet 4.5: claude-sonnet-4-5-20250929) + Motor/MongoDB
- LLM key: EMERGENT_LLM_KEY (universal, in /app/backend/.env)

## What's Implemented (Jan 2026)
- POST /api/ask: takes {question, context, session_id?}, calls Claude Sonnet 4.5 with strict style rules, strips em/en dashes + markdown bold server-side, persists each turn into MongoDB `ask_logs`. Empty question -> 400. LLM error -> generic 502 message.
- /app/frontend/src/components/Blackbox.jsx (single source of truth derived from blackbox-2.jsx) with:
  - Top-bar "Ask Blackbox" hero CTA (animated gradient pill, glow pulse, shine sweep, rotating sparkle)
  - Right-side drawer Ask panel with 4 suggestion chips, message bubbles, typewriter caret animation, TypingDots while pending, send button shows spinner + disabled state during call. Session_id reused across turns.
  - Client-side `sanitizeAnswer()` final dash/markdown strip safety net
  - Weekly Report screen "Download PDF" button: html2canvas (scale=2) -> jsPDF a4 multi-page with indigo header, footer with "Confidential" + page X of Y, generated timestamp, weights summary. Button transitions Generating... -> ✓ Downloaded
  - Hidden "Made with Emergent" badge via CSS
  - Bolder typography (fontWeight 700-900, tighter letter-spacing, larger numbers)
- Backend pytest suite at /app/backend/tests/backend_test.py (7/7 passing) covering all 4 endpoints

## Backlog / Future
- P2: Stream tokens from Claude (true SSE) instead of buffering full answer (current: backend buffers, client typewrites at ~10ms/char, very fast for short answers)
- P2: Persist Ask conversation history across page reloads (sessionStorage by session_id)
- P2: Compress PDF (jpeg 0.85 instead of png) -> ~80% smaller files
- P2: Split Blackbox.jsx (~1300 lines) into per-screen modules
- P1 (revenue/engagement): "Share Report" -> generate a public read-only link backed by `/api/reports/{id}` instead of (or in addition to) PDF. Lets Jennifer paste a Slack link instead of attaching files, increases stakeholder visibility for the product.
