import { useState, useEffect, useRef } from 'react'
import type { ExecutionEvent } from '../types/skill'

interface UseSkillStreamResult {
  events: ExecutionEvent[]
  activeStepIndex: number   // index of current step (from latest step_started); -1 if none yet
  status: 'idle' | 'connecting' | 'streaming' | 'done' | 'error'
  error?: string
}

export function useSkillStream(matchId: string | null): UseSkillStreamResult {
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [activeStepIndex, setActiveStepIndex] = useState(-1)
  const [status, setStatus] = useState<UseSkillStreamResult['status']>('idle')
  const [error, setError] = useState<string>()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!matchId) return

    setStatus('connecting')
    setEvents([])
    setActiveStepIndex(-1)

    const es = new EventSource(`/api/skills/matches/${matchId}/stream`)
    esRef.current = es

    es.onopen = () => setStatus('streaming')

    es.onmessage = (e) => {
      try {
        const event: ExecutionEvent = JSON.parse(e.data)
        setEvents(prev => [...prev, event])

        if (event.type === 'step_started') {
          setActiveStepIndex(event.step_index)
        } else if (event.type === 'execution_complete') {
          setStatus('done')
          es.close()
        }
      } catch {
        // ignore malformed events
      }
    }

    es.onerror = () => {
      setStatus('error')
      setError('Connection lost')
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [matchId])

  return { events, activeStepIndex, status, error }
}
