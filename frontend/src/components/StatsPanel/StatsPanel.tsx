import { useEffect, useState } from 'react'
import { useSkillOps, useSkillList } from '../../hooks/useSkillOps'
import SkillSelector from './SkillSelector'
import MetricCard from './MetricCard'

interface StatsPanelProps {
  selectedSkillId: string
  onSkillChange: (skillId: string) => void
  executionStartedAt?: string | null
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export default function StatsPanel({ selectedSkillId, onSkillChange, executionStartedAt }: StatsPanelProps) {
  const { data: metrics } = useSkillOps(selectedSkillId)
  const { data: skills } = useSkillList()
  const [collapsed, setCollapsed] = useState(false)
  const [elapsed, setElapsed] = useState<number | null>(null)

  useEffect(() => {
    if (!executionStartedAt) {
      setElapsed(null)
      return
    }
    const startMs = new Date(executionStartedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [executionStartedAt])

  const elapsedStr = elapsed !== null ? formatElapsed(elapsed) : '—'

  /* ── Collapsed strip ── */
  if (collapsed) {
    return (
      <div
        className="border-l border-slate-700 flex flex-col items-center shrink-0 overflow-hidden"
        style={{
          width: 36,
          background: '#f8fafc',
          transition: 'width 200ms ease',
        }}
      >
        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          title="Expand SkillOps panel"
          style={{
            marginTop: 12,
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            flexShrink: 0,
          }}
        >
          ‹
        </button>

        {/* Rotated label */}
        <div
          style={{
            marginTop: 16,
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            userSelect: 'none',
          }}
        >
          SkillOps
        </div>

        {/* Mini metric dots */}
        <div style={{ marginTop: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {metrics && (
            <>
              <div title={`Run Rate: ${Math.round(metrics.run_rate * 100)}%`}
                style={{ width: 8, height: 8, borderRadius: '50%', background: metrics.run_rate >= 0.9 ? '#16a34a' : '#6366f1' }} />
              <div title={`Reject Rate: ${Math.round(metrics.reject_rate * 100)}%`}
                style={{ width: 8, height: 8, borderRadius: '50%', background: metrics.reject_rate <= 0.1 ? '#16a34a' : '#dc2626' }} />
              <div title={`Success Rate: ${Math.round(metrics.success_rate * 100)}%`}
                style={{ width: 8, height: 8, borderRadius: '50%', background: metrics.success_rate >= 0.9 ? '#16a34a' : '#f59e0b' }} />
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── Expanded panel ── */
  return (
    <div
      className="border-l border-slate-700 flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: 224,
        background: '#f8fafc',
        padding: '16px',
        gap: 16,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
      }}
    >
      {/* Header row with collapse button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="text-xs text-slate-500 uppercase tracking-widest">SkillOps</div>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            border: '1px solid #e2e8f0',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: 14,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ›
        </button>
      </div>

      <SkillSelector
        skills={skills ?? []}
        selectedId={selectedSkillId}
        onChange={onSkillChange}
      />

      <hr className="border-slate-700" />

      <div className="flex flex-col gap-3">
        <MetricCard label="Time Elapsed" value={elapsedStr} />
        <MetricCard label="Tokens Used" value="—" />
        <MetricCard
          label="Run Rate"
          value={metrics ? `${Math.round(metrics.run_rate * 100)}` : '—'}
          unit={metrics ? '%' : undefined}
          colorCode={!!metrics}
          rawValue={metrics?.run_rate}
        />
        <MetricCard
          label="Reject Rate"
          value={metrics ? `${Math.round(metrics.reject_rate * 100)}` : '—'}
          unit={metrics ? '%' : undefined}
          colorCode={!!metrics}
          rawValue={metrics ? 1 - metrics.reject_rate : undefined}
        />
        <MetricCard
          label="Success Rate"
          value={metrics ? `${Math.round(metrics.success_rate * 100)}` : '—'}
          unit={metrics ? '%' : undefined}
          colorCode={!!metrics}
          rawValue={metrics?.success_rate}
        />
      </div>
    </div>
  )
}
