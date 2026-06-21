# Auto-FDE — the agent that remembers how *you* work

> **HydraDB Agentic Memory Hackathon · Context over Amnesia**
> An AI forward-deployed engineer that watches your repeated work, turns it into a
> runnable skill, and **learns your preferences across sessions with HydraDB** — so it
> stops making you repeat yourself.

**Live demo (mock-data, click-through):** https://auto-fde-frontend.vercel.app

---

## The problem
A finance analyst gets a daily bank email, reconciles it against a workbook, replies with
the exceptions — every day. An assistant that helps once and forgets by tomorrow is
useless: you re-explain your rules, your wording, and your past corrections every session.

## What it does
Auto-FDE observes a repeated workflow (email + Excel), proposes turning it into a **skill**,
generates it with Claude, and then **gets better every time you give feedback** — with
**HydraDB as the long-term memory**.

Two memory loops, both backed by HydraDB:

1. **Design memory.** 👍/👎 + a note on a generated skill is written to HydraDB. The next
   time the skill is generated, the agent recalls those preferences and folds them into the
   plan — *"reconcile against the Payment Export sheet, never auto-fill the Reviewer
   column"* — without being told again.
2. **Execution memory.** When the skill **runs for real** (reads the bank email, reconciles,
   writes a real `.xlsx` + reply draft + audit), it first recalls the reviewer's standing
   corrections from HydraDB and **auto-resolves exceptions a past session already cleared**.
   Same input → fewer exceptions, because it remembered.

## How it meets the memory mandate
- **HydraDB is the primary memory layer** — every preference and correction is written to /
  recalled from HydraDB (`add_memory` / `recall_preferences`). A live **Memory** tab shows
  the reads/writes streaming, and `workspace/feedback/memory_trace.jsonl` is the execution log.
- **Autonomous recall across sessions** — wipe every local artifact (`reset-demo`: deletes
  the skill, the registry, all local state) and regenerate: the skill *still* reflects your
  feedback, because the memory lives in HydraDB. "Remember what happened yesterday," proven
  by destroying today.
- **Context-aware execution** — the run's output changes (exceptions 1 → 0) purely because
  of stored history. Not a different prompt — a different *result*, driven by memory.

Memory shapes only human-facing plan text and exception resolution; triggers, permissions,
and guardrails stay deterministic — memory personalizes, it never weakens safety.

## How HydraDB is integrated
See [`skillforge_local/memory.py`](skillforge_local/memory.py) and
[`autoskill_agent/observatory.py`](autoskill_agent/observatory.py).
- Per-reviewer `sub_tenant_id` namespace — a preference learned on one skill carries to
  every skill that reviewer touches.
- `infer=True` on write, so HydraDB extracts the durable preference from free text.
- A thin local mirror covers HydraDB's async ingestion window and offline dev, so the loop is
  demo-reliable while HydraDB remains the source of cross-session truth.

## Architecture
- **Backend** (Python stdlib HTTP server) — `autoskill_agent/`: observe → recommend → generate
  skill (Claude) → run skill → SkillOps; `skillforge_local/`: email/Excel parsing, the memory
  layer.
- **Frontend** (React + Vite + TypeScript) — `frontend/`: Connections, Activity,
  Recommendations, Skills (feedback + Run), **Memory** (live HydraDB trace), Workflows, Overview.
- **Stack:** Anthropic Claude (skill generation/planning) · **HydraDB** (agent memory) · React/Vite.

## Quickstart
```bash
# 1. Keys — copy and fill in (.env.local is git-ignored)
cp .env.example .env.local      # set ANTHROPIC_API_KEY + HYDRA_DB_API_KEY + HYDRA_TENANT_ID

# 2. Backend
pip install -r requirements.txt
python -m autoskill_agent.api_server --host 127.0.0.1 --port 8017

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev
# open the printed localhost URL; the Vite dev server proxies /api to the backend

# Reset the demo to a clean slate between runs:
python -m autoskill_agent.cli reset-demo --clear-memory
```
Pure-frontend preview with no backend (in-browser mock data): `cd frontend && VITE_USE_MOCKS=1 npm run dev`.

## Demo (≈3 min)
1. **Recommendations → Accept** → a skill appears.
2. **Skills → Run** → 1 exception flagged (a known $10 timing difference).
3. **Teach it** — "that's a known timing difference, treat as matched" → written to HydraDB
   (watch the Memory tab).
4. **Run again** → 🧠 *Applied 1 remembered correction from HydraDB* · exceptions 1 → 0 · real
   reconciled `.xlsx`.
5. **`reset-demo` → regenerate** → it still remembers. Cross-session memory, proven.

## Deliverables
- **Working prototype:** the demo flow above (live HydraDB).
- **Source code:** this repo.
- **Execution logs:** `workspace/feedback/memory_trace.jsonl` — every autonomous HydraDB
  write/recall/apply.
