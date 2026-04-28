import { join } from 'node:path'

export const PROJECT_WORKDIR_META_KEY = 'project_workdir'
export const PROJECT_ENV_META_KEY = 'project_env'

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function defaultProjectWorkdir(slugOrName: string): string {
  const slug = slugify(slugOrName) || 'project'
  const root = process.env.MC_PROJECTS_DIR || join(process.cwd(), 'project-workspaces')
  return join(root, slug)
}

export function safeParseProjectMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function resolveProjectWorkdir(project: { slug?: string | null; name?: string | null; metadata?: unknown }): string {
  const metadata = safeParseProjectMetadata(project.metadata)
  const configured = metadata[PROJECT_WORKDIR_META_KEY]
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  return defaultProjectWorkdir(project.slug || project.name || 'project')
}

export function sanitizeProjectEnv(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const env: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim().toUpperCase()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue
    if (rawValue == null) continue
    const value = String(rawValue).trim()
    if (!value) continue
    env[key] = value
  }
  return env
}

export function withResolvedProjectWorkdir<T extends { slug?: string | null; name?: string | null; metadata?: unknown }>(project: T): T & { project_workdir: string; metadata: Record<string, unknown>; project_env: Record<string, string> } {
  const metadata = safeParseProjectMetadata(project.metadata)
  return {
    ...project,
    metadata,
    project_workdir: resolveProjectWorkdir({ ...project, metadata }),
    project_env: sanitizeProjectEnv(metadata[PROJECT_ENV_META_KEY]),
  }
}
