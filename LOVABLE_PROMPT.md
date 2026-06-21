# Lovable build prompt — Auto-FDE (mock, no backend)

Paste everything below the line into Lovable. It builds the full UI with **all data
mocked in-memory** (no backend, no network). Interactions are scripted so the demo
clicks through end-to-end.

---

Build a single-page React + TypeScript dashboard called **Auto-FDE**. **No backend** —
keep ALL data as in-memory mock constants and mutate local React state on actions.
Never call a network/API. It must run entirely client-side.

## Product
Auto-FDE is an agent that watches a finance analyst's repeated work (email + Excel),
turns it into reusable **skills**, and **learns from feedback across sessions** using a
memory layer (HydraDB) so it never makes you repeat yourself. The star of the demo is
the **memory loop**: give a skill feedback → it's remembered → the next run applies it.

## Visual design (match exactly)
- Background `#f8f7f2`, surface `#ffffff`, ink `#171512`, muted `#706b63`.
- Hairlines `#ded8ce` / `#bdb4a8`. Accent **`#f05a1a`** (orange). Success `#19735a`.
- Font stack: `"Helvetica Neue", Inter, "Segoe UI", Arial, sans-serif`. Flat, editorial,
  generous whitespace, **square corners** (no rounded cards), thin 1px borders, NO
  drop shadows. Numbers use tabular figures.
- Layout: fixed **left sidebar** (≈220px) + scrollable main content.
- Sidebar: wordmark "Auto·FDE" at top; vertical nav of minimal monochrome line icons +
  labels; a small "● Listening" live dot at the bottom. Active item has an orange
  left-edge bar. Some nav items show a small count badge.

## Navigation (7 views)
`Connections`, `Activity`, `Recommendations`, `Skills`, `Memory`, `Workflows`, `Overview`.
Badges: Recommendations = # proposed; Skills = # skills; Workflows = 2.
**Memory and Skills are the important ones** — make them polished.

## Views

### Connections
Cards for each connected source: name, kind, description, "connected" status dot,
event count, "last event" relative time. Data = `CONNECTIONS`.

### Activity
A reverse-chronological feed of observed events (source chip, actor, summary, relative
time). Data = `OBSERVATIONS`. Header note: "Everything the agent has observed across
your connected tools."

### Recommendations
One card per item in `RECOMMENDATIONS`: title, source-app chips (Gmail/Excel), a
confidence % , a 4-metric row (Time saved/wk = `roi.time_saved_hours_per_week`h,
Productivity = `roi.throughput_multiplier`x, Added AI cost/wk = `$roi.added_ai_cost_usd_per_week`,
Frequency = first word of `roi.frequency` + "(`roi.occurrences_observed` seen)"), a
"Trigger: …" line, an expandable "N steps in the proposed skill" (`actions`), and a
primary button **"Accept & install skill"**.
- On Accept: show a short fake progress bar (~2s, label "Drafting the skill with
  Claude…"), then flip the card to an **"Installed"** badge, and **add the skill to the
  Skills view** (mark this rec accepted). `cand_daily_cash_recon_001` starts already
  accepted (its skill = `CASH_SKILL` is present from the start).

### Skills  ★
Left: a list of skills (name, step count, runs, status, app chips, "local" pill).
Right: detail of the selected skill:
- Header: name, app chips, "Installed locally" pill, big invocations number.
- Description paragraph; local path in monospace.
- "Invocation trend" — a simple bar chart from `skill.trend` (array of {label,value}).
- "What this skill does" — a vertical numbered step diagram from `skill.graph.steps`
  (each: title + type tag + summary), with the trigger at top and outcome at bottom.
- "Guardrails" — bullet list.
- **"Teach this skill" feedback panel** (the memory-write):
  - Two toggle buttons **👍 Good** / **👎 Needs work** (selected state colored).
  - A textarea, placeholder: "e.g. tx-1004 Amount variance is a known timing difference — treat it as matched."
  - Buttons: **"Save feedback to memory"** (ghost) and **"Regenerate with feedback"** (orange).
  - On Save: set local `hasCorrection = true` for this skill, show green line
    **"✓ Saved to HydraDB memory — the next run will use it."**, and **append a `write`
    row to the Memory trace** (see Memory view).
  - On Regenerate: ~2s progress bar labeled "Compiling & validating the skill — Claude
    applied 1 remembered preference from your feedback", then tweak the description to
    mention the feedback. Append a `recall` row to the Memory trace.
- **"Run this skill" panel** (the memory-driven execution):
  - Button **"▶ Run on a new bank email"**.
  - On Run: ~1.5s, then a result card.
    - If `hasCorrection` is **false**: show "1 exception flagged: tx-1004 ($10 Amount
      variance)" + two download links (Reconciled spreadsheet .xlsx / Reply draft .eml —
      links can be `#`). Stats: "3 matched · 1 exception".
    - If `hasCorrection` is **true**: show an accent panel
      **"🧠 Applied 1 remembered correction from HydraDB: `tx-1004` auto-resolved — known
      recurring timing difference."** and **"Exceptions: 1 → 0"** (the 1 struck through,
      0 in green) with note "(the agent didn't make you flag it again)". Stats: "4
      matched · 0 exceptions". Same two download links.
    - Either way, append `recall` + `apply` rows to the Memory trace.

