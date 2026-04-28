import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireRole } from '@/lib/auth'
import { resolveWithin } from '@/lib/paths'
import { checkSkillSecurity } from '@/lib/skill-registry'

interface SkillSummary {
  id: string
  name: string
  source: string
  path: string
  description?: string
  registry_slug?: string | null
  security_status?: string | null
}

type SkillRoot = { source: string; path: string }

const execFileAsync = promisify(execFile)

function resolveSkillRoot(
  envName: string,
  fallback: string,
): string {
  const override = process.env[envName]
  return override && override.trim().length > 0 ? override.trim() : fallback
}

async function pathReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function extractDescription(skillPath: string): Promise<string | undefined> {
  const skillDocPath = join(skillPath, 'SKILL.md')
  if (!(await pathReadable(skillDocPath))) return undefined
  try {
    const content = await readFile(skillDocPath, 'utf8')
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean)
    const firstParagraph = lines.find((line) => !line.startsWith('#'))
    if (!firstParagraph) return undefined
    return firstParagraph.length > 220 ? `${firstParagraph.slice(0, 217)}...` : firstParagraph
  } catch {
    return undefined
  }
}

async function collectSkillsFromDir(baseDir: string, source: string): Promise<SkillSummary[]> {
  if (!(await pathReadable(baseDir))) return []
  try {
    const entries = await readdir(baseDir, { withFileTypes: true })
    const out: SkillSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(baseDir, entry.name)
      const skillDocPath = join(skillPath, 'SKILL.md')
      if (!(await pathReadable(skillDocPath))) continue
      out.push({
        id: `${source}:${entry.name}`,
        name: entry.name,
        source,
        path: skillPath,
        description: await extractDescription(skillPath),
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

function getSkillRoots(): SkillRoot[] {
  const home = homedir()
  const cwd = process.cwd()
  const roots: SkillRoot[] = [
    { source: 'user-agents', path: resolveSkillRoot('MC_SKILLS_USER_AGENTS_DIR', join(home, '.agents', 'skills')) },
    { source: 'user-codex', path: resolveSkillRoot('MC_SKILLS_USER_CODEX_DIR', join(home, '.codex', 'skills')) },
    { source: 'project-agents', path: resolveSkillRoot('MC_SKILLS_PROJECT_AGENTS_DIR', join(cwd, '.agents', 'skills')) },
    { source: 'project-codex', path: resolveSkillRoot('MC_SKILLS_PROJECT_CODEX_DIR', join(cwd, '.codex', 'skills')) },
  ]
  // Add OpenClaw gateway skill roots when configured
  const openclawState = process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_HOME || join(home, '.openclaw')
  const openclawSkills = resolveSkillRoot('MC_SKILLS_OPENCLAW_DIR', join(openclawState, 'skills'))
  roots.push({ source: 'openclaw', path: openclawSkills })

  // Add OpenClaw workspace-local skills (takes precedence when names conflict)
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR || process.env.MISSION_CONTROL_WORKSPACE_DIR || join(openclawState, 'workspace')
  const workspaceSkills = resolveSkillRoot('MC_SKILLS_WORKSPACE_DIR', join(workspaceDir, 'skills'))
  roots.push({ source: 'workspace', path: workspaceSkills })

  // Dynamic: scan for workspace-<agent> directories
  try {
    const { readdirSync, existsSync } = require('node:fs') as typeof import('node:fs')
    const entries = readdirSync(openclawState) as string[]
    for (const entry of entries) {
      if (!entry.startsWith('workspace-')) continue
      const skillsDir = join(openclawState, entry, 'skills')
      if (existsSync(skillsDir)) {
        const agentName = entry.replace('workspace-', '')
        roots.push({ source: `workspace-${agentName}`, path: skillsDir })
      }
    }
  } catch {
    // openclawBase may not exist
  }

  return roots
}

function normalizeSkillName(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return null
  return value
}

function getRootBySource(roots: SkillRoot[], sourceRaw: string | null): SkillRoot | null {
  const source = String(sourceRaw || '').trim()
  if (!source) return null
  return roots.find((r) => r.source === source) || null
}

async function upsertSkill(root: SkillRoot, name: string, content: string) {
  const skillPath = resolveWithin(root.path, name)
  const skillDocPath = resolveWithin(skillPath, 'SKILL.md')
  await mkdir(skillPath, { recursive: true })
  await writeFile(skillDocPath, content, 'utf8')

  // Update DB hash so next sync cycle detects our write
  try {
    const { getDatabase } = await import('@/lib/db')
    const db = getDatabase()
    const hash = createHash('sha256').update(content, 'utf8').digest('hex')
    const now = new Date().toISOString()
    const descLines = content.split('\n').map(l => l.trim()).filter(Boolean)
    const desc = descLines.find(l => !l.startsWith('#'))
    db.prepare(`
      INSERT INTO skills (name, source, path, description, content_hash, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, name) DO UPDATE SET
        path = excluded.path,
        description = excluded.description,
        content_hash = excluded.content_hash,
        updated_at = excluded.updated_at
    `).run(
      name,
      root.source,
      skillPath,
      desc ? (desc.length > 220 ? `${desc.slice(0, 217)}...` : desc) : null,
      hash,
      now,
      now
    )
  } catch { /* DB not ready yet — sync will catch it */ }

  return { skillPath, skillDocPath }
}

async function extractSkillZip(root: SkillRoot, file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Upload must be a .zip file')
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Zip file is too large (max 50 MB)')
  }

  await mkdir(root.path, { recursive: true })
  const tmpDir = await mkdtemp(join(tmpdir(), 'mc-skills-zip-'))
  const zipPath = join(tmpDir, 'upload.zip')
  try {
    await writeFile(zipPath, Buffer.from(await file.arrayBuffer()))
    const script = String.raw`
import json, os, stat, sys, zipfile
zip_path, dest = sys.argv[1], sys.argv[2]
max_files = 500
max_total = 50 * 1024 * 1024
with zipfile.ZipFile(zip_path) as zf:
    infos = [i for i in zf.infolist() if not i.filename.endswith('/')]
    if len(infos) > max_files:
        raise SystemExit(f'Too many files in zip (max {max_files})')
    total = 0
    extracted = []
    for info in infos:
        name = info.filename.replace('\\', '/')
        parts = [p for p in name.split('/') if p and p != '.']
        if not parts or name.startswith('/') or any(p == '..' for p in parts):
            raise SystemExit(f'Unsafe zip path: {info.filename}')
        if parts[0] == '__MACOSX' or parts[-1] == '.DS_Store':
            continue
        mode = (info.external_attr >> 16) & 0o170000
        if mode == stat.S_IFLNK:
            raise SystemExit(f'Symlinks are not allowed in skill zips: {info.filename}')
        total += info.file_size
        if total > max_total:
            raise SystemExit(f'Uncompressed zip contents too large (max {max_total} bytes)')
        target = os.path.abspath(os.path.join(dest, *parts))
        dest_abs = os.path.abspath(dest)
        if target != dest_abs and not target.startswith(dest_abs + os.sep):
            raise SystemExit(f'Unsafe extraction target: {info.filename}')
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with zf.open(info) as src, open(target, 'wb') as out:
            out.write(src.read())
        extracted.append('/'.join(parts))
print(json.dumps({'extracted': extracted, 'count': len(extracted)}))
`
    const { stdout } = await execFileAsync('python3', ['-c', script, zipPath, root.path], { timeout: 30000, maxBuffer: 1024 * 1024 })
    return JSON.parse(stdout || '{}') as { extracted?: string[]; count?: number }
  } finally {
    await unlink(zipPath).catch(() => {})
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function syncSkillRootToDB(root: SkillRoot) {
  try {
    const { getDatabase } = await import('@/lib/db')
    const db = getDatabase()
    const skills = await collectSkillsFromDir(root.path, root.source)
    const now = new Date().toISOString()
    for (const skill of skills) {
      const content = await readFile(join(skill.path, 'SKILL.md'), 'utf8')
      const hash = createHash('sha256').update(content, 'utf8').digest('hex')
      db.prepare(`
        INSERT INTO skills (name, source, path, description, content_hash, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, name) DO UPDATE SET
          path = excluded.path,
          description = excluded.description,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at
      `).run(skill.name, skill.source, skill.path, skill.description || null, hash, now, now)
    }
    return skills.length
  } catch {
    return null
  }
}

async function deleteSkill(root: SkillRoot, name: string) {
  const skillPath = resolveWithin(root.path, name)
  await rm(skillPath, { recursive: true, force: true })

  // Remove from DB
  try {
    const { getDatabase } = await import('@/lib/db')
    const db = getDatabase()
    db.prepare('DELETE FROM skills WHERE source = ? AND name = ?').run(root.source, name)
  } catch { /* best-effort */ }

  return { skillPath }
}

/**
 * Try to serve skill list from DB (fast path).
 * Falls back to filesystem scan if DB has no data yet.
 */
function getSkillsFromDB(): SkillSummary[] | null {
  try {
    const { getDatabase } = require('@/lib/db')
    const db = getDatabase()
    const rows = db.prepare('SELECT name, source, path, description, registry_slug, security_status FROM skills ORDER BY name').all() as Array<{
      name: string; source: string; path: string; description: string | null; registry_slug: string | null; security_status: string | null
    }>
    if (rows.length === 0) return null // DB empty — fall back to fs scan
    return rows.map(r => ({
      id: `${r.source}:${r.name}`,
      name: r.name,
      source: r.source,
      path: r.path,
      description: r.description || undefined,
      registry_slug: r.registry_slug,
      security_status: r.security_status,
    }))
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const roots = getSkillRoots()
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')

  if (mode === 'content') {
    const source = String(searchParams.get('source') || '')
    const name = normalizeSkillName(String(searchParams.get('name') || ''))
    if (!source || !name) {
      return NextResponse.json({ error: 'source and valid name are required' }, { status: 400 })
    }
    const root = roots.find((r) => r.source === source)
    if (!root) return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    const skillPath = join(root.path, name)
    const skillDocPath = join(skillPath, 'SKILL.md')
    if (!(await pathReadable(skillDocPath))) {
      return NextResponse.json({ error: 'SKILL.md not found' }, { status: 404 })
    }
    const content = await readFile(skillDocPath, 'utf8')

    // Run security check inline
    const security = checkSkillSecurity(content)

    return NextResponse.json({
      source,
      name,
      skillPath,
      skillDocPath,
      content,
      security,
    })
  }

  if (mode === 'check') {
    // Security-check a specific skill's content
    const source = String(searchParams.get('source') || '')
    const name = normalizeSkillName(String(searchParams.get('name') || ''))
    if (!source || !name) {
      return NextResponse.json({ error: 'source and valid name are required' }, { status: 400 })
    }
    const root = roots.find((r) => r.source === source)
    if (!root) return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    const skillPath = join(root.path, name)
    const skillDocPath = join(skillPath, 'SKILL.md')
    if (!(await pathReadable(skillDocPath))) {
      return NextResponse.json({ error: 'SKILL.md not found' }, { status: 404 })
    }
    const content = await readFile(skillDocPath, 'utf8')
    const security = checkSkillSecurity(content)

    // Update DB with security status
    try {
      const { getDatabase } = await import('@/lib/db')
      const db = getDatabase()
      db.prepare('UPDATE skills SET security_status = ?, updated_at = ? WHERE source = ? AND name = ?')
        .run(security.status, new Date().toISOString(), source, name)
    } catch { /* best-effort */ }

    return NextResponse.json({ source, name, security })
  }

  // Try DB-backed fast path first
  const dbSkills = getSkillsFromDB()
  if (dbSkills) {
    // Group by source for the groups response
    const groupMap = new Map<string, { source: string; path: string; skills: SkillSummary[] }>()
    for (const root of roots) {
      groupMap.set(root.source, { source: root.source, path: root.path, skills: [] })
    }
    for (const skill of dbSkills) {
      // Dynamically add workspace-* groups not already in roots
      if (!groupMap.has(skill.source) && skill.source.startsWith('workspace-')) {
        groupMap.set(skill.source, { source: skill.source, path: '', skills: [] })
      }
      const group = groupMap.get(skill.source)
      if (group) group.skills.push(skill)
    }

    const deduped = new Map<string, SkillSummary>()
    for (const skill of dbSkills) {
      if (!deduped.has(skill.name)) deduped.set(skill.name, skill)
    }

    return NextResponse.json({
      skills: Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name)),
      groups: Array.from(groupMap.values()),
      total: deduped.size,
    })
  }

  // Fallback: filesystem scan (first load before sync runs)
  const bySource = await Promise.all(
    roots.map(async (root) => ({
      source: root.source,
      path: root.path,
      skills: await collectSkillsFromDir(root.path, root.source),
    }))
  )

  const all = bySource.flatMap((group) => group.skills)
  const deduped = new Map<string, SkillSummary>()
  for (const skill of all) {
    if (!deduped.has(skill.name)) deduped.set(skill.name, skill)
  }

  return NextResponse.json({
    skills: Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name)),
    groups: bySource,
    total: deduped.size,
  })
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const roots = getSkillRoots()
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const root = getRootBySource(roots, String(form.get('source') || ''))
    const file = form.get('file')
    if (!root || !(file instanceof File)) {
      return NextResponse.json({ error: 'Valid source and zip file are required' }, { status: 400 })
    }
    try {
      const result = await extractSkillZip(root, file)
      const syncedSkills = await syncSkillRootToDB(root)
      return NextResponse.json({ ok: true, source: root.source, path: root.path, syncedSkills, ...result })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Failed to extract zip' }, { status: 400 })
    }
  }

  const body = await request.json().catch(() => ({}))
  const root = getRootBySource(roots, body?.source)
  const name = normalizeSkillName(String(body?.name || ''))
  const contentRaw = typeof body?.content === 'string' ? body.content : ''
  const content = contentRaw.trim() || `# ${name || 'skill'}\n\nDescribe this skill.\n`

  if (!root || !name) {
    return NextResponse.json({ error: 'Valid source and name are required' }, { status: 400 })
  }

  await mkdir(root.path, { recursive: true })
  const { skillPath, skillDocPath } = await upsertSkill(root, name, content)
  return NextResponse.json({ ok: true, source: root.source, name, skillPath, skillDocPath })
}

export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const roots = getSkillRoots()
  const body = await request.json().catch(() => ({}))
  const root = getRootBySource(roots, body?.source)
  const name = normalizeSkillName(String(body?.name || ''))
  const content = typeof body?.content === 'string' ? body.content : null

  if (!root || !name || content == null) {
    return NextResponse.json({ error: 'Valid source, name, and content are required' }, { status: 400 })
  }

  await mkdir(root.path, { recursive: true })
  const { skillPath, skillDocPath } = await upsertSkill(root, name, content)
  return NextResponse.json({ ok: true, source: root.source, name, skillPath, skillDocPath })
}

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const roots = getSkillRoots()
  const root = getRootBySource(roots, searchParams.get('source'))
  const name = normalizeSkillName(String(searchParams.get('name') || ''))
  if (!root || !name) {
    return NextResponse.json({ error: 'Valid source and name are required' }, { status: 400 })
  }

  const { skillPath } = await deleteSkill(root, name)
  return NextResponse.json({ ok: true, source: root.source, name, skillPath })
}

export const dynamic = 'force-dynamic'
