import { http, HttpResponse } from 'msw'

// All timestamps are relative to load time so the "live activity" feed looks fresh.
const now = Date.now()
const minsAgo = (m: number) => new Date(now - m * 60000).toISOString()

// ---- in-memory mock state (resets on page reload) ----
const accepted = new Set<string>(['cand_daily_cash_recon_001'])

type Trend = { label: string; value: number }
const zeros = (n: number): Trend[] => Array.from({ length: n }, (_, i) => ({ label: `d-${n - i}`, value: 0 }))

const CASH_TREND: Trend[] = [
  { label: '06-08', value: 3 },
  { label: '06-09', value: 4 },
  { label: '06-10', value: 5 },
  { label: '06-11', value: 4 },
  { label: '06-12', value: 6 },
  { label: '06-13', value: 5 },
  { label: '06-14', value: 7 },
  { label: '06-15', value: 3 },
]

const RECOMMENDATIONS = [
  {
    id: 'cand_daily_cash_recon_001',
    title: 'Daily Cash Reconciliation',
    workflow_family: 'daily_cash_reconciliation',
    confidence: 0.95,
    source_apps: ['gmail', 'excel'],
    trigger: 'new daily bank transaction email',
    actions: [
      'read bank attachment rows',
      'match transactions against Payment Export',
      'compute Amount Diff',
      'fill Match Status / Exception Reason',
      'draft summary reply',
      'write audit log',
    ],
    forbidden_actions: ['send email automatically', 'access network', 'overwrite reviewed rows'],
    target_artifact: 'cash_recon.xlsx',
    target_sheet: 'Daily Reconciliation',
    common_fields: ['Recon Date', 'Txn ID', 'Amount Diff', 'Match Status'],
    roi: {
      occurrences_observed: 3,
      frequency: 'daily (business days)',
      minutes_per_run: 36,
      runs_per_week: 5,
      time_saved_minutes_per_week: 144,
      cost_saved_usd_per_week: 180,
      cost_saved_usd_per_year: 9360,
      model_cost_usd_per_week: 0.3,
    },
  },
  {
    id: 'cand_vendor_onboarding_001',
    title: 'Vendor Onboarding Intake',
    workflow_family: 'fde_intake_candidate',
    confidence: 0.88,
    source_apps: ['gmail', 'excel'],
    trigger: 'new customer onboarding request email',
    actions: [
      'parse onboarding email',
      'extract customer + blockers',
      'append Onboarding Tracker row',
      'draft next-step reply',
    ],
    forbidden_actions: ['send email automatically', 'access network'],
    target_artifact: 'onboarding_tracker.xlsx',
    target_sheet: 'Onboarding Tracker',
    common_fields: ['Customer', 'Contact', 'Request Type', 'Blockers', 'Next Step'],
    roi: {
      occurrences_observed: 4,
      frequency: 'weekly',
      minutes_per_run: 18,
      runs_per_week: 6,
      time_saved_minutes_per_week: 86,
      cost_saved_usd_per_week: 108,
      cost_saved_usd_per_year: 5616,
      model_cost_usd_per_week: 0.36,
    },
  },
]

