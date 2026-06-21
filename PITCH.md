# Auto-FDE — the agent that remembers how *you* work

**HydraDB Agentic Memory Hackathon · Theme: Context over Amnesia**

## The problem

Knowledge workers do the same workflow every day — a finance analyst gets a daily
bank email, reconciles it against a workbook, replies with the exceptions. An AI
that helps once and forgets by tomorrow is useless: you re-explain your rules, your
preferences, and your past corrections every single session.

## What we built

Auto-FDE watches a repeated workflow, turns it into a runnable **skill**, and then
**learns from you across sessions** — so it stops making you repeat yourself.

Two memory loops, both powered by HydraDB:

1. **Skill design memory.** Thumbs-up/down + a note on a generated skill is written
   to HydraDB. The next time the skill is generated, the agent recalls those
   preferences and folds them into the plan — *"you told me to reconcile against the
   Payment Export sheet and never auto-fill the Reviewer column,"* without being told
   again.
2. **Execution memory.** When the skill **runs for real** (reads the bank email,
   reconciles, writes a real `.xlsx` + reply draft + audit), it first recalls the
   reviewer's standing corrections from HydraDB and **auto-resolves exceptions a past
   session already cleared**. Same input → fewer exceptions, because it remembered.

## Why it wins the memory track

- **HydraDB is the primary memory layer** — every preference and correction is written
  to and recalled from HydraDB (`add_memory` / `recall_preferences`). A live **Memory**
  tab shows the reads/writes streaming, and `workspace/feedback/memory_trace.jsonl` is
  the literal execution log.
- **Autonomous recall across sessions** — wipe every local artifact (`reset-demo`:
  deletes the skill, the registry, all local state) and regenerate: the skill *still*
  reflects your feedback, because the memory lives in HydraDB. "Remember what happened
  yesterday," proven by destroying today.
- **Context-aware execution** — the run's output changes (exceptions 1 → 0) purely
  because of stored history. Not a different prompt — a different *result*, driven by
  memory.

## How HydraDB is integrated

- Per-reviewer `sub_tenant_id` namespace, so a preference learned on one skill carries
  to every skill that reviewer touches.
- `infer=True` on write, so HydraDB extracts the durable preference from free-text.
- A thin local mirror covers HydraDB's async ingestion window and offline dev, so the
  loop is demo-reliable while HydraDB remains the source of cross-session truth.
- Memory shapes only human-facing plan text and exception resolution; triggers,
  permissions, and guardrails stay deterministic — memory personalizes, it never
  weakens safety.

## Demo (≈3 min)

1. **Observe → generate** (pre-recorded intro + Accept) → a skill appears.
2. **Run it** → 1 exception flagged (a known $10 timing difference).
3. **Teach it** → "that's a known timing difference, treat as matched" → written to HydraDB (watch the Memory tab).
4. **Run again** → 🧠 *Applied 1 remembered correction from HydraDB* · exceptions 1 → 0 · real reconciled `.xlsx`.
5. **Reset everything → regenerate** → it still remembers. Cross-session memory, proven.

## Stack

Anthropic Claude (skill generation + planning) · **HydraDB** (agent memory) ·
Python stdlib API · React + Vite frontend.
