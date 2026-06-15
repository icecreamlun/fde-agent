import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecommendations, getSkills } from './api/observatory'
import { OverviewView } from './views/OverviewView'
import { RecommendationsView } from './views/RecommendationsView'
import { SkillsView } from './views/SkillsView'
import { ActivityView } from './views/ActivityView'
import { ConnectionsView } from './views/ConnectionsView'

type ViewId = 'overview' | 'recommendations' | 'skills' | 'activity' | 'connections'

const NAV: { id: ViewId; icon: string; label: string; hint: string }[] = [
  { id: 'overview', icon: '📊', label: 'Overview', hint: 'Weekly FDE report' },
  { id: 'recommendations', icon: '✨', label: 'Recommendations', hint: 'Workflows to automate' },
  { id: 'skills', icon: '🧩', label: 'Skills', hint: 'Generated & installed' },
  { id: 'activity', icon: '📡', label: 'Activity', hint: 'Live event feed' },
  { id: 'connections', icon: '🔌', label: 'Connections', hint: 'Connected sources' },
]

const TITLES: Record<ViewId, string> = {
  overview: 'Overview',
  recommendations: 'Recommended workflows',
  skills: 'Skills',
  activity: 'Live activity',
  connections: 'Connected sources',
}

export default function App() {
  const [view, setView] = useState<ViewId>('overview')

  // Lightweight queries for the sidebar count badges (shared cache with views).
  const recommendations = useQuery({ queryKey: ['recommendations'], queryFn: getRecommendations })
  const skills = useQuery({ queryKey: ['skills'], queryFn: getSkills })

  const badges: Partial<Record<ViewId, number>> = {
    recommendations: recommendations.data?.filter(r => r.status !== 'accepted').length,
    skills: skills.data?.length,
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
        {view === 'overview' ? <OverviewView /> : null}
        {view === 'recommendations' ? <RecommendationsView /> : null}
        {view === 'skills' ? <SkillsView /> : null}
        {view === 'activity' ? <ActivityView /> : null}
        {view === 'connections' ? <ConnectionsView /> : null}
      </main>
    </div>
  )
}