const CASH_SKILL = {
  skill_id: 'daily_cash_reconciliation',
  name: 'Daily Cash Reconciliation',
  description:
    'When the daily bank transaction email arrives, read the attachment, reconcile against the finance workbook, flag exceptions, and draft a summary reply — all under human approval.',
  status: 'active',
  source_workflow: 'cand_daily_cash_recon_001',
  step_count: 8,
  source_apps: ['excel', 'gmail'],
  guardrails: [
    'No email is sent automatically',
    'No network access',
    'No reviewed rows overwritten',
    'Human approval before any write',
  ],
  installed_locally: true,
  local_path: '~/.claude/skills/daily-cash-reconciliation',
  invocations: 37,
  matches: 42,
  graph: {
    trigger: 'Daily bank transactions email arrives',
    steps: [
      { order: 1, id: 'read', title: 'Read bank attachment', type: 'read_input', summary: 'Load the bank_transactions_*.xlsx rows.' },
      { order: 2, id: 'match', title: 'Match against Payment Export', type: 'transform', summary: 'Pair each bank row with the ledger.' },
      { order: 3, id: 'diff', title: 'Compute amount differences', type: 'analyze', summary: 'Flag rows where amounts disagree.' },
      { order: 4, id: 'fill', title: 'Fill Match Status / Exception', type: 'transform', summary: 'Annotate each reconciliation row.' },
      { order: 5, id: 'draft', title: 'Draft summary reply', type: 'draft_output', summary: 'Prepare the daily result email (not sent).' },
      { order: 6, id: 'approve', title: 'Reviewer approves', type: 'human_approval', summary: 'Human confirms before any file write.' },
      { order: 7, id: 'write', title: 'Write reconciled sheet', type: 'write_output', summary: 'Create the reconciled workbook copy.' },
      { order: 8, id: 'validate', title: 'Validate outputs', type: 'validate', summary: 'Re-open file, check guardrails, write run record.' },
    ],
    outcome: 'Reconciled spreadsheet + draft reply, fully auditable.',
  },
  trend: CASH_TREND,
}

function skillFromRec(rec: (typeof RECOMMENDATIONS)[number]) {
  const slug = (rec.workflow_family || rec.id).replace(/_/g, '-')
  return {
    skill_id: rec.workflow_family || rec.id,
    name: rec.title,
    description: `Generated from the “${rec.title}” workflow. Runs under human approval.`,
    status: 'active',
    source_workflow: rec.id,
    step_count: rec.actions.length,
    source_apps: rec.source_apps,
    guardrails: ['No email is sent automatically', 'No network access', 'Human approval before any write'],
    installed_locally: true,
    local_path: `~/.claude/skills/${slug}`,
    invocations: 0,
    matches: 0,
    graph: {
      trigger: rec.trigger,
      steps: rec.actions.map((a, i) => ({
        order: i + 1,
        id: `step_${i + 1}`,
        title: a,
        type: i === 0 ? 'read_input' : i === rec.actions.length - 1 ? 'write_output' : 'transform',
        summary: '',
      })),
      outcome: 'Local output produced after approval.',
    },
    trend: zeros(8),
  }
}

function currentSkills() {
  const skills = [CASH_SKILL] as ReturnType<typeof skillFromRec>[]
  const seen = new Set(skills.map(s => s.skill_id))
  for (const rec of RECOMMENDATIONS) {
    if (!accepted.has(rec.id)) continue
    const sid = rec.workflow_family || rec.id
    if (seen.has(sid)) continue
    seen.add(sid)
    skills.push(skillFromRec(rec))
  }
  return skills
}

function aggregateTrend() {
  const skills = currentSkills()
  return CASH_TREND.map((t, i) => ({
    label: t.label,
    value: skills.reduce((sum, s) => sum + (s.trend[i]?.value ?? 0), 0),
  }))
}

