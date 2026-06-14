import { useState } from 'react'
import type { StepStartedEvent, StepCompletedEvent } from '../../types/skill'

interface StepCardProps {
  event: StepStartedEvent | StepCompletedEvent
  isActive?: boolean
}

export function StepCard({ event, isActive = false }: StepCardProps) {
  const [showRaw, setShowRaw] = useState(false)

  const completed = event.type === 'step_completed' ? event : null
  const hasRaw = completed?.raw != null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <span className="inline-block w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          ) : (
            <span className="text-green-400 text-sm">✓</span>
          )}
          <span className="font-semibold text-slate-100">{event.label}</span>
          {isActive && (
            <span className="text-xs text-indigo-400 italic">loading…</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {completed && (
            <span>{completed.elapsed_ms}ms</span>
          )}
          <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {completed?.summary && (
        <p className="mt-4 text-slate-400 text-sm">{completed.summary}</p>
      )}

      {hasRaw && (
        <div className="mt-4">
          <button
            onClick={() => setShowRaw(v => !v)}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            {showRaw ? 'Hide raw output' : 'Show raw output'}
          </button>
          {showRaw && (
            <pre className="mt-3 text-xs text-slate-300 bg-slate-900 rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(completed!.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
