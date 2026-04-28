/**
 * Helpers for agent card display — extracted for testability.
 */

/** Strip provider prefix from model ID: "anthropic/claude-opus-4-5" → "claude-opus-4-5" */
export function formatModelName(config: any): string | null {
  const model = config?.model
  const primary = typeof model === 'string'
    ? model
    : typeof model?.primary === 'string'
      ? model.primary
      : typeof config?.dispatchModel === 'string'
        ? config.dispatchModel
        : typeof config?.model_primary === 'string'
          ? config.model_primary
          : null
  if (!primary) return null
  const parts = primary.split('/')
  return parts[parts.length - 1]
}

/** Resolve a concise runtime label for agent cards. */
export function formatRuntimeName(agent: { runtime_type?: string | null; config?: any }): string {
  const cfg = agent.config || {}
  const runtime = String(
    agent.runtime_type
      || cfg.runtime_type
      || cfg.runtime?.type
      || (typeof cfg.runtime === 'string' ? cfg.runtime : '')
      || (cfg.hermesProfile ? 'hermes' : '')
      || 'openclaw'
  ).trim()
  if (!runtime) return 'openclaw'
  if (runtime === 'profile' || runtime === 'custom') return runtime
  return runtime.toLowerCase()
}

export interface TaskStats {
  total: number
  assigned: number
  in_progress: number
  quality_review: number
  done: number
  completed: number
}

export interface TaskStatPart {
  label: string
  count: number
  color?: string
}

/** Build inline task stat parts from agent taskStats, omitting zero counts. */
export function buildTaskStatParts(stats: TaskStats | undefined | null): TaskStatPart[] | null {
  if (!stats) return null
  const parts: TaskStatPart[] = []
  if (stats.assigned) parts.push({ label: 'assigned', count: stats.assigned })
  if (stats.in_progress) parts.push({ label: 'active', count: stats.in_progress, color: 'text-amber-300' })
  if (stats.quality_review) parts.push({ label: 'review', count: stats.quality_review, color: 'text-violet-300' })
  if (stats.done) parts.push({ label: 'done', count: stats.done, color: 'text-emerald-300' })
  return parts.length > 0 ? parts : null
}

/** Extract WebSocket host from connection URL for tooltip display. */
export function extractWsHost(url: string | undefined): string {
  if (!url) return '—'
  try {
    return new URL(url.replace(/^ws/, 'http')).host
  } catch {
    return '—'
  }
}