### Memory  ★  (the HydraDB story)
- A status card: green dot + **"Connected to HydraDB"**, meta line `tenant: default-tenant`
  · `namespace: controller` (monospace).
- "Memory activity" — a live trace list (newest first) from `MEMORY_TRACE` plus any rows
  appended by feedback/run actions. Each row: time `HH:MM:SS`, a colored op tag, body:
  - `WRITE → HydraDB` (amber) — body = stored text.
  - `RECALL ← HydraDB` (orange) — body = `"<query>" → N hits (M from HydraDB) · top: <text> (score X.XX)`.
  - `APPLY` (green) — body = `Auto-resolved 1 exception from memory · exceptions 1 → 0`.
- Header note: "Every time the agent writes or recalls a preference it shows up here —
  autonomous reads/writes against HydraDB. This is the agent's long-term memory, live."

### Workflows
One card per item in `WORKFLOWS`: name, priority pill, description, "Composed of" chips,
an impact row (people, runs/wk, team hours/wk, FTE, productivity x, added cost/wk), and
an italic "FDE recommendation" paragraph.

### Overview (Weekly FDE report)
A report card: title "Weekly FDE report" + period; the `WEEKLY_SUMMARY` paragraph; a
4-metric totals grid (Time freed/wk = `time_saved_hours_per_week`h ≈ `fte_equivalent`
FTE; Productivity `productivity_multiplier`x; Added AI cost/wk `$added_ai_cost_usd_per_week`
(`$..._per_year`/yr); Workflows found `workflows_found` (`workflows_accepted` accepted)).
Below: "Skill invocation trend" bar chart from `WEEKLY_TREND`.

## Mock data (use verbatim)

