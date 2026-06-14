import type { SkillStep } from '../../types/skill'

interface StepNodeProps {
  step: SkillStep
  status: 'done' | 'active' | 'pending'
  elapsed?: number // ms, only for done steps
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function StepNode({ step, status, elapsed }: StepNodeProps) {
  const isDone = status === 'done'
  const isActive = status === 'active'
  const isPending = status === 'pending'

  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: 64 }}>
      {/* Circle */}
      <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
        {isActive && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: 'rgba(129, 140, 248, 0.3)' }}
          />
        )}
        <div
          className={[
            'relative flex items-center justify-center rounded-full',
            isDone
              ? 'bg-indigo-500 text-white'
              : isActive
                ? 'border-2 border-indigo-400 bg-slate-900'
                : 'border border-slate-600 bg-slate-800 text-slate-600',
          ].join(' ')}
          style={{ width: 28, height: 28 }}
        >
          {isDone && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
          {isPending && <span style={{ fontSize: 14, lineHeight: 1 }}>·</span>}
        </div>
      </div>

      {/* Step label */}
      <span
        className={['font-medium', isPending ? 'text-slate-600' : 'text-slate-300'].join(' ')}
        style={{ fontSize: 10, textAlign: 'center', maxWidth: 72, wordBreak: 'break-word' }}
      >
        {step.label}
      </span>

      {/* Sublabel */}
      {step.sublabel && (
        <span
          className="text-slate-500"
          style={{ fontSize: 9, textAlign: 'center', maxWidth: 72, wordBreak: 'break-word' }}
        >
          {step.sublabel}
        </span>
      )}

      {/* Elapsed time (done only) */}
      {isDone && elapsed !== undefined && (
        <span className="text-slate-500" style={{ fontSize: 9 }}>
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  )
}
