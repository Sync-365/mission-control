import { join } from 'node:path'

export const PROJECT_WORKDIR_META_KEY = 'project_workdir'

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

export function withResolvedProjectWorkdir<T extends { slug?: string | null; name?: string | null; metadata?: unknown }>(project: T): T & { project_workdir: string; metadata: Record<string, unknown> } {
  const metadata = safeParseProjectMetadata(project.metadata)
  return {
    ...project,
    metadata,
    project_workdir: resolveProjectWorkdir({ ...project, metadata }),
  }
}
