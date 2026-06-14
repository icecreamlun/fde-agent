import type { ApprovalRequiredEvent } from '../../types/skill'

interface ApprovalCardProps {
  event: ApprovalRequiredEvent
  matchId: string
  onApprove: () => void
  onReject: () => void
  decided?: { decision: 'approved' | 'rejected'; actor?: string; timestamp: string } | null
}

export function ApprovalCard({ event, onApprove, onReject, decided }: ApprovalCardProps) {
  if (decided) {
    const isApproved = decided.decision === 'approved'
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 opacity-75">
        <div className="flex items-center justify-between">
          <span className={isApproved ? 'text-green-400' : 'text-red-400'}>
            {isApproved ? '✓' : '✗'}{' '}
            {isApproved ? 'Approved' : 'Rejected'}
            {decided.actor ? ` by ${decided.actor}` : ''}
          </span>
          <span className="text-slate-500 text-xs">
            {new Date(decided.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    )
  }

  const { proposed_changes, guardrails, reply_draft } = event
  const stats = proposed_changes.stats

  return (
    <div className="bg-slate-800 border-2 border-indigo-500 rounded-lg p-4">
      <h3 className="text-indigo-300 font-semibold text-base mb-4">⏳ Awaiting Human Approval</h3>

      <div className="mb-4">
        <p className="text-slate-300 text-sm font-medium mb-1">Proposed Changes</p>
        <p className="text-slate-400 text-sm mb-2">{proposed_changes.description}</p>
        {proposed_changes.files_to_modify.length > 0 && (
          <ul className="text-slate-400 text-sm mb-2 space-y-0.5 list-disc list-inside">
            {proposed_changes.files_to_modify.map(f => (
              <li key={f} className="font-mono text-xs">{f}</li>
            ))}
          </ul>
        )}
        <div className="flex gap-4 text-xs text-slate-500 mt-1">
          {Object.entries(stats).map(([k, v]) => (
            <span key={k}>{k}: <span className="text-slate-300">{v}</span></span>
          ))}
        </div>
      </div>

      {reply_draft && (
        <div className="mb-4 border border-slate-600 rounded p-3">
          <p className="text-slate-500 text-xs mb-1">Reply draft</p>
          <p className="text-slate-400 text-sm italic">{reply_draft}</p>
        </div>
      )}

      {guardrails.length > 0 && (
        <div className="mb-4">
          <p className="text-slate-300 text-sm font-medium mb-1">Guardrails</p>
          <ul className="space-y-1">
            {guardrails.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="text-green-400 mt-0.5">✓</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          onClick={onApprove}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-medium"
        >
          Approve &amp; Run
        </button>
        <button
          className="border border-slate-600 text-slate-300 hover:text-slate-100 hover:border-slate-500 px-4 py-2 rounded text-sm"
        >
          Edit Preview
        </button>
        <button
          onClick={onReject}
          className="border border-slate-600 text-slate-300 hover:text-red-400 hover:border-red-500 px-4 py-2 rounded text-sm"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
