import type { SkillStep } from '../../types/skill'
import StepNode from './StepNode'

interface FlowTimelineProps {
  steps: SkillStep[]
  activeStepIndex: number // which step is currently active (0-based); -1 = not started
  completedCount: number // how many steps are fully done
  currentStepLabel?: string // label for the progress bar right side (e.g. "⏳ Awaiting Approval")
  elapsedPerStep?: Record<string, number> // step_id → elapsed_ms
}

function getConnectorStyle(
  leftIndex: number,
  completedCount: number,
  activeStepIndex: number,
): React.CSSProperties {
  const leftDone = leftIndex < completedCount
  const rightIndex = leftIndex + 1
  const rightActive = rightIndex === activeStepIndex
  const rightDone = rightIndex < completedCount

  if (leftDone && (rightActive || (!rightDone && rightIndex > completedCount))) {
    // Transition from done to active: gradient
    return {
      background: 'linear-gradient(to right, rgb(99 102 241), rgb(51 65 85))',
      height: 2,
      flex: 1,
      alignSelf: 'center',
      flexShrink: 0,
    }
  }

  if (leftDone && rightDone) {
    return { backgroundColor: 'rgb(99 102 241)', height: 2, flex: 1, alignSelf: 'center', flexShrink: 0 }
  }

  return { backgroundColor: 'rgb(51 65 85)', height: 2, flex: 1, alignSelf: 'center', flexShrink: 0 }
}

function getStatus(
  index: number,
  completedCount: number,
  activeStepIndex: number,
): 'done' | 'active' | 'pending' {
  if (index < completedCount) return 'done'
  if (index === activeStepIndex) return 'active'
  return 'pending'
}

export default function FlowTimeline({
  steps,
  activeStepIndex,
  completedCount,
  currentStepLabel,
  elapsedPerStep = {},
}: FlowTimelineProps) {
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

  return (
    <div
      className="bg-slate-900 border-b border-slate-700 px-6 py-3"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Progress bar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="text-slate-400 shrink-0" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          Step {completedCount} / {steps.length}
        </span>
        <div
          className="bg-slate-700 rounded-full overflow-hidden"
          style={{ flex: 1, height: 6 }}
        >
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {currentStepLabel && (
          <span className="text-slate-400 shrink-0" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            {currentStepLabel}
          </span>
        )}
      </div>

      {/* Step nodes row */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : undefined }}
          >
            <StepNode
              step={step}
              status={getStatus(i, completedCount, activeStepIndex)}
              elapsed={elapsedPerStep[step.id]}
            />
            {i < steps.length - 1 && (
              <div style={{ ...getConnectorStyle(i, completedCount, activeStepIndex), marginTop: 14 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
