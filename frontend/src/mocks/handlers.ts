import { http, HttpResponse } from 'msw'
import matchFixture from './fixtures/match_daily_cash.json'
import skillopsFixture from './fixtures/skillops_daily_cash.json'
import summaryFixture from './fixtures/skills_summary.json'

// SSE events to stream, one per 1.5 seconds
const SSE_EVENTS = [
  { type: 'step_started', step_id: 'trigger', step_index: 0, label: 'Trigger', sublabel: 'email_received', timestamp: '2026-06-15T08:04:00-07:00' },
  { type: 'step_completed', step_id: 'trigger', step_index: 0, label: 'Trigger', summary: 'Email matched: "Daily bank transactions - June 15"', elapsed_ms: 120, timestamp: '2026-06-15T08:04:00-07:00', raw: { subject: 'Daily bank transactions - June 15', attachment: 'bank_transactions_2026_06_15.xlsx' } },
  { type: 'step_started', step_id: 'parse_bank_transactions', step_index: 1, label: 'Parse', sublabel: 'xlsx_attachment', timestamp: '2026-06-15T08:04:01-07:00' },
  { type: 'step_completed', step_id: 'parse_bank_transactions', step_index: 1, label: 'Parse', summary: '152 transactions read from bank_transactions_2026_06_15.xlsx', elapsed_ms: 1080, timestamp: '2026-06-15T08:04:02-07:00', raw: { rows: 152, sheet: 'Transactions' } },
  { type: 'step_started', step_id: 'build_reconciliation_preview', step_index: 2, label: 'Preview', sublabel: 'recon_update', timestamp: '2026-06-15T08:04:03-07:00' },
  { type: 'step_completed', step_id: 'build_reconciliation_preview', step_index: 2, label: 'Preview', summary: '148 matched, 4 exceptions flagged', elapsed_ms: 2600, timestamp: '2026-06-15T08:04:06-07:00', raw: { matched: 148, exceptions: 4 } },
  {
    type: 'approval_required',
    step_index: 3,
    timestamp: '2026-06-15T08:04:06-07:00',
    proposed_changes: {
      description: 'Apply reconciliation update and create reply draft',
      files_to_modify: ['workspace/workbooks/cash_recon.xlsx', 'workspace/mail/drafts/cash_recon_2026_06_15_reply.eml'],
      stats: { matched: 148, exceptions: 4, total: 152 }
    },
    guardrails: ['No email will be sent', 'No network access', 'No closed-period sheets modified'],
    reply_draft: 'Daily reconciliation complete. 148 transactions matched. 4 exceptions require review.'
  }
]

// After approval, continue with these events
const POST_APPROVAL_EVENTS = [
  { type: 'step_started', step_id: 'write_workbook_update', step_index: 4, label: 'Execute', sublabel: 'write_xlsx', timestamp: '2026-06-15T08:21:00-07:00' },
  { type: 'step_completed', step_id: 'write_workbook_update', step_index: 4, label: 'Execute', summary: 'Workbook updated: 152 rows written to Daily Reconciliation', elapsed_ms: 980, timestamp: '2026-06-15T08:21:01-07:00', raw: { rows_written: 152, sheet: 'Daily Reconciliation' } },
  {
    type: 'validation_result',
    timestamp: '2026-06-15T08:21:02-07:00',
    status: 'passed',
    checks: [
      { name: 'workbook_can_be_reopened', status: 'passed' },
      { name: 'only_allowed_sheets_modified', status: 'passed' },
      { name: 'no_closed_period_sheets_modified', status: 'passed' },
      { name: 'no_reviewed_rows_overwritten', status: 'passed' },
      { name: 'exception_count_matches_summary', status: 'passed' },
      { name: 'draft_created_but_not_sent', status: 'passed' },
      { name: 'audit_log_written', status: 'passed' }
    ]
  },
  { type: 'execution_complete', decision: 'approved', timestamp: '2026-06-15T08:21:03-07:00', actor: 'analyst_1' }
]

// Helper to create a text/event-stream response that sends events with delays
function createSSEStream(events: object[], delayMs = 1500) {
  const encoder = new TextEncoder()
  let index = 0

  const stream = new ReadableStream({
    start(controller) {
      function sendNext() {
        if (index >= events.length) {
          controller.close()
          return
        }
        const event = events[index++]
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        setTimeout(sendNext, delayMs)
      }
      setTimeout(sendNext, 300)
    }
  })

  return new HttpResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}

export const handlers = [
  http.get('/api/skills/matches', () =>
    HttpResponse.json([matchFixture])
  ),

  http.get('/api/skills/matches/:matchId/stream', () =>
    createSSEStream(SSE_EVENTS)
  ),

  http.post('/api/skills/matches/:matchId/approve', () =>
    HttpResponse.json({ status: 'approved' })
  ),

  http.post('/api/skills/matches/:matchId/reject', () =>
    HttpResponse.json({ status: 'rejected' })
  ),

  http.get('/api/skillops/skills/:skillId', () =>
    HttpResponse.json({ ...skillopsFixture, started_at: new Date().toISOString() })
  ),

  http.get('/api/skillops/summary', () =>
    HttpResponse.json(summaryFixture)
  ),
]

export { POST_APPROVAL_EVENTS }
