import client from './client'
import type { SkillMatch, SkillOpsMetrics, SkillSummary } from '../types/skill'

export async function listMatches(): Promise<SkillMatch[]> {
  const { data } = await client.get<SkillMatch[]>('/api/skills/matches')
  return data
}

export async function approveMatch(matchId: string): Promise<void> {
  await client.post(`/api/skills/matches/${matchId}/approve`)
}

export async function rejectMatch(matchId: string): Promise<void> {
  await client.post(`/api/skills/matches/${matchId}/reject`)
}

export async function getSkillOps(skillId: string): Promise<SkillOpsMetrics> {
  const { data } = await client.get<SkillOpsMetrics>(`/api/skillops/skills/${skillId}`)
  return data
}

export async function listSkills(): Promise<SkillSummary[]> {
  const { data } = await client.get<SkillSummary[]>('/api/skillops/summary')
  return data
}
