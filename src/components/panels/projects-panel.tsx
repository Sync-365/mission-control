'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useMissionControl, type Project } from '@/store'

type ProjectTab = 'details' | 'environment'

type EnvDraftRow = {
  id: string
  key: string
  value: string
}

function envToRows(env: Record<string, string> | undefined): EnvDraftRow[] {
  return Object.entries(env || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ id: `${key}-${Math.random().toString(36).slice(2)}`, key, value }))
}

function rowsToEnv(rows: EnvDraftRow[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim().toUpperCase()
    const value = row.value.trim()
    if (!key || !value) continue
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue
    env[key] = value
  }
  return env
}

function formatDateInput(epoch?: number): string {
  return epoch ? new Date(epoch * 1000).toISOString().split('T')[0] : ''
}

export function ProjectsPanel() {
  const { projects: storeProjects, fetchProjects, setActiveProject } = useMissionControl()
  const [projects, setProjects] = useState<Project[]>(storeProjects || [])
  const [selectedId, setSelectedId] = useState<number | null>(storeProjects?.[0]?.id ?? null)
  const [agents, setAgents] = useState<Array<{ id: number; name: string; role: string }>>([])
  const [tab, setTab] = useState<ProjectTab>('details')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', ticket_prefix: '', description: '' })
  const [detailDraft, setDetailDraft] = useState({
    name: '',
    slug: '',
    ticket_prefix: '',
    description: '',
    github_repo: '',
    github_default_branch: 'main',
    project_workdir: '',
    deadline: '',
    color: '',
    github_sync_enabled: false,
    assigned_agents: [] as string[],
  })
  const [envRows, setEnvRows] = useState<EnvDraftRow[]>([])

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedId) || projects[0] || null,
    [projects, selectedId]
  )

  const showFeedback = (ok: boolean, text: string) => {
    setFeedback({ ok, text })
    setTimeout(() => setFeedback(null), 3000)
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [projectsRes, agentsRes] = await Promise.all([
        fetch('/api/projects?includeArchived=1'),
        fetch('/api/agents'),
      ])
      const projectsData = await projectsRes.json().catch(() => ({}))
      if (!projectsRes.ok) throw new Error(projectsData.error || 'Failed to load projects')
      const nextProjects = Array.isArray(projectsData.projects) ? projectsData.projects : []
      setProjects(nextProjects)
      setSelectedId(prev => prev && nextProjects.some((project: Project) => project.id === prev) ? prev : nextProjects[0]?.id ?? null)
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json().catch(() => ({}))
        setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : [])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedProject) return
    setDetailDraft({
      name: selectedProject.name || '',
      slug: selectedProject.slug || '',
      ticket_prefix: selectedProject.ticket_prefix || '',
      description: selectedProject.description || '',
      github_repo: selectedProject.github_repo || '',
      github_default_branch: selectedProject.github_default_branch || 'main',
      project_workdir: selectedProject.project_workdir || '',
      deadline: formatDateInput(selectedProject.deadline),
      color: selectedProject.color || '',
      github_sync_enabled: !!selectedProject.github_sync_enabled,
      assigned_agents: selectedProject.assigned_agents || [],
    })
    setEnvRows(envToRows(selectedProject.project_env))
  }, [selectedProject])

  const createProject = async (event: FormEvent) => {
    event.preventDefault()
    if (!createForm.name.trim()) return
    setSaving(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to create project')
      setCreateForm({ name: '', ticket_prefix: '', description: '' })
      setCreateOpen(false)
      await load()
      await fetchProjects()
      if (data.project?.id) setSelectedId(data.project.id)
      showFeedback(true, 'Project created')
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  const saveDetails = async () => {
    if (!selectedProject) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: detailDraft.name,
          slug: detailDraft.slug,
          ticket_prefix: detailDraft.ticket_prefix,
          description: detailDraft.description,
          github_repo: detailDraft.github_repo || null,
          github_default_branch: detailDraft.github_default_branch || 'main',
          github_sync_enabled: detailDraft.github_sync_enabled ? 1 : 0,
          project_workdir: detailDraft.project_workdir,
          deadline: detailDraft.deadline ? Math.floor(new Date(detailDraft.deadline).getTime() / 1000) : null,
          color: detailDraft.color || null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to save project')

      const currentAgents = selectedProject.assigned_agents || []
      const toAdd = detailDraft.assigned_agents.filter(agent => !currentAgents.includes(agent))
      const toRemove = currentAgents.filter(agent => !detailDraft.assigned_agents.includes(agent))
      for (const agentName of toAdd) {
        await fetch(`/api/projects/${selectedProject.id}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: agentName }),
        })
      }
      for (const agentName of toRemove) {
        await fetch(`/api/projects/${selectedProject.id}/agents?agent_name=${encodeURIComponent(agentName)}`, { method: 'DELETE' })
      }

      await load()
      await fetchProjects()
      showFeedback(true, 'Project details saved')
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  const saveEnvironment = async () => {
    if (!selectedProject) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_env: rowsToEnv(envRows) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to save environment')
      await load()
      await fetchProjects()
      showFeedback(true, 'Project environment saved')
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to save environment')
    } finally {
      setSaving(false)
    }
  }

  const archiveProject = async (project: Project) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: project.status === 'active' ? 'archived' : 'active' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to update project')
      await load()
      await fetchProjects()
      showFeedback(true, project.status === 'active' ? 'Project archived' : 'Project restored')
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  const deleteProject = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"? Existing tasks will be moved to General.`)) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${project.id}?mode=delete`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to delete project')
      await load()
      await fetchProjects()
      showFeedback(true, 'Project deleted')
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setSaving(false)
    }
  }

  const toggleAgentAssignment = (agentName: string) => {
    setDetailDraft(prev => ({
      ...prev,
      assigned_agents: prev.assigned_agents.includes(agentName)
        ? prev.assigned_agents.filter(agent => agent !== agentName)
        : [...prev.assigned_agents, agentName],
    }))
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage project scope, assignments, repository settings, and project-specific runtime environment.</p>
        </div>
        <Button onClick={() => setCreateOpen(prev => !prev)}>{createOpen ? 'Close new project' : 'New Project'}</Button>
      </div>

      {feedback && <div className={`rounded-md border px-3 py-2 text-sm ${feedback.ok ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{feedback.text}</div>}
      {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

      {createOpen && (
        <form onSubmit={createProject} className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
          <input value={createForm.name} onChange={event => setCreateForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Project name" className="bg-surface-1 border border-border rounded-md px-3 py-2 text-sm" />
          <input value={createForm.ticket_prefix} onChange={event => setCreateForm(prev => ({ ...prev, ticket_prefix: event.target.value }))} placeholder="Ticket prefix" className="bg-surface-1 border border-border rounded-md px-3 py-2 text-sm uppercase" />
          <textarea value={createForm.description} onChange={event => setCreateForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Short project brief" rows={2} className="md:col-span-2 bg-surface-1 border border-border rounded-md px-3 py-2 text-sm resize-y" />
          <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={saving || !createForm.name.trim()}>{saving ? 'Creating…' : 'Create Project'}</Button></div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <aside className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">All Projects</span>
            <span className="text-xs text-muted-foreground">{projects.length}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/60">
            {loading ? <div className="p-4 text-sm text-muted-foreground">Loading projects…</div> : projects.map(project => (
              <button
                key={project.id}
                onClick={() => { setSelectedId(project.id); setActiveProject(project); setTab('details') }}
                className={`w-full text-left p-4 hover:bg-secondary/60 transition-colors ${selectedProject?.id === project.id ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold" style={project.color ? { backgroundColor: `${project.color}22`, color: project.color } : undefined}>
                    {project.ticket_prefix?.slice(0, 2) || project.name?.[0]?.toUpperCase() || 'P'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{project.name}</span>
                      {project.status === 'archived' && <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">archived</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{project.github_repo || project.slug}</div>
                  </div>
                  {typeof project.task_count === 'number' && <span className="text-xs text-muted-foreground">{project.task_count}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-lg border border-border bg-card min-h-[620px]">
          {!selectedProject ? (
            <div className="p-8 text-sm text-muted-foreground">No project selected.</div>
          ) : (
            <>
              <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selectedProject.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedProject.ticket_prefix} · {selectedProject.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => archiveProject(selectedProject)} disabled={saving || selectedProject.slug === 'general'}>{selectedProject.status === 'active' ? 'Archive' : 'Restore'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteProject(selectedProject)} disabled={saving || selectedProject.slug === 'general'}>Delete</Button>
                </div>
              </div>

              <div className="px-4 pt-4 flex gap-2 border-b border-border">
                {(['details', 'environment'] as ProjectTab[]).map(item => (
                  <button key={item} onClick={() => setTab(item)} className={`px-3 py-2 text-sm border-b-2 capitalize ${tab === item ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{item}</button>
                ))}
              </div>

              {tab === 'details' ? (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-1 text-xs text-muted-foreground">Name<input value={detailDraft.name} onChange={event => setDetailDraft(prev => ({ ...prev, name: event.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground">Slug<input value={detailDraft.slug} onChange={event => setDetailDraft(prev => ({ ...prev, slug: event.target.value }))} disabled={selectedProject.slug === 'general'} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm disabled:opacity-60" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground">Ticket Prefix<input value={detailDraft.ticket_prefix} onChange={event => setDetailDraft(prev => ({ ...prev, ticket_prefix: event.target.value.toUpperCase() }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm uppercase" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground">GitHub Repo<input value={detailDraft.github_repo} onChange={event => setDetailDraft(prev => ({ ...prev, github_repo: event.target.value }))} placeholder="owner/repo" className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground">Default Branch<input value={detailDraft.github_default_branch} onChange={event => setDetailDraft(prev => ({ ...prev, github_default_branch: event.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground">Deadline<input type="date" value={detailDraft.deadline} onChange={event => setDetailDraft(prev => ({ ...prev, deadline: event.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground md:col-span-2">Shared Project Directory<input value={detailDraft.project_workdir} onChange={event => setDetailDraft(prev => ({ ...prev, project_workdir: event.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm font-mono" /></label>
                    <label className="space-y-1 text-xs text-muted-foreground md:col-span-2">Description<textarea value={detailDraft.description} onChange={event => setDetailDraft(prev => ({ ...prev, description: event.target.value }))} rows={5} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm resize-y" /></label>
                  </div>

                  <div className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">Assigned Agents</h3>
                        <p className="text-xs text-muted-foreground">Agents associated with this project for routing and visibility.</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={detailDraft.github_sync_enabled} onChange={event => setDetailDraft(prev => ({ ...prev, github_sync_enabled: event.target.checked }))} /> GitHub sync</label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {agents.map(agent => (
                        <button key={agent.id} type="button" onClick={() => toggleAgentAssignment(agent.name)} className={`text-xs rounded-full border px-3 py-1 ${detailDraft.assigned_agents.includes(agent.name) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{agent.name}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end"><Button onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : 'Save Details'}</Button></div>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <div className="rounded-lg border border-border bg-surface-1/40 p-4">
                    <h3 className="text-sm font-medium text-foreground">Project Environment</h3>
                    <p className="text-xs text-muted-foreground mt-1">These KEY=value entries are passed only to agents running tasks for this project. Prefer paths and references to secret files rather than raw passwords or tokens.</p>
                  </div>

                  <div className="space-y-2">
                    {envRows.map((row, index) => (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-[260px_1fr_auto] gap-2">
                        <input value={row.key} onChange={event => setEnvRows(prev => prev.map((item, i) => i === index ? { ...item, key: event.target.value.toUpperCase() } : item))} placeholder="ENV_KEY" className="bg-surface-1 border border-border rounded-md px-3 py-2 text-sm font-mono" />
                        <input value={row.value} onChange={event => setEnvRows(prev => prev.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="value or /path/to/secret.env" className="bg-surface-1 border border-border rounded-md px-3 py-2 text-sm font-mono" data-1p-ignore />
                        <Button variant="ghost" size="sm" onClick={() => setEnvRows(prev => prev.filter((_, i) => i !== index))}>Remove</Button>
                      </div>
                    ))}
                    {envRows.length === 0 && <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground text-center">No project env entries yet.</div>}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" onClick={() => setEnvRows(prev => [...prev, { id: `new-${Date.now()}`, key: '', value: '' }])}>Add Variable</Button>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => setEnvRows(envToRows(selectedProject.project_env))}>Discard</Button>
                      <Button onClick={saveEnvironment} disabled={saving}>{saving ? 'Saving…' : 'Save Environment'}</Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
