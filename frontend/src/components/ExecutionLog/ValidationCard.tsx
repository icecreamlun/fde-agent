import type { ValidationResultEvent } from '../../types/skill'

interface ValidationCardProps {
  event: ValidationResultEvent
}

export function ValidationCard({ event }: ValidationCardProps) {
  const passed = event.status === 'passed'

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-slate-100">Validation</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded ${
            passed ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
          }`}
        >
          {passed ? 'PASSED' : 'FAILED'}
        </span>
      </div>

      <ul className="space-y-1.5">
        {event.checks.map((check, i) => {
          const ok = check.status === 'passed'
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={ok ? 'text-green-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
              <span className="text-slate-300">{check.name}</span>
              {check.detail && (
                <span className="text-slate-500 text-xs mt-0.5">— {check.detail}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
