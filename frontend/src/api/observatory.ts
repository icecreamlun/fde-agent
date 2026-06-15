import client from './client'

export interface ConnectionStatus {
  id: string
  name: string
  kind: string
  description: string
  status: string
  event_count: number
  last_event_at: string
}

export interface Observation {
  id: string
  ts: string
  source: string
  type: string
  actor: string
  summary: string
}

export interface Roi {
  occurrences_observed: number
  frequency: string
  minutes_per_run: number
  runs_per_week: number
  time_saved_minutes_per_week: number
  cost_saved_usd_per_week: number
  cost_saved_usd_per_year: number
  model_cost_usd_per_week: number
}

export interface Recommendation {
  id: string
  title: string
  workflow_family: string
  confidence: number
  source_apps: string[]
  trigger: string
  actions: string[]
  forbidden_actions: string[]
  target_artifact: string
  target_sheet: string
  common_fields: string[]
  status: 'proposed' | 'accepted'
  roi: Roi
}

export interface ReportTotals {
  workflows_found: number
  workflows_proposed: number
  workflows_accepted: number
  time_saved_minutes_per_week: number
  cost_saved_usd_per_week: number
  cost_saved_usd_per_year: number
  model_cost_usd_per_week: number
}

export interface TrendPoint {
  label: string
  value: number
}

export interface WeeklyReport {
  period: string
  generated_at: string
  summary: string
  totals: ReportTotals
  usage_trend: TrendPoint[]
  recommendations: Recommendation[]
}

export interface AcceptResult {
  status: string
  candidate_id: string
  skill_id: string
  bundle_dir: string
  local_path: string
  installed_files: string[]
  skill_md_preview: string
  planner: string
}

export async function getConnections(): Promise<ConnectionStatus[]> {
  const { data } = await client.get<ConnectionStatus[]>('/api/connections')
  return data
}

export async function getObservations(limit = 25): Promise<Observation[]> {
  const { data } = await client.get<Observation[]>(`/api/observations?limit=${limit}`)
  return data
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const { data } = await client.get<Recommendation[]>('/api/recommendations')
  return data
}

export async function getWeeklyReport(): Promise<WeeklyReport> {
  const { data } = await client.get<WeeklyReport>('/api/report/weekly')
  return data
}

export async function acceptRecommendation(id: string): Promise<AcceptResult> {
  const { data } = await client.post<AcceptResult>(`/api/recommendations/${id}/accept`)
  return data
}

export interface SkillStep {
  order: number
  id: string
  title: string
  type: string
  summary: string
}

export interface SkillGraph {
  trigger: string
  steps: SkillStep[]
  outcome: string
}

export interface SkillItem {
  skill_id: string
  name: string
  description: string
  status: string
  source_workflow: string
  step_count: number
  source_apps: string[]
  guardrails: string[]
  installed_locally: boolean
  local_path: string
  invocations: number
  matches: number
  graph: SkillGraph
  trend: TrendPoint[]
}

export async function getSkills(): Promise<SkillItem[]> {
  const { data } = await client.get<SkillItem[]>('/api/skills')
  return data
}
