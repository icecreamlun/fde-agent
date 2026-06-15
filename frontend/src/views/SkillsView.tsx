import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSkills } from '../api/observatory'
import type { SkillItem } from '../api/observatory'
import { SourceChip } from '../components/common'
import { SkillDiagram } from '../components/SkillDiagram'
import { TrendChart } from '../components/TrendChart'

function SkillDetail({ skill }: { skill: SkillItem }) {
  return (
    <div className="skill-detail">
      <div className="skill-detail-head">
        <div>
          <h3>{skill.name}</h3>
          <div className="rec-apps">
            {skill.source_apps.map(app => (
              <SourceChip key={app} source={app} />
            ))}
            <span className={`local-pill ${skill.installed_locally ? 'is-local' : ''}`}>
              {skill.installed_locally ? 'Installed locally' : 'Generated (not installed)'}
            </span>
          </div>
        </div>
        <div className="skill-usage">
          <div className="metric-value">{skill.invocations}</div>
          <div className="metric-label">invocations</div>
        </div>
      </div>

      {skill.description ? <p className="skill-desc">{skill.description}</p> : null}
      {skill.installed_locally && skill.local_path ? (
        <p className="skill-path">
          <code>{skill.local_path}</code>
        </p>
      ) : null}

      <h4 className="skill-sub">Invocation trend</h4>
      <TrendChart data={skill.trend ?? []} />

      <h4 className="skill-sub">What this skill does</h4>
      <SkillDiagram graph={skill.graph} />

      {skill.guardrails.length ? (
        <>
          <h4 className="skill-sub">Guardrails</h4>
          <ul className="skill-guardrails">
            {skill.guardrails.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export function SkillsView() {
  const skills = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const [selected, setSelected] = useState<string | null>(null)

  const items = skills.data ?? []
  const active = items.find(s => s.skill_id === selected) ?? items[0] ?? null

  if (skills.isLoading) return <div className="view"><div className="empty-state">Loading skills…</div></div>
  if (items.length === 0) {
    return (
      <div className="view">
        <div className="empty-state">
          No skills generated yet. Accept a recommendation to generate one and install it locally.
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <p className="view-note">
        {items.length} skill{items.length === 1 ? '' : 's'} generated · {items.filter(s => s.installed_locally).length} installed locally.
        Select one to see what it does.
      </p>
      <div className="skills-layout">
        <div className="skill-list">
          {items.map(skill => {
            const isActive = active?.skill_id === skill.skill_id
            return (
              <button
                key={skill.skill_id}
                type="button"
                className={`skill-pick ${isActive ? 'active' : ''}`}
                onClick={() => setSelected(skill.skill_id)}
              >
                <h4>{skill.name}</h4>
                <div className="skill-pick-meta">
                  <span>{skill.step_count} steps</span>
                  <span>· {skill.invocations} runs</span>
                  <span className={`dot-status status-${skill.status}`}>{skill.status}</span>
                </div>
                <div className="rec-apps">
                  {skill.source_apps.map(app => (
                    <SourceChip key={app} source={app} />
                  ))}
                  {skill.installed_locally ? <span className="local-pill is-local">local</span> : null}
                </div>
              </button>
            )
          })}
        </div>
        {active ? <SkillDetail skill={active} /> : null}
      </div>
    </div>
  )
}
