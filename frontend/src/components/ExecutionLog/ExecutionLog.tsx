import { useEffect, useRef } from 'react'
import type { ExecutionEvent, StepStartedEvent, StepCompletedEvent } from '../../types/skill'
import { StepCard } from './StepCard'
import { ApprovalCard } from './ApprovalCard'
import { ValidationCard } from './ValidationCard'

interface ExecutionLogProps {
  events: ExecutionEvent[]
  matchId: string
  onApprove: () => void
  onReject: () => void
  decision?: { decision: 'approved' | 'rejected'; actor?: string; timestamp: string } | null
  status?: 'connecting' | 'streaming' | 'done' | 'error'
}

export function ExecutionLog({ events, matchId, onApprove, onReject, decision, status }: ExecutionLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  // Build ordered render list, merging step_started + step_completed by step_id
  const stepMap = new Map<string, { started?: StepStartedEvent; completed?: StepCompletedEvent; index: number }>()
  const renderOrder: Array<
    | { kind: 'step'; stepId: string }
    | { kind: 'approval'; event: ExecutionEvent }
    | { kind: 'validation'; event: ExecutionEvent }
  > = []

  for (const event of events) {
    if (event.type === 'step_started') {
      if (!stepMap.has(event.step_id)) {
        renderOrder.push({ kind: 'step', stepId: event.step_id })
      }
      const entry = stepMap.get(event.step_id) ?? { index: event.step_index }
      stepMap.set(event.step_id, { ...entry, started: event })
    } else if (event.type === 'step_completed') {
      if (!stepMap.has(event.step_id)) {
        renderOrder.push({ kind: 'step', stepId: event.step_id })
      }
      const entry = stepMap.get(event.step_id) ?? { index: event.step_index }
      stepMap.set(event.step_id, { ...entry, completed: event })
    } else if (event.type === 'approval_required') {
      renderOrder.push({ kind: 'approval', event })
    } else if (event.type === 'validation_result') {
      renderOrder.push({ kind: 'validation', event })
    }
    // execution_complete is skipped — handled via ApprovalCard decision prop
  }

  // Show the running indicator while connecting/streaming, unless we're paused
  // awaiting a human-approval decision.
  const awaitingApproval =
    events.some(e => e.type === 'approval_required') && !decision
  const isRunning =
    (status === 'connecting' || status === 'streaming') && !awaitingApproval

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {renderOrder.map((item, i) => {
        if (item.kind === 'step') {
          const entry = stepMap.get(item.stepId)
          if (!entry) return null
          const displayEvent = entry.completed ?? entry.started
          if (!displayEvent) return null
          const isActive = !entry.completed
          return (
            <StepCard
              key={item.stepId}
              event={displayEvent}
              isActive={isActive}
            />
          )
        }

        if (item.kind === 'approval' && item.event.type === 'approval_required') {
          return (
            <ApprovalCard
              key={i}
              event={item.event}
              matchId={matchId}
              onApprove={onApprove}
              onReject={onReject}
              decided={decision}
            />
          )
        }

        if (item.kind === 'validation' && item.event.type === 'validation_result') {
          return <ValidationCard key={i} event={item.event} />
        }

        return null
      })}

      {isRunning && (
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-400">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          <span>{status === 'connecting' ? 'Connecting…' : 'Skill running, loading…'}</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
