'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface FileRoot {
  id: string
  label: string
  type: string
  path: string
  project_id?: number
}

interface FileItem {
  name: string
  path: string
  type: 'directory' | 'file'
  size: number
  modified: number
}

interface FilesResponse {
  roots?: FileRoot[]
  root?: FileRoot
  path?: string
  type?: 'directory' | 'file'
  items?: FileItem[]
  content?: string
  size?: number
  modified?: number
  truncated?: boolean
  error?: string
}

function formatBytes(value?: number): string {
  const bytes = value || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(value?: number): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function parentPath(current: string): string {
  const clean = current.replace(/\/+$/, '')
  const idx = clean.lastIndexOf('/')
  if (idx <= 0) return ''
  return clean.slice(0, idx)
}

function fileLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return 'text'
  const map: Record<string, string> = {
    md: 'markdown', mdx: 'markdown', json: 'json', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', csv: 'csv', txt: 'text', env: 'env', sh: 'bash', py: 'python',
  }
  return map[ext] || ext
}

export function WorkspaceFilesPanel() {
  const [roots, setRoots] = useState<FileRoot[]>([])
  const [selectedRoot, setSelectedRoot] = useState<string>('')
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState<FileItem[]>([])
  const [content, setContent] = useState('')
  const [selectedFile, setSelectedFile] = useState<{ path: string; size?: number; modified?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const selectedRootInfo = roots.find((root) => root.id === selectedRoot) || null

  const loadRoots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/files')
      const data = (await res.json()) as FilesResponse
      if (!res.ok) throw new Error(data.error || 'Failed to load file roots')
      const nextRoots = data.roots || []
      setRoots(nextRoots)
      const preferred = nextRoots.find((root) => root.type === 'project') || nextRoots[0]
      if (preferred) setSelectedRoot(preferred.id)
    } catch (err) {
      setRoots([])
      setError((err as Error).message || 'Failed to load file roots')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPath = useCallback(async (rootId: string, path: string) => {
    if (!rootId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ root: rootId, path })
      const res = await fetch(`/api/files?${params.toString()}`)
      const data = (await res.json()) as FilesResponse
      if (!res.ok) throw new Error(data.error || 'Failed to load path')
      if (data.type === 'file') {
        setContent(data.content || '')
        setSelectedFile({ path: data.path || path, size: data.size, modified: data.modified })
      } else {
        setItems(data.items || [])
        setCurrentPath(data.path || '')
        setContent('')
        setSelectedFile(null)
        if (data.truncated) setError('Directory listing truncated to the first 500 entries.')
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load path')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRoots() }, [loadRoots])

  useEffect(() => {
    if (selectedRoot) {
      setCurrentPath('')
      setItems([])
      setContent('')
      setSelectedFile(null)
      loadPath(selectedRoot, '')
    }
  }, [selectedRoot, loadPath])

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
  }, [items, filter])

  const breadcrumbs = useMemo(() => {
    const parts = currentPath ? currentPath.split('/').filter(Boolean) : []
    return parts.map((part, index) => ({ label: part, path: parts.slice(0, index + 1).join('/') }))
  }, [currentPath])

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Files</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse project workspaces, shared OpenClaw workspaces, and files referenced by agents.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={selectedRoot}
            onChange={(event) => setSelectedRoot(event.target.value)}
            className="bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm min-w-[260px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => selectedRoot && loadPath(selectedRoot, currentPath)} disabled={loading || !selectedRoot}>Refresh</Button>
        </div>
      </div>

      {selectedRootInfo && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground font-mono break-all">
          {selectedRootInfo.path}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 px-3 py-2 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4 min-h-[640px]">
        <section className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[520px]">
          <div className="p-3 border-b border-border space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <button className="text-primary hover:underline" onClick={() => selectedRoot && loadPath(selectedRoot, '')}>root</button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.path} className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground">/</span>
                  <button className="text-primary hover:underline truncate" onClick={() => selectedRoot && loadPath(selectedRoot, crumb.path)}>{crumb.label}</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter current folder…"
                className="flex-1 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <Button variant="ghost" size="sm" onClick={() => selectedRoot && loadPath(selectedRoot, parentPath(currentPath))} disabled={loading || !currentPath}>Up</Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-border/60">
            {loading && items.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Loading files…</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No files found in this folder.</div>
            ) : filteredItems.map((item) => (
              <button
                key={`${item.type}:${item.path}`}
                onClick={() => selectedRoot && loadPath(selectedRoot, item.path)}
                className="w-full text-left px-3 py-2.5 hover:bg-surface-1 transition-colors flex items-center gap-3"
              >
                <span className="text-lg leading-none">{item.type === 'directory' ? '📁' : '📄'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground truncate">{item.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{item.type === 'file' ? `${formatBytes(item.size)} · ${formatTime(item.modified)}` : item.path}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[520px]">
          <div className="p-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{selectedFile ? selectedFile.path : 'Select a file'}</div>
              <div className="text-xs text-muted-foreground">{selectedFile ? `${fileLanguage(selectedFile.path)} · ${formatBytes(selectedFile.size)} · ${formatTime(selectedFile.modified)}` : 'Text files up to 1MB can be previewed here.'}</div>
            </div>
            {selectedFile && (
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(`${selectedRootInfo?.path}/${selectedFile.path}`)}>Copy path</Button>
            )}
          </div>
          <div className="flex-1 overflow-auto bg-background/50">
            {selectedFile ? (
              <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground">{content}</pre>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                Pick a project/workspace root, then open a Markdown, JSON, CSV, code, or text file referenced by an agent.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
