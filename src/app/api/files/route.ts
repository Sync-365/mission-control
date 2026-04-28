import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'
import { resolveProjectWorkdir, safeParseProjectMetadata } from '@/lib/project-workdir'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_DIR_ENTRIES = 500
const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.turbo', 'coverage'])

interface FileRoot {
  id: string
  label: string
  type: 'project' | 'workspace' | 'agents' | 'project-root'
  path: string
  project_id?: number
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  return input
}

function openclawHome(): string {
  return expandHome(process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw'))
}

async function existsDir(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function buildRoots(workspaceId: number): Promise<FileRoot[]> {
  const db = getDatabase()
  const projects = db.prepare(`
    SELECT id, name, slug, metadata
    FROM projects
    WHERE workspace_id = ? AND status != 'archived'
    ORDER BY name COLLATE NOCASE ASC
  `).all(workspaceId) as Array<{ id: number; name: string; slug: string | null; metadata: string | null }>

  const roots: FileRoot[] = []
  const seen = new Set<string>()
  const addRoot = async (root: FileRoot) => {
    const abs = path.resolve(expandHome(root.path))
    if (seen.has(abs)) return
    if (!(await existsDir(abs))) return
    seen.add(abs)
    roots.push({ ...root, path: abs })
  }

  for (const project of projects) {
    await addRoot({
      id: `project:${project.id}`,
      label: project.name || project.slug || `Project ${project.id}`,
      type: 'project',
      path: resolveProjectWorkdir({ slug: project.slug, name: project.name, metadata: safeParseProjectMetadata(project.metadata) }),
      project_id: project.id,
    })
  }

  const home = openclawHome()
  await addRoot({ id: 'project-root', label: 'Project workspaces', type: 'project-root', path: process.env.MC_PROJECTS_DIR || path.join(process.cwd(), 'project-workspaces') })
  await addRoot({ id: 'openclaw-workspace', label: 'OpenClaw workspace', type: 'workspace', path: path.join(home, 'workspace') })
  await addRoot({ id: 'openclaw-workspaces', label: 'OpenClaw agent workspaces', type: 'workspace', path: path.join(home, 'workspaces') })
  await addRoot({ id: 'openclaw-agents', label: 'OpenClaw agents', type: 'agents', path: path.join(home, 'agents') })

  return roots
}

function resolveWithinRoot(rootPath: string, relPath: string): string {
  const normalizedRel = relPath.replace(/^\/+/, '')
  const absRoot = path.resolve(rootPath)
  const resolved = path.resolve(absRoot, normalizedRel || '.')
  if (resolved !== absRoot && !resolved.startsWith(absRoot + path.sep)) {
    throw new Error('Path escapes selected root')
  }
  return resolved
}

function isLikelyText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  let suspicious = 0
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue
    if (byte < 32) suspicious += 1
  }
  return suspicious / Math.max(sample.length, 1) < 0.02
}

function displayPath(rootPath: string, absPath: string): string {
  const rel = path.relative(rootPath, absPath)
  return rel ? rel.split(path.sep).join('/') : ''
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const workspaceId = auth.user.workspace_id
    const roots = await buildRoots(workspaceId)
    const { searchParams } = new URL(request.url)
    const rootId = searchParams.get('root') || ''
    const relPath = searchParams.get('path') || ''

    if (!rootId) {
      return NextResponse.json({ roots })
    }

    const root = roots.find((candidate) => candidate.id === rootId)
    if (!root) return NextResponse.json({ error: 'Unknown or unavailable file root', roots }, { status: 404 })

    const target = resolveWithinRoot(root.path, relPath)
    const stat = await fs.stat(target)

    if (stat.isDirectory()) {
      const entries = await fs.readdir(target, { withFileTypes: true })
      const visible = entries
        .filter((entry) => !HIDDEN_DIRS.has(entry.name))
        .slice(0, MAX_DIR_ENTRIES)

      const items = await Promise.all(visible.map(async (entry) => {
        const abs = path.join(target, entry.name)
        const entryStat = await fs.stat(abs).catch(() => null)
        return {
          name: entry.name,
          path: displayPath(root.path, abs),
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entryStat?.size ?? 0,
          modified: entryStat?.mtimeMs ?? 0,
        }
      }))

      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return NextResponse.json({ root, path: displayPath(root.path, target), type: 'directory', items, truncated: entries.length > MAX_DIR_ENTRIES })
    }

    if (!stat.isFile()) return NextResponse.json({ error: 'Path is not a readable file or directory' }, { status: 400 })
    if (stat.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File is too large to preview (${stat.size} bytes)`, root, path: displayPath(root.path, target), type: 'file', size: stat.size }, { status: 413 })
    }

    const buffer = await fs.readFile(target)
    if (!isLikelyText(buffer)) {
      return NextResponse.json({ error: 'Binary file preview is not supported', root, path: displayPath(root.path, target), type: 'file', size: stat.size }, { status: 415 })
    }

    return NextResponse.json({
      root,
      path: displayPath(root.path, target),
      type: 'file',
      content: buffer.toString('utf8'),
      size: stat.size,
      modified: stat.mtimeMs,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/files error')
    return NextResponse.json({ error: (error as Error).message || 'Failed to read files' }, { status: 500 })
  }
}
