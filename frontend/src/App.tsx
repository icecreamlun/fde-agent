import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptRecommendation,
  getConnections,
  getObservations,
  getRecommendations,
  getWeeklyReport,
} from './api/observatory'
import type { AcceptResult, ConnectionStatus, Observation, Recommendation } from './api/observatory'

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const hours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`

function timeAgo(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Math.max(0, Date.now() - then)
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const SOURCE_LABEL: Record<string, string> = { gmail: 'Gmail', excel: 'Excel', system: 'System' }

function SourceChip({ source }: { source: string }) {
  return <span className={`source-chip source-${source}`}>{SOURCE_LABEL[source] ?? source}</span>
}

function ConnectionCard({ conn }: { conn: ConnectionStatus }) {
  return (
    <div className="conn-card">
      <div className="conn-head">
        <SourceChip source={conn.id} />
        <span className="conn-status">
          <span className="conn-dot" /> {conn.status}
        </span>
      </div>
      <p className="conn-desc">{conn.description}</p>
      <div className="conn-meta">
        <span>{conn.event_count} events observed</span>
        {conn.last_event_at ? <span>· last {timeAgo(conn.last_event_at)}</span> : null}
      </div>
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  )
}

function RecommendationCard({
  rec,
  onAccept,
  accepting,
  result,
  error,
}: {
  rec: Recommendation
  onAccept: (id: string) => void
  accepting: boolean
  result?: AcceptResult
  error?: string
}) {
  const installed = rec.status === 'accepted' || result?.status === 'installed'
  return (
    <article className={`rec-card ${installed ? 'rec-installed' : ''}`}>
      <header className="rec-head">
        <div>
          <h3>{rec.title}</h3>
          <div className="rec-apps">
            {rec.source_apps.map(app => (
              <SourceChip key={app} source={app} />
            ))}
            <span className="rec-confidence">{Math.round(rec.confidence * 100)}% confidence</span>
          </div>
        </div>
        {installed ? <span className="rec-badge">Installed</span> : null}
      </header>

      <div className="rec-metrics">
        <Metric label="Time saved / wk" value={hours(rec.roi.time_saved_minutes_per_week)} />
        <Metric label="Cost saved / wk" value={usd(rec.roi.cost_saved_usd_per_week)} sub={`${usd(rec.roi.cost_saved_usd_per_year)}/yr`} />
        <Metric label="Frequency" value={rec.roi.frequency.split(' ')[0]} sub={`${rec.roi.occurrences_observed} seen`} />
        <Metric label="Model cost / wk" value={usd(rec.roi.model_cost_usd_per_week)} />
      </div>

      <p className="rec-trigger">
        <strong>Trigger:</strong> {rec.trigger || '—'}
        {rec.target_artifact ? <> · updates <code>{rec.target_artifact}</code>{rec.target_sheet ? ` / ${rec.target_sheet}` : ''}</> : null}
      </p>

      {rec.actions.length ? (
        <details className="rec-actions">
          <summary>{rec.actions.length} steps in the proposed skill</summary>
          <ol>
            {rec.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </details>
      ) : null}

      <footer className="rec-foot">
        {installed ? (
          <div className="installed-banner">
            <strong>Skill installed locally.</strong>
            <code>{result?.local_path ?? '~/.claude/skills'}</code>
            {result?.skill_md_preview ? (
              <details className="skill-preview">
                <summary>Preview SKILL.md</summary>
                <pre>{result.skill_md_preview}…</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <button className="accept-btn" type="button" disabled={accepting} onClick={() => onAccept(rec.id)}>
            {accepting ? 'Generating skill…' : 'Accept & install skill'}
          </button>
        )}
        {error ? <p className="rec-error">{error}</p> : null}
      </footer>
    </article>
  )
}

function ObservationRow({ obs }: { obs: Observation }) {
  return (
    <li className="feed-row">
      <SourceChip source={obs.source} />
      <span className="feed-summary">{obs.summary}</span>
      <span className="feed-time">{timeAgo(obs.ts)}</span>
    </li>
  )
}

export default function App() {
  const queryClient = useQueryClient()
  const [results, setResults] = useState<Record<string, AcceptResult>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const connections = useQuery({ queryKey: ['connections'], queryFn: getConnections, refetchInterval: 15_000 })
  const observations = useQuery({ queryKey: ['observations'], queryFn: () => getObservations(20), refetchInterval: 15_000 })
  const recommendations = useQuery({ queryKey: ['recommendations'], queryFn: getRecommendations })
  const report = useQuery({ queryKey: ['weekly-report'], queryFn: getWeeklyReport })

  const accept = useMutation({
    mutationFn: acceptRecommendation,
    onSuccess: async (result, id) => {
      if (result.status === 'installed') {
        setResults(prev => ({ ...prev, [id]: result }))
        setErrors(prev => ({ ...prev, [id]: '' }))
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
          queryClient.invalidateQueries({ queryKey: ['weekly-report'] }),
          queryClient.invalidateQueries({ queryKey: ['connections'] }),
        ])
      } else {
        setErrors(prev => ({ ...prev, [id]: 'The skill could not be generated. Check the API logs.' }))
      }
    },
    onError: (err, id) => {
      setErrors(prev => ({ ...prev, [id]: err instanceof Error ? err.message : 'Accept failed.' }))
    },
  })

  const recs = recommendations.data ?? []
  const totals = report.data?.totals

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">In-house Forward Deployed Engineer</p>
          <h1>Auto-FDE</h1>
          <p className="header-subtitle">
            We watch your connected tools, learn how your team actually works, and recommend what to automate —
            as reviewable skills you install locally. We never run anything ourselves.
          </p>
        </div>
        <div className="header-actions">
          <div className="status-pill status-streaming">
            <span className="status-dot" />
            <span>Listening</span>
          </div>
        </div>
      </header>

      {/* Connections */}
      <section className="fde-section">
        <h2 className="fde-section-title">Connected sources</h2>
        <div className="conn-grid">
          {(connections.data ?? []).map(conn => (
            <ConnectionCard key={conn.id} conn={conn} />
          ))}
          {connections.isLoading ? <div className="empty-state">Connecting…</div> : null}
        </div>
      </section>

      <main className="fde-main">
        {/* Left: weekly report + recommendations */}
        <section className="fde-col-main">
          <div className="report-card">
            <div className="report-head">
              <h2 className="fde-section-title">Weekly FDE report</h2>
              {report.data ? <span className="report-period">{report.data.period}</span> : null}
            </div>
            <p className="report-summary">
              {report.isLoading ? 'Generating this week’s advisory…' : report.data?.summary}
            </p>
            {totals ? (
              <div className="totals-grid">
                <Metric label="Workflows found" value={String(totals.workflows_found)} sub={`${totals.workflows_accepted} accepted`} />
                <Metric label="Time saved / wk" value={hours(totals.time_saved_minutes_per_week)} />
                <Metric label="Cost saved / wk" value={usd(totals.cost_saved_usd_per_week)} sub={`${usd(totals.cost_saved_usd_per_year)}/yr`} />
                <Metric label="Model cost / wk" value={usd(totals.model_cost_usd_per_week)} />
              </div>
            ) : null}
          </div>

          <h2 className="fde-section-title">Recommended workflows</h2>
          <div className="rec-list">
            {recommendations.isLoading ? <div className="empty-state">Mining your activity for repeated workflows…</div> : null}
            {!recommendations.isLoading && recs.length === 0 ? (
              <div className="empty-state">No repeated workflows detected yet. Keep working — we’re watching.</div>
            ) : null}
            {recs.map(rec => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onAccept={accept.mutate}
                accepting={accept.isPending && accept.variables === rec.id}
                result={results[rec.id]}
                error={errors[rec.id]}
              />
            ))}
          </div>
        </section>

        {/* Right: live observation feed */}
        <aside className="fde-col-side">
          <h2 className="fde-section-title">Live activity</h2>
          <div className="feed-card">
            <ul className="feed-list">
              {(observations.data ?? []).map(obs => (
                <ObservationRow key={`${obs.id}-${obs.ts}`} obs={obs} />
              ))}
              {observations.isLoading ? <li className="empty-state">Loading activity…</li> : null}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}
