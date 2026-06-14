// A single action step from skill.yaml
export interface SkillStep {
  id: string
  type: string
  label: string        // human-readable name (e.g. "Parse", "Approval")
  sublabel?: string    // e.g. action type ("xlsx_attachment", "require_human_approval")
}

// A trigger match — skill matched an incoming event
export interface SkillMatch {
  match_id: string
  skill_id: string
  skill_version: number
  trigger_event_id: string
  matched_at: string   // ISO timestamp
  match_confidence: number
  match_reasons: string[]
  status: 'awaiting_preview' | 'previewing' | 'awaiting_approval' | 'approved' | 'rejected' | 'executing' | 'done' | 'failed'
  skill_name: string
}

// SSE event types emitted during skill execution
export type ExecutionEventType =
  | 'step_started'
  | 'step_completed'
  | 'approval_required'
  | 'execution_complete'
  | 'validation_result'

export interface StepStartedEvent {
  type: 'step_started'
  step_id: string
  step_index: number   // 0-based
  label: string
  sublabel?: string
  timestamp: string
}

export interface StepCompletedEvent {
  type: 'step_completed'
  step_id: string
  step_index: number
  label: string
  summary: string      // human-readable result line
  elapsed_ms: number
  timestamp: string
  raw?: Record<string, unknown>  // optional raw output for collapsible JSON
}

export interface ApprovalRequiredEvent {
  type: 'approval_required'
  step_index: number
  timestamp: string
  proposed_changes: {
    description: string
    files_to_modify: string[]
    stats: Record<string, string | number>  // e.g. { matched: 148, exceptions: 4 }
  }
  guardrails: string[]
  reply_draft?: string
}

export interface ExecutionCompleteEvent {
  type: 'execution_complete'
  decision: 'approved' | 'rejected'
  timestamp: string
  actor?: string
}

export interface ValidationResultEvent {
  type: 'validation_result'
  timestamp: string
  status: 'passed' | 'failed'
  checks: Array<{ name: string; status: 'passed' | 'failed'; detail?: string }>
}

export type ExecutionEvent =
  | StepStartedEvent
  | StepCompletedEvent
  | ApprovalRequiredEvent
  | ExecutionCompleteEvent
  | ValidationResultEvent

// SkillOps statistics for a skill
export interface SkillOpsMetrics {
  skill_id: string
  skill_name: string
  users: number
  matches: number
  runs: number
  run_rate: number      // 0–1
  success_rate: number  // 0–1
  reject_rate: number   // 0–1
  last_used: string     // ISO timestamp or relative string
  status: 'active' | 'beta' | 'team_standard' | 'needs_refinement' | 'disabled'
  started_at?: string   // ISO timestamp of current execution start, for elapsed timer
}

// List item for the skill selector dropdown
export interface SkillSummary {
  skill_id: string
  skill_name: string
  status: SkillOpsMetrics['status']
}
