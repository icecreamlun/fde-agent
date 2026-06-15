import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecommendations, getSkills, getWorkflows } from './api/observatory'
import { OverviewView } from './views/OverviewView'
import { RecommendationsView } from './views/RecommendationsView'
import { SkillsView } from './views/SkillsView'
import { WorkflowsView } from './views/WorkflowsView'
import { ActivityView } from './views/ActivityView'
import { ConnectionsView } from './views/ConnectionsView'

type ViewId = 'connections' | 'activity' | 'recommendations' | 'skills' | 'workflows' | 'overview'

// Ordered to match the user journey: connect → observe → skill ideas → your skills → org workflows → report.
const NAV: { id: ViewId; icon: string; label: string; hint: string }[] = [
  { id: 'connections', icon: '🔌', label: 'Connections', hint: '1 · Connect your tools' },
  { id: 'activity', icon: '📡', label: 'Activity', hint: '2 · What we observe' },
  { id: 'recommendations', icon: '✨', label: 'Recommendations', hint: '3 · Tasks to turn into skills' },
  { id: 'skills', icon: '🧩', label: 'Skills', hint: '4 · Your generated skills' },
  { id: 'workflows', icon: '🗺️', label: 'Workflows', hint: '5 · Org workflows to deploy' },
  { id: 'overview', icon: '📊', label: 'Overview', hint: '6 · Weekly FDE report' },
]

const TITLES: Record<ViewId, string> = {
  connections: 'Connected sources',
  activity: 'Live activity',
  recommendations: 'Tasks to turn into skills',
  skills: 'Your skills',
  workflows: 'Org workflows to deploy',
  overview: 'Weekly FDE report',
}

export default function App() {
  const [view, setView] = useState<ViewId>('connections')

  // Lightweight queries for the sidebar count badges (shared cache with views).
  const recommendations = useQuery({ queryKey: ['recommendations'], queryFn: getRecommendations })
  const skills = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: getWorkflows })

  const badges: Partial<Record<ViewId, number>> = {
    recommendations: recommendations.data?.filter(r => r.status !== 'accepted').length,
    skills: skills.data?.length,
    workflows: workflows.data?.length,
  }

  return (
    <div className="fde-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">In-house FDE</p>
          <h1>Auto-FDE</h1>
        </div>
        <nav className="nav">
          {NAV.map(item => {
            const badge = badges[item.id]
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-text">
                  <span className="nav-label">
                    {item.label}
                    {badge ? <span className="nav-badge">{badge}</span> : null}
                  </span>
                  <span className="nav-hint">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" /> Listening
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h2 className="content-title">{TITLES[view]}</h2>
        </header>
        {view === 'connections' ? <ConnectionsView /> : null}
        {view === 'activity' ? <ActivityView /> : null}
        {view === 'recommendations' ? <RecommendationsView /> : null}
        {view === 'skills' ? <SkillsView /> : null}
        {view === 'workflows' ? <WorkflowsView /> : null}
        {view === 'overview' ? <OverviewView /> : null}
      </main>
    </div>
  )
}
