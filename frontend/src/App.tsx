import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import FlowTimeline from './components/FlowTimeline/FlowTimeline'
import { ExecutionLog } from './components/ExecutionLog/ExecutionLog'
import StatsPanel from './components/StatsPanel/StatsPanel'
import { useSkillStream } from './hooks/useSkillStream'
import { listMatches, approveMatch, rejectMatch } from './api/skillops'
import { POST_APPROVAL_EVENTS } from './mocks/handlers'
import type { SkillStep, ExecutionEvent } from './types/skill'

// The 7 steps of the Daily Cash Reconciliation Skill (from skill.yaml)
const SKILL_STEPS: SkillStep[] = [
  { id: 'trigger', type: 'email_trigger', label: 'Trigger', sublabel: 'email_received' },
  { id: 'parse_bank_transactions', type: 'parse_xlsx_attachment', label: 'Parse', sublabel: 'xlsx_attachment' },
  { id: 'build_reconciliation_preview', type: 'preview_reconciliation_update', label: 'Preview', sublabel: 'recon_update' },
  { id: 'require_approval', type: 'require_human_approval', label: 'Approval', sublabel: 'human_review' },
  { id: 'write_workbook_update', type: 'write_xlsx_update', label: 'Execute', sublabel: 'write_xlsx' },
  { id: 'validate', type: 'validate', label: 'Validate', sublabel: '7 checks' },
  { id: 'write_audit_log', type: 'write_audit_log', label: 'Audit', sublabel: 'audit_log' },
]

export default function App() {
  const [selectedSkillId, setSelectedSkillId] = useState('daily_cash_reconciliation')
  const [decision, setDecision] = useState<{ decision: 'approved' | 'rejected'; actor?: string; timestamp: string } | null>(null)
  const [extraEvents, setExtraEvents] = useState<ExecutionEvent[]>([])
  const [executionStartedAt] = useState(() => new Date().toISOString())

  // Load pending matches
  const { data: matches } = useQuery({
    queryKey: ['matches'],
    queryFn: listMatches,
  })

  const matchId = matches?.[0]?.match_id ?? null

  // SSE stream
  const { events: streamEvents, activeStepIndex, status } = useSkillStream(matchId)

  // Merge SSE events + post-approval events
  const allEvents: ExecutionEvent[] = [...streamEvents, ...extraEvents]

  // Compute completed step count from unique step_completed events
  const completedStepIds = new Set(
    allEvents.filter(e => e.type === 'step_completed').map(e => (e as { step_id: string }).step_id)
  )
  const completedCount = completedStepIds.size

  // Compute elapsed per step
  const elapsedPerStep: Record<string, number> = {}
  for (const e of allEvents) {
    if (e.type === 'step_completed') {
      const ev = e as { step_id: string; elapsed_ms: number }
      elapsedPerStep[ev.step_id] = ev.elapsed_ms
    }
  }

  // Current step label for progress bar
  const hasApprovalPending = allEvents.some(e => e.type === 'approval_required') && !decision
  const currentStepLabel = status === 'done'
    ? '✓ Complete'
    : hasApprovalPending
    ? '⏳ Awaiting Approval'
    : status === 'connecting'
    ? 'Connecting…'
    : SKILL_STEPS[activeStepIndex]?.label ?? ''

  // After approval: stream POST_APPROVAL_EVENTS with delays
  function streamPostApprovalEvents() {
    ;(POST_APPROVAL_EVENTS as unknown as ExecutionEvent[]).forEach((event, i) => {
      setTimeout(() => {
        setExtraEvents(prev => [...prev, event])
      }, (i + 1) * 1500)
    })
  }

  async function handleApprove() {
    if (!matchId) return
    try {
      await approveMatch(matchId)
    } catch {
      // MSW mock — ignore errors
    }
    setDecision({ decision: 'approved', actor: 'analyst_1', timestamp: new Date().toISOString() })
    streamPostApprovalEvents()
  }

  async function handleReject() {
    if (!matchId) return
    try {
      await rejectMatch(matchId)
    } catch {
      // MSW mock — ignore errors
    }
    setDecision({ decision: 'rejected', actor: 'analyst_1', timestamp: new Date().toISOString() })
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      {/* Sticky header: FlowTimeline + breadcrumb bar */}
      <div className="sticky top-0 z-10 shrink-0">
        <FlowTimeline
          steps={SKILL_STEPS}
          activeStepIndex={activeStepIndex}
          completedCount={completedCount}
          currentStepLabel={currentStepLabel}
          elapsedPerStep={elapsedPerStep}
        />

        {/* Header bar */}
        <div className="flex items-center gap-4 px-8 py-4 border-b border-slate-700 bg-slate-900 shrink-0" style={{ minHeight: 52 }}>
          <span className="text-sm text-slate-500 font-medium tracking-wide whitespace-nowrap">SkillForge</span>
          <span className="text-slate-600 text-base px-1">›</span>
          <span className="text-sm text-slate-300 font-semibold whitespace-nowrap">Daily Cash Reconciliation Skill</span>
          {matchId && (
            <>
              <span className="text-slate-600 text-base px-1">›</span>
              <span className="text-sm text-slate-500 font-mono truncate max-w-xs">{matchId}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'streaming' ? 'bg-green-400 animate-pulse' :
              status === 'done' ? 'bg-indigo-400' :
              status === 'error' ? 'bg-red-400' :
              'bg-slate-600'
            }`} />
            <span className="text-xs text-slate-500 capitalize">{status}</span>
          </div>
        </div>
      </div>

      {/* Main row: execution log + stats panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Execution log */}
        <div className="flex-1 overflow-y-auto p-6">
          {!matchId ? (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
              Loading skill match…
            </div>
          ) : (
            <ExecutionLog
              events={allEvents}
              matchId={matchId}
              onApprove={handleApprove}
              onReject={handleReject}
              decision={decision}
              status={status}
            />
          )}
        </div>

        {/* Stats panel */}
        <StatsPanel
          selectedSkillId={selectedSkillId}
          onSkillChange={setSelectedSkillId}
          executionStartedAt={executionStartedAt}
        />
      </div>
    </div>
  )
}
