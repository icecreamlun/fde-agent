import type { SkillSummary } from '../../types/skill'

interface SkillSelectorProps {
  skills: SkillSummary[]
  selectedId: string
  onChange: (skillId: string) => void
}

function statusLabel(status: SkillSummary['status']): string {
  switch (status) {
    case 'team_standard': return 'Team Standard'
    case 'beta': return 'Beta'
    case 'needs_refinement': return 'Needs Refinement'
    case 'active': return 'Active'
    case 'disabled': return 'Disabled'
    default: return status
  }
}

export default function SkillSelector({ skills, selectedId, onChange }: SkillSelectorProps) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-2 py-1 text-sm w-full"
    >
      {skills.map((skill) => (
        <option key={skill.skill_id} value={skill.skill_id}>
          {skill.skill_name} · {statusLabel(skill.status)}
        </option>
      ))}
    </select>
  )
}