const OBSERVATIONS = [
  { id: 'e1', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_1', summary: 'cash_recon.xlsx · Daily Reconciliation row 137 updated', ts: minsAgo(3) },
  { id: 'e2', source: 'gmail', type: 'email_received', actor: 'analyst_1', summary: 'Email from ops@bank.com: Daily bank transactions - Jun 15', ts: minsAgo(8) },
  { id: 'e3', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_2', summary: 'onboarding_tracker.xlsx · Onboarding Tracker row 12 updated', ts: minsAgo(22) },
  { id: 'e4', source: 'gmail', type: 'outbound_message_created', actor: 'analyst_1', summary: 'Drafted reply: Re: Daily bank transactions', ts: minsAgo(31) },
  { id: 'e5', source: 'gmail', type: 'email_received', actor: 'analyst_2', summary: 'Email from acme@corp.com: API onboarding request for Acme', ts: minsAgo(46) },
  { id: 'e6', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_1', summary: 'cash_recon.xlsx · Daily Reconciliation row 92 updated', ts: minsAgo(58) },
  { id: 'e7', source: 'gmail', type: 'email_received', actor: 'analyst_2', summary: 'Email from globex@corp.com: Onboarding — need credentials', ts: minsAgo(74) },
  { id: 'e8', source: 'excel', type: 'spreadsheet_row_updated', actor: 'analyst_1', summary: 'cash_recon.xlsx · Payment Export row 5 updated', ts: minsAgo(95) },
]

const CONNECTIONS = [
  { id: 'gmail', name: 'Gmail', kind: 'email', description: 'Inbound and outbound email activity.', status: 'connected', event_count: 128, last_event_at: minsAgo(8) },
  { id: 'excel', name: 'Excel', kind: 'spreadsheet', description: 'Workbook and cell-level changes.', status: 'connected', event_count: 86, last_event_at: minsAgo(3) },
]

function totals() {
  const recs = RECOMMENDATIONS
  return {
    workflows_found: recs.length,
    workflows_proposed: recs.filter(r => !accepted.has(r.id)).length,
    workflows_accepted: recs.filter(r => accepted.has(r.id)).length,
    time_saved_minutes_per_week: recs.reduce((s, r) => s + r.roi.time_saved_minutes_per_week, 0),
    cost_saved_usd_per_week: recs.reduce((s, r) => s + r.roi.cost_saved_usd_per_week, 0),
    cost_saved_usd_per_year: recs.reduce((s, r) => s + r.roi.cost_saved_usd_per_year, 0),
    model_cost_usd_per_week: Math.round(recs.reduce((s, r) => s + r.roi.model_cost_usd_per_week, 0) * 100) / 100,
  }
}

const withStatus = (r: (typeof RECOMMENDATIONS)[number]) => ({ ...r, status: accepted.has(r.id) ? 'accepted' : 'proposed' })

export const handlers = [
  http.get('/api/connections', () => HttpResponse.json(CONNECTIONS)),
  http.get('/api/observations', () => HttpResponse.json(OBSERVATIONS)),
  http.get('/api/recommendations', () => HttpResponse.json(RECOMMENDATIONS.map(withStatus))),
  http.get('/api/report/weekly', () =>
    HttpResponse.json({
      period: 'this week',
      generated_at: minsAgo(0),
      summary:
        'Your installed skills saved the finance team about $180/week ($9,360/year) and recovered ~2.4 analyst hours this week, at $0.30/week in model cost. One more workflow — Vendor Onboarding Intake — is ready to adopt for another ~$108/week. Every skill runs only under human approval.',
      totals: totals(),
      usage_trend: aggregateTrend(),
      recommendations: RECOMMENDATIONS.map(withStatus),
    }),
  ),
  http.get('/api/skills', () => HttpResponse.json(currentSkills())),
  http.post('/api/recommendations/:id/accept', ({ params }) => {
    const id = String(params.id)
    accepted.add(id)
    const rec = RECOMMENDATIONS.find(r => r.id === id)
    const slug = (rec?.workflow_family || id).replace(/_/g, '-')
    return HttpResponse.json({
      status: 'installed',
      candidate_id: id,
      skill_id: rec?.workflow_family || id,
      bundle_dir: `workspace/skills/${slug}`,
      local_path: `~/.claude/skills/${slug}`,
      installed_files: ['SKILL.md', 'skill.json', 'skill.yaml', 'policy.yaml'],
      skill_md_preview: `# ${rec?.title ?? 'Generated skill'}\n\nTrigger: ${rec?.trigger ?? ''}\n\nThis skill runs under human approval. It reads the matched input, prepares the change, waits for a reviewer, then writes the local output and records a run.`,
      planner: 'anthropic',
    })
  }),
]