```ts
const CONNECTIONS = [
  { id: 'gmail', name: 'Gmail', kind: 'email', description: 'Inbound and outbound email activity.', status: 'connected', event_count: 128, last_event_min_ago: 8 },
  { id: 'excel', name: 'Excel', kind: 'spreadsheet', description: 'Workbook and cell-level changes.', status: 'connected', event_count: 86, last_event_min_ago: 3 },
]

const OBSERVATIONS = [
  { id: 'e1', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_1', summary: 'cash_recon.xlsx · Daily Reconciliation row 137 updated', min_ago: 3 },
  { id: 'e2', source: 'gmail', type: 'email_received', actor: 'analyst_1', summary: 'Email from ops@bank.com: Daily bank transactions - Jun 15', min_ago: 8 },
  { id: 'e3', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_2', summary: 'onboarding_tracker.xlsx · Onboarding Tracker row 12 updated', min_ago: 22 },
  { id: 'e4', source: 'gmail', type: 'outbound_message_created', actor: 'analyst_1', summary: 'Drafted reply: Re: Daily bank transactions', min_ago: 31 },
  { id: 'e5', source: 'gmail', type: 'email_received', actor: 'analyst_2', summary: 'Email from acme@corp.com: API onboarding request for Acme', min_ago: 46 },
  { id: 'e6', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_1', summary: 'cash_recon.xlsx · Daily Reconciliation row 92 updated', min_ago: 58 },
]

const RECOMMENDATIONS = [
  { id: 'cand_daily_cash_recon_001', title: 'Daily Cash Reconciliation', confidence: 0.95, source_apps: ['gmail','excel'], status: 'accepted',
    trigger: 'new daily bank transaction email',
    actions: ['read bank attachment rows','match transactions against Payment Export','compute Amount Diff','fill Match Status / Exception Reason','draft summary reply','write audit log'],
    roi: { occurrences_observed: 3, frequency: 'daily (business days)', time_saved_hours_per_week: 2.4, throughput_multiplier: 5.1, added_ai_cost_usd_per_week: 0.53 } },
  { id: 'cand_vendor_onboarding_001', title: 'Vendor Onboarding Intake', confidence: 0.88, source_apps: ['gmail','excel'], status: 'proposed',
    trigger: 'new customer onboarding request email',
    actions: ['parse onboarding email','extract customer + blockers','append Onboarding Tracker row','draft next-step reply'],
    roi: { occurrences_observed: 4, frequency: 'weekly', time_saved_hours_per_week: 1.4, throughput_multiplier: 4.5, added_ai_cost_usd_per_week: 0.36 } },
]

const CASH_SKILL = {
  skill_id: 'daily_cash_reconciliation', name: 'Daily Cash Reconciliation', status: 'active',
  description: 'When the daily bank transaction email arrives, read the attachment, reconcile against the finance workbook, flag exceptions, and draft a summary reply — all under human approval.',
  step_count: 8, source_apps: ['excel','gmail'], installed_locally: true, local_path: '~/.claude/skills/daily-cash-reconciliation',
  invocations: 37,
  guardrails: ['No email is sent automatically','No network access','No reviewed rows overwritten','Human approval before any write'],
  graph: { trigger: 'Daily bank transactions email arrives', outcome: 'Reconciled spreadsheet + draft reply, fully auditable.', steps: [
    { order: 1, title: 'Read bank attachment', type: 'read_input', summary: 'Load the bank_transactions_*.xlsx rows.' },
    { order: 2, title: 'Match against Payment Export', type: 'transform', summary: 'Pair each bank row with the ledger.' },
    { order: 3, title: 'Compute amount differences', type: 'analyze', summary: 'Flag rows where amounts disagree.' },
    { order: 4, title: 'Fill Match Status / Exception', type: 'transform', summary: 'Annotate each reconciliation row.' },
    { order: 5, title: 'Draft summary reply', type: 'draft_output', summary: 'Prepare the daily result email (not sent).' },
    { order: 6, title: 'Reviewer approves', type: 'human_approval', summary: 'Human confirms before any file write.' },
    { order: 7, title: 'Write reconciled sheet', type: 'write_output', summary: 'Create the reconciled workbook copy.' },
    { order: 8, title: 'Validate outputs', type: 'validate', summary: 'Re-open file, check guardrails, write run record.' },
  ] },
  trend: [{label:'06-08',value:3},{label:'06-09',value:4},{label:'06-10',value:5},{label:'06-11',value:4},{label:'06-12',value:6},{label:'06-13',value:5},{label:'06-14',value:7},{label:'06-15',value:3}],
}

const WORKFLOWS = [
  { id: 'daily_financial_close', name: 'Daily Financial Close', priority: 'high', source_apps: ['excel','gmail'],
    description: 'An AI-assisted daily close: reconcile bank activity, triage exceptions, and draft the close summary — orchestrated end to end with human sign-off.',
    composed_of: ['Daily cash reconciliation','Exception triage','Close summary reporting'],
    fde_recommendation: "Deploy this as the team's standing daily-close workflow. It removes the most repetitive analyst time, scales with transaction volume, and keeps every write behind reviewer approval.",
    impact: { people_involved: 3, runs_per_week: 15, team_hours_saved_per_week: 7.2, fte_equivalent: 0.18, productivity_multiplier: 5.1, added_ai_cost_usd_per_week: 1.59 } },
  { id: 'customer_onboarding_pipeline', name: 'Customer Onboarding Pipeline', priority: 'medium', source_apps: ['gmail','excel'],
    description: 'Capture inbound onboarding requests, extract customer and blockers, update the tracker, and draft the next-step reply — one consistent intake path.',
    composed_of: ['Onboarding intake','Tracker update','Follow-up drafting'],
    fde_recommendation: 'Stand this up to give onboarding a single source of truth and cut intake latency. Highest value once volume exceeds a few requests per week.',
    impact: { people_involved: 2, runs_per_week: 12, team_hours_saved_per_week: 2.8, fte_equivalent: 0.07, productivity_multiplier: 4.5, added_ai_cost_usd_per_week: 0.72 } },
]

const WEEKLY_SUMMARY = 'This week we found 2 repeatable workflows worth automating (Daily Cash Reconciliation, Vendor Onboarding Intake). Adopting them frees ~3.8 analyst hours/week (~0.1 FTE of capacity, ~4.8x throughput on those tasks). This does not cut spend — it adds ~$1.27/week (~$66/year) of AI cost — but it converts manual hours into capacity. Every skill runs under human approval; nothing runs automatically.'
const WEEKLY_TOTALS = { workflows_found: 2, workflows_accepted: 1, time_saved_hours_per_week: 3.8, fte_equivalent: 0.1, productivity_multiplier: 4.8, added_ai_cost_usd_per_week: 1.27, added_ai_cost_usd_per_year: 66.04 }
const WEEKLY_TREND = [{label:'06-08',value:3},{label:'06-09',value:4},{label:'06-10',value:5},{label:'06-11',value:4},{label:'06-12',value:6},{label:'06-13',value:5},{label:'06-14',value:7},{label:'06-15',value:3}]

// Seed memory trace (newest first). Feedback/Run actions PREPEND new rows.
const MEMORY_TRACE = [
  { time: '19:11:25', op: 'write', body: "Reviewer feedback: tx-1004 is a known recurring timing difference — treat as Matched." },
]
```

## Scripted interactions (must work, all client-side)
- Accept on a proposed recommendation → progress → "Installed" badge → its skill appears in Skills.
- Skills feedback **Save** → green confirmation + a `write` row prepended to Memory trace + set `hasCorrection=true` for that skill.
- Skills **Regenerate** → progress → description updates + a `recall` row in Memory trace.
- Skills **Run** → result depends on `hasCorrection` (1 exception, or "1 → 0 + 🧠 applied remembered correction") + prepend `recall` then `apply` rows to Memory trace.
- Memory view reflects all appended rows immediately.

Keep it tasteful and minimal — this is a finance-grade internal tool, not a marketing site.
