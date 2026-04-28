'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import Link from 'next/link'

const log = createClientLogger('AgentDetailTabs')

interface Agent {
  id: number
  name: string
  role: string
  session_key?: string
  soul_content?: string
  working_memory?: string
  status: 'offline' | 'idle' | 'busy' | 'error'
  last_seen?: number
  last_activity?: string
  created_at: number
  updated_at: number
  taskStats?: {
    total: number
    assigned: number
    in_progress: number
    completed: number
  }
}

interface WorkItem {
  type: string
  count: number
  items: any[]
}

interface HeartbeatResponse {
  status: 'HEARTBEAT_OK' | 'WORK_ITEMS_FOUND'
  agent: string
  checked_at: number
  work_items?: WorkItem[]
  total_items?: number
  message?: string
}

interface SoulTemplate {
  name: string
  description: string
  size: number
}

const statusColors: Record<string, string> = {
  offline: 'bg-gray-500',
  idle: 'bg-green-500',
  busy: 'bg-yellow-500',
  error: 'bg-red-500',
}

const statusIcons: Record<string, string> = {
  offline: '-',
  idle: 'o',
  busy: '~',
  error: '!',
}

// Overview Tab Component
export function OverviewTab({
  agent,
  editing,
  formData,
  setFormData,
  onSave,
  saveBusy,
  onStatusUpdate,
  onWakeAgent,
  onEdit,
  onCancel,
  heartbeatData,
  loadingHeartbeat,
  onPerformHeartbeat
}: {
  agent: Agent
  editing: boolean
  formData: any
  setFormData: (data: any) => void
  onSave: () => Promise<void>
  saveBusy?: boolean
  onStatusUpdate: (name: string, status: Agent['status'], activity?: string) => Promise<void>
  onWakeAgent: (name: string, sessionKey: string) => Promise<void>
  onEdit: () => void
  onCancel: () => void
  heartbeatData: HeartbeatResponse | null
  loadingHeartbeat: boolean
  onPerformHeartbeat: () => Promise<void>
}) {
  const t = useTranslations('agentDetail')
  const [messageFrom, setMessageFrom] = useState('system')
  const [directMessage, setDirectMessage] = useState('')
  const [messageStatus, setMessageStatus] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ alias: string; description?: string }>>([])

  useEffect(() => {
    fetch('/api/status?action=models')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.models) setAvailableModels(data.models)
      })
      .catch(() => {})
  }, [])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!directMessage.trim()) return
    try {
      setMessageStatus(null)
      const response = await fetch('/api/agents/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: messageFrom || 'system',
          to: agent.name,
          message: directMessage
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send message')
      setDirectMessage('')
      setMessageStatus(t('messageSent'))
      setTimeout(() => setMessageStatus(null), 2000)
    } catch (error) {
      setMessageStatus(t('messageFailed'))
    }
  }

  return (
    <div className="p-5">
      <div className="grid md:grid-cols-[1fr_1fr] gap-5">
        {/* Left Column — Agent Details */}
        <div className="space-y-4">
          {/* Status + Actions row */}
          <div className="flex items-center gap-2">
            {(['idle', 'busy', 'offline'] as const).map(status => (
              <button
                key={status}
                onClick={() => onStatusUpdate(agent.name, status)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  agent.status === status
                    ? status === 'idle' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : status === 'busy' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {status}
              </button>
            ))}
            {agent.session_key && (
              <button
                onClick={() => onWakeAgent(agent.name, agent.session_key!)}
                className="ml-auto px-3 py-1 text-xs rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                Wake
              </button>
            )}
            <button
              onClick={onPerformHeartbeat}
              disabled={loadingHeartbeat}
              className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 ml-auto"
              style={agent.session_key ? { marginLeft: 0 } : undefined}
            >
              {loadingHeartbeat ? '...' : t('heartbeat')}
            </button>
          </div>

          {heartbeatData && (
            <div className="text-xs text-muted-foreground bg-surface-1/30 rounded px-3 py-2">
              <span className={heartbeatData.status === 'HEARTBEAT_OK' ? 'text-green-400' : 'text-yellow-400'}>
                {heartbeatData.status}
              </span>
              {heartbeatData.total_items ? ` · ${t('workItems', { count: heartbeatData.total_items })}` : ''}
              {heartbeatData.message && ` · ${heartbeatData.message}`}
            </div>
          )}

          {/* Key fields */}
          <div className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t('role')}</span>
              {editing ? (
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, role: e.target.value }))}
                  className="bg-surface-1 text-foreground border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              ) : (
                <span className="text-foreground">{agent.role}</span>
              )}
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t('model')}</span>
              {editing ? (
                <select
                  value={formData.model || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, model: e.target.value }))}
                  className="bg-surface-1 text-foreground border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="">{t('default')}</option>
                  {availableModels.map((m) => (
                    <option key={m.alias} value={m.alias}>{m.alias}</option>
                  ))}
                </select>
              ) : (
                <span className="text-foreground font-mono text-xs">
                  {(() => { const p = (agent as any).config?.model?.primary; const m = (agent as any).model; const v = typeof p === 'string' ? p : p?.primary; return v || (typeof m === 'string' ? m : m?.primary) || t('default') })()}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t('sessionKey')}</span>
              {editing ? (
                <input
                  type="text"
                  value={formData.session_key}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, session_key: e.target.value }))}
                  className="bg-surface-1 text-foreground border border-border rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder={t('sessionKeyPlaceholder')}
                />
              ) : (
                <span className="text-foreground font-mono text-xs">
                  {agent.session_key || <span className="text-muted-foreground/50">{t('notSet')}</span>}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t('created')}</span>
              <span className="text-xs text-muted-foreground">{new Date(agent.created_at * 1000).toLocaleDateString()}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center text-sm">
              <span className="text-muted-foreground">{t('updated')}</span>
              <span className="text-xs text-muted-foreground">{new Date(agent.updated_at * 1000).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Task Stats — compact row */}
          {agent.taskStats && (
            <div className="flex gap-3 pt-1">
              <div className="text-center">
                <div className="text-lg font-semibold text-foreground">{agent.taskStats.total}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('statsTotal')}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-blue-400">{agent.taskStats.assigned}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('statsAssigned')}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-yellow-400">{agent.taskStats.in_progress}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('statsActive')}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-400">{agent.taskStats.completed}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('statsDone')}</div>
              </div>
            </div>
          )}

          {/* Edit / Save */}
          <div className="flex gap-2 pt-1">
            {editing ? (
              <>
                <Button onClick={onSave} size="sm" disabled={saveBusy}>
                  {saveBusy ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
                      </svg>
                      {t('saving')}
                    </span>
                  ) : t('save')}
                </Button>
                <Button onClick={onCancel} variant="secondary" size="sm" disabled={saveBusy}>{t('cancel')}</Button>
              </>
            ) : (
              <Button onClick={onEdit} variant="secondary" size="sm">{t('edit')}</Button>
            )}
          </div>
        </div>

        {/* Right Column — Direct Message */}
        <div className="border border-border rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground">{t('message')}</h4>
            {messageStatus && (
              <span className={`text-xs ${messageStatus === 'Sent' ? 'text-green-400' : 'text-rose-400'}`}>
                {messageStatus}
              </span>
            )}
          </div>
          <form onSubmit={handleSendMessage} className="flex flex-col flex-1 gap-2">
            <input
              type="text"
              value={messageFrom}
              onChange={(e) => setMessageFrom(e.target.value)}
              className="bg-surface-1 text-foreground rounded px-2.5 py-1.5 text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder={t('from')}
            />
            <textarea
              value={directMessage}
              onChange={(e) => setDirectMessage(e.target.value)}
              className="flex-1 min-h-[80px] bg-surface-1 text-foreground rounded px-2.5 py-2 text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              placeholder={t('sendMessagePlaceholder', { name: agent.name })}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!directMessage.trim()}>
                {t('send')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// SOUL Tab Component
export function SoulTab({
  agent,
  soulContent,
  templates,
  onSave
}: {
  agent: Agent
  soulContent: string
  templates: SoulTemplate[]
  onSave: (content: string, templateName?: string) => Promise<void>
}) {
  const t = useTranslations('agentDetail')
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(soulContent)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

  useEffect(() => {
    setContent(soulContent)
  }, [soulContent])

  const handleSave = async () => {
    await onSave(content)
    setEditing(false)
  }

  const handleLoadTemplate = async (templateName: string) => {
    try {
      const response = await fetch(`/api/agents/${agent.name}/soul?template=${templateName}`, {
        method: 'PATCH'
      })
      if (response.ok) {
        const data = await response.json()
        setContent(data.content)
        setSelectedTemplate(templateName)
      }
    } catch (error) {
      log.error('Failed to load template:', error)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-medium text-foreground">{t('soulConfiguration')}</h4>
        <div className="flex gap-2">
          {!editing && (
            <Button
              onClick={() => setEditing(true)}
              size="sm"
            >
              {t('editSoul')}
            </Button>
          )}
        </div>
      </div>

      {/* Template Selector */}
      {editing && templates.length > 0 && (
        <div className="p-4 bg-surface-1/50 rounded-lg">
          <h5 className="text-sm font-medium text-foreground mb-2">{t('loadTemplate')}</h5>
          <div className="flex gap-2">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="">{t('selectTemplate')}</option>
              {templates.map(template => (
                <option key={template.name} value={template.name}>
                  {template.description} ({t('chars', { count: template.size })})
                </option>
              ))}
            </select>
            <Button
              onClick={() => selectedTemplate && handleLoadTemplate(selectedTemplate)}
              disabled={!selectedTemplate}
              variant="success"
            >
              {t('load')}
            </Button>
          </div>
        </div>
      )}

      {/* SOUL Editor */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('soulContent', { count: content.length })}
        </label>
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
            placeholder={t('soulEditorPlaceholder')}
          />
        ) : (
          <div className="bg-surface-1/30 rounded p-4 max-h-96 overflow-y-auto">
            {content ? (
              <pre className="text-foreground whitespace-pre-wrap text-sm">{content}</pre>
            ) : (
              <p className="text-muted-foreground italic">{t('noSoulContent')}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {editing && (
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            className="flex-1"
          >
            {t('saveSoul')}
          </Button>
          <Button
            onClick={() => {
              setEditing(false)
              setContent(soulContent)
            }}
            variant="secondary"
            className="flex-1"
          >
            {t('cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}

// Memory Tab Component
export function MemoryTab({
  agent,
  workingMemory,
  onSave
}: {
  agent: Agent
  workingMemory: string
  onSave: (content: string, append?: boolean) => Promise<void>
}) {
  const t = useTranslations('agentDetail')
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(workingMemory)
  const [appendMode, setAppendMode] = useState(false)
  const [newEntry, setNewEntry] = useState('')

  useEffect(() => {
    setContent(workingMemory)
  }, [workingMemory])

  const handleSave = async () => {
    if (appendMode && newEntry.trim()) {
      await onSave(newEntry, true)
      setNewEntry('')
      setAppendMode(false)
    } else {
      await onSave(content)
    }
    setEditing(false)
  }

  const handleClear = async () => {
    if (confirm(t('confirmClearMemory'))) {
      await onSave('')
      setContent('')
      setEditing(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('workingMemory')}</h4>
          <p className="text-xs text-muted-foreground mt-1">
            {t('workingMemoryDesc')}
          </p>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <>
              <Button
                onClick={() => {
                  setAppendMode(true)
                  setEditing(true)
                }}
                variant="success"
                size="sm"
              >
                {t('addEntry')}
              </Button>
              <Button
                onClick={() => setEditing(true)}
                size="sm"
              >
                {t('editMemory')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
        <strong className="text-blue-200">{t('memoryBannerTitle')}</strong>{' '}
        {t('memoryBannerDesc')}{' '}
        <Link href="/memory" className="text-blue-400 underline hover:text-blue-300">{t('memoryBrowserLink')}</Link> {t('memoryBannerPage')}
      </div>

      {/* Memory Content */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('memoryContent', { count: content.length })}
        </label>
        
        {editing && appendMode ? (
          <div className="space-y-2">
            <div className="bg-surface-1/30 rounded p-4 max-h-40 overflow-y-auto">
              <pre className="text-foreground whitespace-pre-wrap text-sm">{content}</pre>
            </div>
            <textarea
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              rows={5}
              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder={t('addMemoryEntryPlaceholder')}
            />
          </div>
        ) : editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={15}
            className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm"
            placeholder={t('workingMemoryPlaceholder')}
          />
        ) : (
          <div className="bg-surface-1/30 rounded p-4 max-h-96 overflow-y-auto">
            {content ? (
              <pre className="text-foreground whitespace-pre-wrap text-sm">{content}</pre>
            ) : (
              <p className="text-muted-foreground italic">{t('noWorkingMemory')}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {editing && (
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            className="flex-1"
          >
            {appendMode ? t('addEntry') : t('saveMemory')}
          </Button>
          <Button
            onClick={() => {
              setEditing(false)
              setAppendMode(false)
              setContent(workingMemory)
              setNewEntry('')
            }}
            variant="secondary"
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          {!appendMode && (
            <Button
              onClick={handleClear}
              variant="destructive"
            >
              {t('clearAll')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Tasks Tab Component
export function TasksTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch(`/api/tasks?assigned_to=${agent.name}`)
        if (response.ok) {
          const data = await response.json()
          setTasks(data.tasks || [])
        }
      } catch (error) {
        log.error('Failed to fetch tasks:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTasks()
  }, [agent.name])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-8">
        <Loader variant="inline" label={t('loadingTasks')} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <h4 className="text-lg font-medium text-foreground">{t('assignedTasks')}</h4>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
          <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center mb-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="2" width="10" height="12" rx="1" />
              <path d="M6 6h4M6 9h3" />
            </svg>
          </div>
          <p className="text-sm">{t('noTasksAssigned')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="bg-surface-1/50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/tasks?taskId=${task.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {task.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {task.ticket_ref || `Task #${task.id}`}
                    {task.project_name ? ` · ${task.project_name}` : ''}
                  </div>
                  {task.description && (
                    <p className="text-foreground/80 text-sm mt-1">{task.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-md font-medium ${
                    task.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                    task.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    task.status === 'review' ? 'bg-blue-500/20 text-blue-400' :
                    task.status === 'quality_review' ? 'bg-indigo-500/20 text-indigo-400' :
                    'bg-secondary text-muted-foreground'
                  }`}>
                    {task.status}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-md font-medium ${
                    task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                    task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-secondary text-muted-foreground'
                  }`}>
                    {task.priority}
                  </span>
                </div>
              </div>
              
              {task.due_date && (
                <div className="text-xs text-muted-foreground mt-2">
                  {t('due')}: {new Date(task.due_date * 1000).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Activity Tab Component
export function ActivityTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const response = await fetch(`/api/activities?actor=${agent.name}&limit=50`)
        if (response.ok) {
          const data = await response.json()
          setActivities(data.activities || [])
        }
      } catch (error) {
        log.error('Failed to fetch activities:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchActivities()
  }, [agent.name])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-8">
        <Loader variant="inline" label={t('loadingActivity')} />
      </div>
    )
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'agent_status_change': return '~'
      case 'task_created': return '+'
      case 'task_updated': return '>'
      case 'comment_added': return '#'
      case 'agent_heartbeat': return '*'
      case 'agent_soul_updated': return '@'
      case 'agent_memory_updated': return '='
      default: return '.'
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h4 className="text-lg font-medium text-foreground">{t('recentActivity')}</h4>
      
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
          <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center mb-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h12M2 8h8M2 12h10" />
            </svg>
          </div>
          <p className="text-sm">{t('noRecentActivity')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map(activity => (
            <div key={activity.id} className="bg-surface-1/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{getActivityIcon(activity.type)}</div>
                <div className="flex-1">
                  <p className="text-foreground">{activity.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{activity.type}</span>
                    <span>•</span>
                    <span>{new Date(activity.created_at * 1000).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== NEW COMPONENTS: CreateAgentModal (template wizard) + ConfigTab =====
// These replace the old CreateAgentModal and add the Config tab

// Template data for the wizard (client-side mirror of agent-templates.ts)
type CreateAgentTemplate = {
  type: string
  label: string
  emoji: string
  description: string
  modelTier: 'opus' | 'sonnet' | 'haiku'
  toolCount: number
  theme: string
  instructions: string
}

const DEFAULT_TEMPLATES: CreateAgentTemplate[] = [
  {
    type: 'orchestrator',
    label: 'Orchestrator',
    emoji: '🧭',
    description: 'Primary coordinator with full tool access. Routes tasks to specialist agents and manages workflows.',
    modelTier: 'opus',
    toolCount: 23,
    theme: 'operator strategist',
    instructions: 'You are an orchestrator. Break ambiguous goals into clear tasks, assign work to the right specialist, spawn or coordinate subagents where useful, track blockers, review outputs, and escalate decisions that need the human owner. Do not do all implementation yourself when delegation is more effective.',
  },
  {
    type: 'developer',
    label: 'Developer',
    emoji: '🛠️',
    description: 'Full-stack builder with Docker bridge networking, exec/write access, and subagent spawning.',
    modelTier: 'sonnet',
    toolCount: 21,
    theme: 'builder engineer',
    instructions: 'You are a full-stack developer. Implement scoped changes, inspect the repo before editing, keep diffs focused, run the smallest meaningful verification, and report files changed, tests run, and any remaining risks.',
  },
  {
    type: 'specialist-dev',
    label: 'Specialist Dev',
    emoji: '⚙️',
    description: 'Focused developer for specific domains (frontend, backend, blockchain). Docker bridge + write access.',
    modelTier: 'sonnet',
    toolCount: 15,
    theme: 'specialist developer',
    instructions: 'You are a specialist developer for a defined domain. Stay inside your speciality, apply relevant framework conventions, avoid unrelated refactors, and hand off clearly when work crosses into another domain.',
  },
  {
    type: 'reviewer',
    label: 'Reviewer / QA',
    emoji: '🔬',
    description: 'Read-only access for code review, quality gates, and auditing. Lightweight model by default.',
    modelTier: 'haiku',
    toolCount: 7,
    theme: 'quality reviewer',
    instructions: 'You are a reviewer and QA agent. Check correctness, regressions, edge cases, acceptance criteria, and verification evidence. Prefer specific actionable findings over broad commentary. Do not modify files unless explicitly asked.',
  },
  {
    type: 'researcher',
    label: 'Researcher',
    emoji: '🔍',
    description: 'Browser and web access for research tasks. No workspace or code execution.',
    modelTier: 'sonnet',
    toolCount: 8,
    theme: 'research analyst',
    instructions: 'You are a research analyst. Gather current information, compare sources, cite important claims, separate facts from assumptions, and finish with concise recommendations or next steps.',
  },
  {
    type: 'content-creator',
    label: 'Content Creator',
    emoji: '✏️',
    description: 'Write and edit access for content generation. No code execution or browser by default.',
    modelTier: 'haiku',
    toolCount: 9,
    theme: 'content creator',
    instructions: 'You are a content creator and editor. Write clearly in the requested voice, preserve intent, structure for readability, and call out any missing audience, tone, or distribution assumptions.',
  },
  {
    type: 'security-auditor',
    label: 'Security Auditor',
    emoji: '🛡️',
    description: 'Read-only workspace with bash for security scanning. No write access to prevent tampering.',
    modelTier: 'sonnet',
    toolCount: 10,
    theme: 'security auditor',
    instructions: 'You are a security auditor. Look for concrete risks, exploitability, secrets exposure, unsafe permissions, dependency issues, and missing controls. Prioritise findings by severity and recommend safe mitigations.',
  },
]

const MODEL_TIER_COLORS: Record<string, string> = {
  opus: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  sonnet: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  haiku: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const MODEL_TIER_LABELS: Record<string, string> = {
  opus: '$$$',
  sonnet: '$$',
  haiku: '$',
}

const DEFAULT_MODEL_BY_TIER: Record<'opus' | 'sonnet' | 'haiku', string> = {
  opus: 'anthropic/claude-opus-4-5',
  sonnet: 'anthropic/claude-sonnet-4-20250514',
  haiku: 'anthropic/claude-haiku-4-5',
}

// Enhanced Create Agent Modal with generic runtime/profile wizard
type CreateAgentRuntime = 'profile' | 'openclaw' | 'hermes' | 'claude' | 'codex' | 'custom'
type WorkspaceMode = 'none' | 'default' | 'dedicated' | 'existing' | 'runtime'
type ToolProfile = 'template' | 'readonly' | 'coding' | 'orchestrator' | 'research' | 'custom'
type ThinkingLevel = '' | 'minimal' | 'low' | 'medium' | 'high'

const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string; description: string }> = [
  { value: '', label: 'Default / inherit', description: 'Use runtime or model default' },
  { value: 'minimal', label: 'Minimal', description: 'Smallest reasoning budget, useful for GPT-5 quick passes' },
  { value: 'low', label: 'Low', description: 'Faster, lighter reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced reasoning' },
  { value: 'high', label: 'High', description: 'Deeper reasoning for hard tasks' },
]

type RuntimeOption = {
  id: CreateAgentRuntime
  label: string
  description: string
  createsWorkspace: string
  writesGateway: boolean
  canRunTasks: boolean
}

const RUNTIME_OPTIONS: RuntimeOption[] = [
  {
    id: 'profile',
    label: 'Mission Control profile',
    description: 'Record-only specialist profile for planning, assignment, humans, or an existing shared runtime/session.',
    createsWorkspace: 'No runtime workspace by default',
    writesGateway: false,
    canRunTasks: false,
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    description: 'Native OpenClaw agent with provider/model, skills, tools, memory, workspace, and subagent policy.',
    createsWorkspace: 'Can create a dedicated OpenClaw workspace',
    writesGateway: true,
    canRunTasks: true,
  },
  {
    id: 'hermes',
    label: 'Hermes profile',
    description: 'Creates or updates a Hermes profile. This is not a second Hermes install; it is a named Hermes persona/profile.',
    createsWorkspace: 'Uses Hermes profile storage',
    writesGateway: false,
    canRunTasks: true,
  },
  {
    id: 'claude',
    label: 'Claude Code',
    description: 'Mission Control task worker using the local Claude Code CLI with this agent’s instructions/model defaults.',
    createsWorkspace: 'Uses selected/default working directory',
    writesGateway: false,
    canRunTasks: true,
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'Mission Control task worker using the local Codex CLI with this agent’s instructions/model defaults.',
    createsWorkspace: 'Uses selected/default working directory',
    writesGateway: false,
    canRunTasks: true,
  },
  {
    id: 'custom',
    label: 'Custom / external',
    description: 'Record an external/manual agent integration without provisioning a managed runtime.',
    createsWorkspace: 'No managed workspace',
    writesGateway: false,
    canRunTasks: false,
  },
]

export function CreateAgentModal({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templates, setTemplates] = useState<CreateAgentTemplate[]>(DEFAULT_TEMPLATES)
  const [availableModels, setAvailableModels] = useState<Array<{ name: string; alias?: string; provider: string }>>([])
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; source?: string; description?: string }>>([])
  const [formData, setFormData] = useState({
    name: '',
    id: '',
    role: '',
    emoji: '',
    runtime: 'openclaw' as CreateAgentRuntime,
    modelTier: 'sonnet' as 'opus' | 'sonnet' | 'haiku',
    modelPrimary: DEFAULT_MODEL_BY_TIER.sonnet,
    provider: 'anthropic',
    thinking: '' as ThinkingLevel,
    workspaceMode: 'dedicated' as WorkspaceMode,
    existingWorkspacePath: '',
    workspaceAccess: 'rw' as 'rw' | 'ro' | 'none',
    sandboxMode: 'all' as 'all' | 'non-main',
    dockerNetwork: 'none' as 'none' | 'bridge',
    session_key: '',
    instructions: '',
    selectedSkills: [] as string[],
    taskTagsText: '',
    toolProfile: 'template' as ToolProfile,
    subagentPolicy: 'template' as 'template' | 'none' | 'allowed' | 'all',
    write_to_gateway: true,
  })
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type ProgressStep = { label: string; status: 'pending' | 'active' | 'done' | 'error'; error?: string }
  const [progressSteps, setProgressSteps] = useState<ProgressStep[] | null>(null)

  const selectedTemplateData = templates.find(t => t.type === selectedTemplate)
  const selectedRuntime = RUNTIME_OPTIONS.find(option => option.id === formData.runtime) || RUNTIME_OPTIONS[1]
  const groupedModels = useMemo(() => {
    const groups: Record<string, Array<{ name: string; alias?: string; provider: string }>> = {}
    for (const model of availableModels) {
      const provider = model.provider || (model.name.includes('/') ? model.name.split('/')[0] : 'unknown')
      if (!groups[provider]) groups[provider] = []
      groups[provider].push(model)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [availableModels])

  const parsedSkills = formData.selectedSkills
  const parsedTaskTags = formData.taskTagsText.split(',').map(s => s.trim()).filter(Boolean)
  const provisionOpenClawWorkspace = formData.runtime === 'openclaw' && formData.workspaceMode === 'dedicated'
  const writeToGateway = formData.runtime === 'openclaw' && formData.write_to_gateway

  const updateName = (name: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setFormData(prev => ({ ...prev, name, id }))
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mc-create-agent-templates')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setTemplates(parsed)
      }
    } catch {
      // Template customisation is optional.
    }

    const loadAvailableModels = async () => {
      try {
        const response = await fetch('/api/status?action=models')
        if (!response.ok) return
        const data = await response.json()
        const models = Array.isArray(data.models) ? data.models : []
        const normalized = models
          .map((model: any) => {
            const name = String(model.name || model.key || model.alias || '').trim()
            if (!name) return null
            return {
              name,
              alias: String(model.alias || model.name || '').trim() || undefined,
              provider: String(model.provider || (name.includes('/') ? name.split('/')[0] : 'unknown')).trim(),
            }
          })
          .filter(Boolean) as Array<{ name: string; alias?: string; provider: string }>
        const deduped = Array.from(new Map(normalized.map(model => [model.name, model])).values())
        setAvailableModels(deduped)
      } catch {
        // Keep modal usable without model suggestions.
      }
    }

    const loadAvailableSkills = async () => {
      try {
        const response = await fetch('/api/skills')
        if (!response.ok) return
        const data = await response.json()
        const skills = Array.isArray(data.skills) ? data.skills : []
        setAvailableSkills(skills.map((skill: any) => ({
          name: String(skill.name || '').trim(),
          source: skill.source ? String(skill.source) : undefined,
          description: skill.description ? String(skill.description) : undefined,
        })).filter((skill: { name: string }) => skill.name))
      } catch {
        // Keep modal usable without skill suggestions.
      }
    }

    loadAvailableModels()
    loadAvailableSkills()
  }, [])

  const selectTemplate = (type: string | null) => {
    setSelectedTemplate(type)
    if (!type) return
    const tmpl = templates.find(t => t.type === type)
    if (!tmpl) return

    const id = tmpl.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setFormData(prev => ({
      ...prev,
      name: tmpl.label,
      id,
      role: tmpl.theme,
      emoji: tmpl.emoji,
      modelTier: tmpl.modelTier,
      modelPrimary: DEFAULT_MODEL_BY_TIER[tmpl.modelTier],
      provider: DEFAULT_MODEL_BY_TIER[tmpl.modelTier].split('/')[0] || prev.provider,
      workspaceAccess: type === 'researcher' || type === 'content-creator' ? 'none' : type === 'reviewer' || type === 'security-auditor' ? 'ro' : 'rw',
      sandboxMode: type === 'orchestrator' ? 'non-main' : 'all',
      dockerNetwork: type === 'developer' || type === 'specialist-dev' ? 'bridge' : 'none',
      toolProfile: type === 'orchestrator' ? 'orchestrator' : type === 'reviewer' || type === 'security-auditor' ? 'readonly' : type === 'researcher' ? 'research' : type === 'developer' || type === 'specialist-dev' ? 'coding' : 'template',
      subagentPolicy: type === 'orchestrator' ? 'all' : 'template',
      instructions: tmpl.instructions,
    }))
  }

  const saveSelectedTemplateDefaults = () => {
    if (!selectedTemplate) return
    const next = templates.map(template => template.type === selectedTemplate ? {
      ...template,
      label: formData.name || template.label,
      emoji: formData.emoji || template.emoji,
      theme: formData.role || template.theme,
      instructions: formData.instructions || template.instructions,
      modelTier: formData.modelTier,
    } : template)
    setTemplates(next)
    try { localStorage.setItem('mc-create-agent-templates', JSON.stringify(next)) } catch {}
  }

  const resetTemplateDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES)
    try { localStorage.removeItem('mc-create-agent-templates') } catch {}
  }

  const updateRuntime = (runtime: CreateAgentRuntime) => {
    setFormData(prev => {
      const openclaw = runtime === 'openclaw'
      const hermes = runtime === 'hermes'
      return {
        ...prev,
        runtime,
        write_to_gateway: openclaw,
        workspaceMode: openclaw ? 'dedicated' : hermes ? 'runtime' : runtime === 'profile' || runtime === 'custom' ? 'none' : 'default',
        session_key: runtime === 'profile' ? prev.session_key : prev.session_key,
      }
    })
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      setError('Name is required')
      return
    }
    if (!formData.role.trim()) {
      setError('Role / specialisation is required')
      return
    }

    setIsCreating(true)
    setError(null)

    const steps: ProgressStep[] = [{ label: 'Create Mission Control profile', status: 'pending' }]
    if (writeToGateway) steps.push({ label: 'Write OpenClaw agent config', status: 'pending' })
    if (provisionOpenClawWorkspace) steps.push({ label: 'Provision OpenClaw workspace', status: 'pending' })
    if (formData.runtime === 'hermes') steps.push({ label: 'Create/update Hermes profile', status: 'pending' })
    setProgressSteps([...steps])

    const animateSteps = async () => {
      for (let i = 0; i < steps.length; i++) {
        await new Promise(r => setTimeout(r, 250))
        steps[i].status = 'active'
        setProgressSteps([...steps])
      }
    }

    try {
      const primaryModel = formData.modelPrimary.trim() || DEFAULT_MODEL_BY_TIER[formData.modelTier]
      const gatewayConfig: Record<string, any> = {
        model: { primary: primaryModel },
        identity: { name: formData.name, theme: formData.role, emoji: formData.emoji },
        specialization: {
          instructions: formData.instructions,
          taskTags: parsedTaskTags,
          toolProfile: formData.toolProfile,
          runtime: formData.runtime,
        },
        dispatchModel: primaryModel,
        provider: formData.provider || (primaryModel.includes('/') ? primaryModel.split('/')[0] : undefined),
        ...(formData.thinking ? { thinking: formData.thinking, thinkingDefault: formData.thinking } : {}),
      }

      if (formData.runtime === 'openclaw') {
        gatewayConfig.sandbox = {
          mode: formData.sandboxMode,
          workspaceAccess: formData.workspaceAccess,
          scope: 'agent',
          ...(formData.dockerNetwork === 'bridge' ? { docker: { network: 'bridge' } } : {}),
        }
        if (parsedSkills.length > 0) gatewayConfig.skills = parsedSkills
        if (formData.subagentPolicy === 'all') gatewayConfig.subagents = { allowAgents: ['*'] }
        if (formData.subagentPolicy === 'none') gatewayConfig.subagents = { allowAgents: [] }
      }

      if (formData.workspaceMode === 'existing' && formData.existingWorkspacePath.trim()) {
        gatewayConfig.workspace = formData.existingWorkspacePath.trim()
        gatewayConfig.cwd = formData.existingWorkspacePath.trim()
      }

      const runtimeType = formData.runtime === 'profile' ? 'custom' : formData.runtime === 'custom' ? 'custom' : formData.runtime
      const [response] = await Promise.all([
        fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            openclaw_id: formData.id || undefined,
            role: formData.role,
            session_key: formData.session_key || undefined,
            soul_content: formData.instructions || undefined,
            template: selectedTemplate || undefined,
            runtime_type: runtimeType,
            write_to_gateway: writeToGateway,
            provision_openclaw_workspace: provisionOpenClawWorkspace,
            openclaw_workspace_path: formData.workspaceMode === 'existing' ? formData.existingWorkspacePath.trim() || undefined : undefined,
            instructions: formData.instructions || undefined,
            skills: parsedSkills,
            task_tags: parsedTaskTags,
            tool_profile: formData.toolProfile,
            workspace_mode: formData.workspaceMode,
            model_primary: primaryModel,
            model_provider: formData.provider,
            gateway_config: gatewayConfig,
            config: {
              runtime_type: formData.runtime,
              profileOnly: formData.runtime === 'profile',
              instructions: formData.instructions,
              skills: parsedSkills,
              taskTags: parsedTaskTags,
              toolProfile: formData.toolProfile,
              workspaceMode: formData.workspaceMode,
              provider: formData.provider,
              thinking: formData.thinking || undefined,
              thinkingDefault: formData.thinking || undefined,
            },
          }),
        }),
        animateSteps(),
      ])

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errMsg = data.error || 'Failed to create agent'
        const failIdx = /hermes/i.test(errMsg)
          ? steps.findIndex(s => s.label.includes('Hermes'))
          : /provision|workspace/i.test(errMsg)
            ? steps.findIndex(s => s.label.includes('workspace'))
            : /gateway|config/i.test(errMsg)
              ? steps.findIndex(s => s.label.includes('OpenClaw'))
              : 0
        const idx = failIdx >= 0 ? failIdx : 0
        steps[idx].status = 'error'
        steps[idx].error = errMsg
        for (let i = idx + 1; i < steps.length; i++) steps[i].status = 'pending'
        setProgressSteps([...steps])
        return
      }

      for (const s of steps) s.status = 'done'
      setProgressSteps([...steps])
      setTimeout(() => { onCreated(); onClose() }, 900)
    } catch (err: any) {
      steps[0].status = 'error'
      steps[0].error = err.message || 'Unexpected error'
      for (let i = 1; i < steps.length; i++) steps[i].status = 'pending'
      setProgressSteps([...steps])
    } finally {
      setIsCreating(false)
    }
  }

  const reviewItems = [
    'Mission Control agent/profile record',
    ...(writeToGateway ? ['OpenClaw gateway agents.list entry'] : []),
    ...(provisionOpenClawWorkspace ? [`Dedicated OpenClaw workspace for ${formData.id || '<agent-id>'}`] : []),
    ...(formData.runtime === 'hermes' ? [`Hermes profile named ${formData.name || '<name>'}`] : []),
    ...(formData.instructions.trim() ? ['Specialised instruction file/content'] : []),
  ]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[88vh] flex flex-col">
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-foreground">Create Agent / Profile</h3>
              <div className="flex flex-wrap gap-3 mt-2">
                {(['Archetype', 'Backend', 'Specialise', 'Review'] as const).map((label, index) => {
                  const n = (index + 1) as 1 | 2 | 3 | 4
                  return (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        step === n ? 'bg-primary text-primary-foreground' :
                        step > n ? 'bg-green-500/20 text-green-400' :
                        'bg-surface-2 text-muted-foreground'
                      }`}>
                        {step > n ? '✓' : n}
                      </div>
                      <span className={`text-xs ${step === n ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <Button onClick={onClose} variant="ghost" size="icon-sm" className="text-2xl">×</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 mb-4 rounded-lg text-sm">{error}</div>}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {templates.map(tmpl => (
                <Button
                  key={tmpl.type}
                  onClick={() => { selectTemplate(tmpl.type); setStep(2) }}
                  variant="outline"
                  className={`p-4 h-auto text-left flex flex-col items-start whitespace-normal min-w-0 ${selectedTemplate === tmpl.type ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{tmpl.emoji}</span>
                    <span className="font-semibold text-foreground">{tmpl.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 whitespace-normal break-words">{tmpl.description}</p>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded border ${MODEL_TIER_COLORS[tmpl.modelTier]}`}>{MODEL_TIER_LABELS[tmpl.modelTier]}</span>
                    <span className="px-2 py-0.5 text-xs rounded bg-surface-2 text-muted-foreground">{tmpl.toolCount} tools</span>
                  </div>
                </Button>
              ))}
              <Button
                onClick={() => { selectTemplate(null); setStep(2) }}
                variant="outline"
                className="p-4 h-auto text-left flex flex-col items-start border-dashed whitespace-normal min-w-0"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">+</span>
                  <span className="font-semibold text-foreground">Custom</span>
                </div>
                <p className="text-xs text-muted-foreground">Start with a blank specialist profile.</p>
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100/80">
                A Mission Control profile is a record/persona only. Use it for humans, placeholders, planning roles, or a profile that points at an existing shared session. Hermes creates a named Hermes profile, not another Hermes installation/agent process.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {RUNTIME_OPTIONS.map(option => (
                  <Button
                    key={option.id}
                    onClick={() => updateRuntime(option.id)}
                    variant="outline"
                    className={`p-4 h-auto text-left flex flex-col items-start whitespace-normal min-w-0 overflow-hidden ${formData.runtime === option.id ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <span className="font-semibold text-foreground whitespace-normal break-words min-w-0">{option.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${option.canRunTasks ? 'bg-green-500/15 text-green-300' : 'bg-surface-2 text-muted-foreground'}`}>{option.canRunTasks ? 'task runtime' : 'profile'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 whitespace-normal break-words w-full">{option.description}</p>
                    <p className="text-[11px] text-muted-foreground/70 whitespace-normal break-words w-full">{option.createsWorkspace}</p>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Display name</label>
                  <input type="text" value={formData.name} onChange={(e) => updateName(e.target.value)} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="e.g. Orchestrator" autoFocus />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Agent/profile ID</label>
                  <input type="text" value={formData.id} onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm" placeholder="orchestrator" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Role / specialisation</label>
                  <input type="text" value={formData.role} onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="operator strategist" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Emoji</label>
                  <div className="flex items-center gap-2">
                    <input type="text" value={formData.emoji} onChange={(e) => setFormData(prev => ({ ...prev, emoji: e.target.value }))} className="w-16 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-center" placeholder="🧭" />
                    <div className="flex flex-wrap gap-1">
                      {['🧭', '🛠️', '⚙️', '🔬', '🔍', '✏️', '🛡️', '🎨', '🚀', '🧠', '📊', '🧪'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, emoji }))}
                          className={`w-8 h-8 rounded border text-lg hover:bg-primary/10 transition-colors ${formData.emoji === emoji ? 'border-primary bg-primary/10' : 'border-border bg-surface-1'}`}
                          aria-label={`Use ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <label className="block text-sm text-muted-foreground">Specialised instructions</label>
                  <div className="flex gap-2">
                    {selectedTemplate && (
                      <button type="button" onClick={saveSelectedTemplateDefaults} className="text-[11px] px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10">
                        Save as template default
                      </button>
                    )}
                    <button type="button" onClick={resetTemplateDefaults} className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:bg-surface-2">
                      Reset templates
                    </button>
                  </div>
                </div>
                <textarea value={formData.instructions} onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50" rows={5} placeholder="Describe how this specialist should work, what it should optimise for, boundaries, preferred stack, review criteria…" />
                {selectedTemplateData && <p className="text-[11px] text-muted-foreground/70 mt-1">Editing {selectedTemplateData.label}. Use “Save as template default” to keep these defaults in this browser.</p>}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Skills allowlist</label>
                  <select
                    multiple
                    value={formData.selectedSkills}
                    onChange={(e) => {
                      const selected = Array.from(e.currentTarget.selectedOptions).map(option => option.value)
                      setFormData(prev => ({ ...prev, selectedSkills: selected }))
                    }}
                    className="w-full min-h-28 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                  >
                    {availableSkills.map(skill => (
                      <option key={`${skill.source || 'skill'}:${skill.name}`} value={skill.name} title={skill.description || skill.source || skill.name}>
                        {skill.name}{skill.source ? ` · ${skill.source}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">Hold Ctrl/Cmd to select multiple. Empty means inherit/default behaviour.</p>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Task tags/types</label>
                  <input type="text" value={formData.taskTagsText} onChange={(e) => setFormData(prev => ({ ...prev, taskTagsText: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="frontend, astro, ui" />
                  <p className="text-[11px] text-muted-foreground/70 mt-1">Used for routing/planning metadata.</p>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Tool profile</label>
                  <select value={formData.toolProfile} onChange={(e) => setFormData(prev => ({ ...prev, toolProfile: e.target.value as ToolProfile }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="template">Template default</option>
                    <option value="readonly">Readonly/review</option>
                    <option value="coding">Coding</option>
                    <option value="orchestrator">Orchestrator</option>
                    <option value="research">Research</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Provider/model</label>
                  <select value={formData.modelPrimary} onChange={(e) => {
                    const value = e.target.value
                    setFormData(prev => ({ ...prev, modelPrimary: value, provider: value.includes('/') ? value.split('/')[0] : prev.provider }))
                  }} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm">
                    <option value={formData.modelPrimary}>{formData.modelPrimary}</option>
                    {groupedModels.map(([provider, models]) => (
                      <optgroup key={provider} label={provider}>
                        {models.map(model => <option key={model.name} value={model.name}>{model.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Raw model override</label>
                  <input type="text" value={formData.modelPrimary} onChange={(e) => setFormData(prev => ({ ...prev, modelPrimary: e.target.value, provider: e.target.value.includes('/') ? e.target.value.split('/')[0] : prev.provider }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Thinking</label>
                  <select value={formData.thinking} onChange={(e) => setFormData(prev => ({ ...prev, thinking: e.target.value as ThinkingLevel }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    {THINKING_OPTIONS.map(option => <option key={option.value || 'default'} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">For reasoning/thinking-capable models.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Workspace mode</label>
                  <select value={formData.workspaceMode} onChange={(e) => setFormData(prev => ({ ...prev, workspaceMode: e.target.value as WorkspaceMode }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="none">No workspace</option>
                    <option value="default">Default/shared workspace</option>
                    <option value="dedicated" disabled={formData.runtime !== 'openclaw'}>Create dedicated OpenClaw workspace</option>
                    <option value="existing">Existing path</option>
                    <option value="runtime">Runtime-managed profile/workspace</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Workspace access</label>
                  <select value={formData.workspaceAccess} onChange={(e) => setFormData(prev => ({ ...prev, workspaceAccess: e.target.value as any }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="rw">Read/write</option>
                    <option value="ro">Read-only</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Subagents</label>
                  <select value={formData.subagentPolicy} onChange={(e) => setFormData(prev => ({ ...prev, subagentPolicy: e.target.value as any }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="template">Template default</option>
                    <option value="none">None</option>
                    <option value="allowed">Allowed by backend</option>
                    <option value="all">Allow all</option>
                  </select>
                </div>
              </div>

              {formData.workspaceMode === 'existing' && (
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Existing workspace path</label>
                  <input type="text" value={formData.existingWorkspacePath} onChange={(e) => setFormData(prev => ({ ...prev, existingWorkspacePath: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-sm" placeholder="/home/leon/project" />
                </div>
              )}

              {formData.runtime === 'openclaw' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Sandbox</label>
                    <select value={formData.sandboxMode} onChange={(e) => setFormData(prev => ({ ...prev, sandboxMode: e.target.value as any }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                      <option value="all">All sessions</option>
                      <option value="non-main">Non-main only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-1">Network</label>
                    <select value={formData.dockerNetwork} onChange={(e) => setFormData(prev => ({ ...prev, dockerNetwork: e.target.value as any }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                      <option value="none">Isolated</option>
                      <option value="bridge">Bridge</option>
                    </select>
                  </div>
                  <label className="flex items-end gap-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={formData.write_to_gateway} onChange={(e) => setFormData(prev => ({ ...prev, write_to_gateway: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                    <span className="text-sm text-foreground">Add to OpenClaw config</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Existing session key / profile target</label>
                <input type="text" value={formData.session_key} onChange={(e) => setFormData(prev => ({ ...prev, session_key: e.target.value }))} className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Optional: existing OpenClaw session key or external profile reference" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {progressSteps ? (
                <div className="space-y-3 py-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">Setting up agent/profile</h4>
                  {progressSteps.map((ps, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        {ps.status === 'active' && <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                        {ps.status === 'done' && <span className="text-green-400 text-sm font-bold">✓</span>}
                        {ps.status === 'error' && <span className="text-red-400 text-sm font-bold">✕</span>}
                        {ps.status === 'pending' && <span className="inline-block w-3 h-3 rounded-full border border-muted-foreground/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${ps.status === 'error' ? 'text-red-400' : ps.status === 'done' ? 'text-green-400' : ps.status === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>{ps.label}</span>
                        {ps.error && <p className="text-xs text-red-400/80 mt-1">{ps.error}</p>}
                      </div>
                    </div>
                  ))}
                  {progressSteps.every(s => s.status === 'done') && <p className="text-sm text-green-400 mt-4">Agent/profile created.</p>}
                </div>
              ) : (
                <>
                  <div className="bg-surface-1/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{formData.emoji || (selectedTemplateData?.emoji || '?')}</span>
                      <div>
                        <h4 className="text-lg font-bold text-foreground">{formData.name || 'Unnamed'}</h4>
                        <p className="text-muted-foreground text-sm">{formData.role}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Backend:</span> <span className="text-foreground">{selectedRuntime.label}</span></div>
                      <div><span className="text-muted-foreground">ID:</span> <span className="text-foreground font-mono">{formData.id}</span></div>
                      <div><span className="text-muted-foreground">Model:</span> <span className="text-foreground font-mono">{formData.modelPrimary}</span></div>
                      <div><span className="text-muted-foreground">Thinking:</span> <span className="text-foreground">{formData.thinking || 'default/inherit'}</span></div>
                      <div><span className="text-muted-foreground">Workspace:</span> <span className="text-foreground">{formData.workspaceMode}</span></div>
                      <div><span className="text-muted-foreground">Skills:</span> <span className="text-foreground">{parsedSkills.length ? parsedSkills.join(', ') : 'inherit/default'}</span></div>
                      <div><span className="text-muted-foreground">Tags:</span> <span className="text-foreground">{parsedTaskTags.length ? parsedTaskTags.join(', ') : 'none'}</span></div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-1/40 p-4">
                    <h4 className="text-sm font-semibold text-foreground mb-2">What will be created</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                      {reviewItems.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-1/40 p-4">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Backend behaviour</h4>
                    <p className="text-sm text-muted-foreground">{selectedRuntime.description}</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">{selectedRuntime.createsWorkspace}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex gap-3 flex-shrink-0">
          {progressSteps ? (
            progressSteps.some(s => s.status === 'error') ? (
              <>
                <div className="flex-1" />
                <Button onClick={() => { setProgressSteps(null); handleCreate() }} size="lg">Retry</Button>
                <Button onClick={onClose} variant="secondary">Close</Button>
              </>
            ) : progressSteps.every(s => s.status === 'done') ? (
              <><div className="flex-1" /><span className="text-sm text-muted-foreground self-center">Closing…</span></>
            ) : <div className="flex-1" />
          ) : (
            <>
              {step > 1 && <Button onClick={() => setStep((step - 1) as 1 | 2 | 3)} variant="secondary">Back</Button>}
              <div className="flex-1" />
              {step < 4 ? (
                <Button onClick={() => setStep((step + 1) as 2 | 3 | 4)} disabled={step === 3 && (!formData.name.trim() || !formData.role.trim())} size="lg">Next</Button>
              ) : (
                <Button onClick={handleCreate} disabled={isCreating || !formData.name.trim() || !formData.role.trim()} size="lg">Create</Button>
              )}
              <Button onClick={onClose} variant="secondary">Cancel</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Config Tab Component for Agent Detail Modal
export function ConfigTab({
  agent,
  workspaceFiles,
  onSaveWorkspaceFile,
  onSave
}: {
  agent: Agent & { config?: any }
  workspaceFiles?: { identityMd: string; agentMd: string }
  onSaveWorkspaceFile?: (file: 'identity.md' | 'agent.md', content: string) => Promise<void>
  onSave: () => void
}) {
  const t = useTranslations('agentDetail')
  const [config, setConfig] = useState<any>(agent.config || {})
  const [editing, setEditing] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jsonInput, setJsonInput] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; source?: string; description?: string }>>([])
  const [newFallbackModel, setNewFallbackModel] = useState('')
  const [newAllowTool, setNewAllowTool] = useState('')
  const [newDenyTool, setNewDenyTool] = useState('')
  const [identityMdInput, setIdentityMdInput] = useState('')
  const [agentMdInput, setAgentMdInput] = useState('')
  const [savingIdentityMd, setSavingIdentityMd] = useState(false)
  const [savingAgentMd, setSavingAgentMd] = useState(false)
  const [workspaceDocs, setWorkspaceDocs] = useState<Array<{ name: string; exists: boolean; content: string }>>([])
  const [loadingWorkspaceDocs, setLoadingWorkspaceDocs] = useState(false)

  useEffect(() => {
    setConfig(agent.config || {})
    setJsonInput(JSON.stringify(agent.config || {}, null, 2))
  }, [agent.config])

  useEffect(() => {
    setIdentityMdInput(String(workspaceFiles?.identityMd || ''))
    setAgentMdInput(String(workspaceFiles?.agentMd || ''))
  }, [workspaceFiles?.identityMd, workspaceFiles?.agentMd])

  useEffect(() => {
    const loadWorkspaceDocs = async () => {
      setLoadingWorkspaceDocs(true)
      try {
        const response = await fetch(`/api/agents/${agent.id}/files`)
        if (!response.ok) return
        const payload = await response.json()
        const entries = Object.entries(payload?.files || {}).map(([name, value]: [string, any]) => ({
          name,
          exists: Boolean(value?.exists),
          content: String(value?.content || ''),
        }))
        setWorkspaceDocs(entries)
      } catch {
        setWorkspaceDocs([])
      } finally {
        setLoadingWorkspaceDocs(false)
      }
    }
    loadWorkspaceDocs()
  }, [agent.id])

  useEffect(() => {
    const loadAvailableModels = async () => {
      try {
        const response = await fetch('/api/status?action=models')
        if (!response.ok) return
        const data = await response.json()
        const models = Array.isArray(data.models) ? data.models : []
        const names = models
          .map((model: any) => String(model.name || model.alias || '').trim())
          .filter(Boolean)
        setAvailableModels(Array.from(new Set<string>(names)))
      } catch {
        // Ignore model suggestions if unavailable.
      }
    }

    const loadAvailableSkills = async () => {
      try {
        const response = await fetch('/api/skills')
        if (!response.ok) return
        const data = await response.json()
        const skills = Array.isArray(data.skills) ? data.skills : []
        setAvailableSkills(skills.map((skill: any) => ({
          name: String(skill.name || '').trim(),
          source: skill.source ? String(skill.source) : undefined,
          description: skill.description ? String(skill.description) : undefined,
        })).filter((skill: { name: string }) => skill.name))
      } catch {
        // Ignore skill suggestions if unavailable.
      }
    }

    loadAvailableModels()
    loadAvailableSkills()
  }, [])

  const updateModelConfig = (updater: (current: { primary?: string; fallbacks?: string[] }) => { primary?: string; fallbacks?: string[] }) => {
    setConfig((prev: any) => {
      const nextModel = updater({ ...(prev?.model || {}) })
      const dedupedFallbacks = [...new Set((nextModel.fallbacks || []).map((value) => (value || '').trim()).filter(Boolean))]
      return {
        ...prev,
        model: {
          ...nextModel,
          fallbacks: dedupedFallbacks,
        },
      }
    })
  }

  const addFallbackModel = () => {
    const trimmed = newFallbackModel.trim()
    if (!trimmed) return
    updateModelConfig((current) => ({
      ...current,
      fallbacks: [...(current.fallbacks || []), trimmed],
    }))
    setNewFallbackModel('')
  }

  const updateIdentityField = (field: string, value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      identity: { ...(prev.identity || {}), [field]: value },
    }))
  }

  const updateSandboxField = (field: string, value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      sandbox: { ...(prev.sandbox || {}), [field]: value },
    }))
  }

  const addTool = (list: 'allow' | 'deny', value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setConfig((prev: any) => {
      const tools = prev.tools || {}
      const existing = Array.isArray(tools[list]) ? tools[list] : []
      if (existing.includes(trimmed)) return prev
      return { ...prev, tools: { ...tools, [list]: [...existing, trimmed] } }
    })
  }

  const removeTool = (list: 'allow' | 'deny', index: number) => {
    setConfig((prev: any) => {
      const tools = prev.tools || {}
      const existing = Array.isArray(tools[list]) ? [...tools[list]] : []
      existing.splice(index, 1)
      return { ...prev, tools: { ...tools, [list]: existing } }
    })
  }

  const saveWorkspaceFile = async (file: 'identity.md' | 'agent.md') => {
    if (!onSaveWorkspaceFile) return
    const content = file === 'identity.md' ? identityMdInput : agentMdInput
    if (file === 'identity.md') {
      setSavingIdentityMd(true)
    } else {
      setSavingAgentMd(true)
    }
    setError(null)
    try {
      await onSaveWorkspaceFile(file, content)
    } catch (err: any) {
      setError(err?.message || `Failed to save ${file}`)
    } finally {
      if (file === 'identity.md') {
        setSavingIdentityMd(false)
      } else {
        setSavingAgentMd(false)
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (!showJson) {
        const primary = String(config?.model?.primary || '').trim()
        if (!primary) {
          throw new Error('Primary model is required')
        }
      }
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_config: showJson ? JSON.parse(jsonInput) : config,
          write_to_gateway: runtimeType === 'openclaw',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save')
      setEditing(false)
      onSave()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const model = config.model || {}
  const identity = config.identity || {}
  const sandbox = config.sandbox || {}
  const tools = config.tools || {}
  const subagents = config.subagents || {}
  const memorySearch = config.memorySearch || {}
  const sandboxMode = sandbox.mode || sandbox.sandboxMode || sandbox.sandbox_mode || config.sandboxMode || 'not configured'
  const sandboxWorkspace = sandbox.workspaceAccess || sandbox.workspace_access || sandbox.workspace || config.workspaceAccess || 'not configured'
  const sandboxNetwork = sandbox?.docker?.network || sandbox.network || sandbox.dockerNetwork || sandbox.docker_network || 'none'
  const identityName = identity.name || agent.name || 'not configured'
  const identityTheme = identity.theme || agent.role || 'not configured'
  const identityEmoji = identity.emoji || '?'
  const identityPreview = identity.content || ''
  const toolAllow = Array.isArray(tools.allow) ? tools.allow : []
  const toolDeny = Array.isArray(tools.deny) ? tools.deny : []
  const toolRawPreview = typeof tools.raw === 'string' ? tools.raw : ''
  const modelPrimary = model.primary || ''
  const modelFallbacks = Array.isArray(model.fallbacks) ? model.fallbacks : []
  const selectedSkills = Array.isArray(config.skills) ? config.skills.map((skill: any) => String(skill)).filter(Boolean) : []
  const skillOptions = [
    ...availableSkills,
    ...selectedSkills
      .filter((name: string) => !availableSkills.some(skill => skill.name === name))
      .map((name: string) => ({ name, source: 'configured' })),
  ]
  const runtimeType = config.runtime_type || config.runtime?.type || (agent as any).runtime_type || 'openclaw'
  const thinkingValue = String(config.thinking || config.thinkingDefault || '') as ThinkingLevel
  const runtimeProfile = config.hermesProfile || config.runtime?.profile || config.openclawId || ''
  const runtimeWorkspace = config.hermesProfileDir || config.runtime?.profileDir || config.workspace || config.cwd || ''

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-medium text-foreground">{t('openclawConfig')}</h4>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowJson(!showJson)}
            variant="secondary"
            size="xs"
          >
            {showJson ? t('structured') : 'JSON'}
          </Button>
          {!editing && (
            <Button
              onClick={() => setEditing(true)}
              size="sm"
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {config.openclawId && (
        <div className="text-xs text-muted-foreground">
          OpenClaw ID: <span className="font-mono text-foreground">{config.openclawId}</span>
          {config.isDefault && <span className="ml-2 px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs">{t('default')}</span>}
        </div>
      )}

      {showJson ? (
        /* JSON view */
        <div>
          {editing ? (
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={20}
              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          ) : (
            <pre className="bg-surface-1/30 rounded p-4 text-xs text-foreground/90 overflow-auto max-h-96 font-mono">
              {JSON.stringify(config, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        /* Structured view */
        <div className="space-y-4">
          {/* Runtime */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">Runtime</h5>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><span className="text-muted-foreground">Type:</span> <span className="text-foreground font-mono">{runtimeType}</span></div>
              <div><span className="text-muted-foreground">Profile:</span> <span className="text-foreground font-mono">{runtimeProfile || t('notConfigured')}</span></div>
              <div className="min-w-0"><span className="text-muted-foreground">Workspace:</span> <span className="text-foreground font-mono break-words">{runtimeWorkspace || t('notConfigured')}</span></div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1">Thinking</label>
              {editing ? (
                <select
                  value={thinkingValue}
                  onChange={(e) => {
                    const value = e.target.value as ThinkingLevel
                    setConfig((prev: any) => {
                      const next = { ...prev }
                      if (value) {
                        next.thinking = value
                        next.thinkingDefault = value
                      } else {
                        delete next.thinking
                        delete next.thinkingDefault
                      }
                      return next
                    })
                  }}
                  className="w-full max-w-xs bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                >
                  {THINKING_OPTIONS.map(option => <option key={option.value || 'default'} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <span className="text-foreground text-sm">{thinkingValue || 'default/inherit'}</span>
              )}
            </div>
          </div>

          {/* Skills */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">Skills</h5>
            {editing ? (
              <div className="space-y-2">
                <select
                  multiple
                  value={selectedSkills}
                  onChange={(e) => {
                    const next = Array.from(e.currentTarget.selectedOptions).map(option => option.value)
                    setConfig((prev: any) => ({ ...prev, skills: next }))
                  }}
                  className="w-full min-h-36 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                >
                  {skillOptions.map(skill => (
                    <option key={`${skill.source || 'skill'}:${skill.name}`} value={skill.name} title={skill.description || skill.source || skill.name}>
                      {skill.name}{skill.source ? ` · ${skill.source}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Hold Ctrl/Cmd to select multiple. Empty means no explicit skill allowlist.</p>
              </div>
            ) : selectedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedSkills.map((skill: string) => (
                  <span key={skill} className="px-2 py-1 text-xs rounded bg-surface-2 text-foreground font-mono">{skill}</span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No explicit skills configured</div>
            )}
          </div>

          {/* Model */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">{t('model')}</h5>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('primaryModel')}</label>
                  <input
                    value={modelPrimary}
                    onChange={(e) => updateModelConfig((current) => ({ ...current, primary: e.target.value }))}
                    list="agent-model-suggestions"
                    placeholder="anthropic/claude-sonnet-4-20250514"
                    className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <datalist id="agent-model-suggestions">
                    {availableModels.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('fallbackModels')}</label>
                  <div className="space-y-2">
                    {modelFallbacks.map((fallback: string, index: number) => (
                      <div key={`${fallback}-${index}`} className="flex gap-2">
                        <input
                          value={fallback}
                          onChange={(e) => {
                            const next = [...modelFallbacks]
                            next[index] = e.target.value
                            updateModelConfig((current) => ({ ...current, fallbacks: next }))
                          }}
                          list="agent-model-suggestions"
                          className="flex-1 bg-surface-1 text-foreground rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <Button
                          onClick={() => {
                            const next = modelFallbacks.filter((_: string, i: number) => i !== index)
                            updateModelConfig((current) => ({ ...current, fallbacks: next }))
                          }}
                          variant="destructive"
                          size="xs"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={newFallbackModel}
                        onChange={(e) => setNewFallbackModel(e.target.value)}
                        list="agent-model-suggestions"
                        placeholder={t('addFallbackModel')}
                        className="flex-1 bg-surface-1 text-foreground rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <Button
                        onClick={addFallbackModel}
                        variant="secondary"
                        size="xs"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm">
                <div><span className="text-muted-foreground">{t('primary')}:</span> <span className="text-foreground font-mono">{modelPrimary || t('notConfigured')}</span></div>
                {modelFallbacks.length > 0 && (
                  <div className="mt-1">
                    <span className="text-muted-foreground">{t('fallbacks')}:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {modelFallbacks.map((fb: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-surface-2 rounded text-muted-foreground font-mono">{fb.split('/').pop()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">{t('identity')}</h5>
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('emoji')}</label>
                    <input
                      value={identityEmoji}
                      onChange={(e) => updateIdentityField('emoji', e.target.value)}
                      className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="🤖"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('name')}</label>
                    <input
                      value={identity.name || ''}
                      onChange={(e) => updateIdentityField('name', e.target.value)}
                      className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="Agent name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('themeRole')}</label>
                    <input
                      value={identity.theme || ''}
                      onChange={(e) => updateIdentityField('theme', e.target.value)}
                      className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                      placeholder="e.g. backend engineer"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('identityContent')}</label>
                  <textarea
                    value={identity.content || ''}
                    onChange={(e) => updateIdentityField('content', e.target.value)}
                    rows={4}
                    className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="Describe the agent's identity and personality..."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-2xl">{identityEmoji}</span>
                  <div>
                    <div className="text-foreground font-medium">{identityName}</div>
                    <div className="text-muted-foreground">{identityTheme}</div>
                  </div>
                </div>
                {identityPreview && (
                  <pre className="mt-3 text-xs text-muted-foreground bg-surface-1 rounded p-2 overflow-auto whitespace-pre-wrap">
                    {identityPreview}
                  </pre>
                )}
              </>
            )}
          </div>

          {/* Workspace files */}
          <div className="bg-surface-1/50 rounded-lg p-4 space-y-4">
            <h5 className="text-sm font-medium text-foreground">{t('workspaceFiles')}</h5>
            <p className="text-xs text-muted-foreground">
              {t('workspaceFilesDesc')}
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground font-medium">identity.md</label>
                {editing && onSaveWorkspaceFile && (
                  <Button
                    onClick={() => saveWorkspaceFile('identity.md')}
                    disabled={savingIdentityMd}
                    size="xs"
                  >
                    {savingIdentityMd ? t('saving') : t('saveIdentityMd')}
                  </Button>
                )}
              </div>
              {editing ? (
                <textarea
                  rows={6}
                  value={identityMdInput}
                  onChange={(e) => setIdentityMdInput(e.target.value)}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="identity.md content..."
                />
              ) : (
                <pre className="bg-surface-1 rounded p-3 text-xs text-muted-foreground overflow-auto whitespace-pre-wrap min-h-[96px]">
                  {identityMdInput || t('identityMdEmpty')}
                </pre>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground font-medium">agent.md</label>
                {editing && onSaveWorkspaceFile && (
                  <Button onClick={() => saveWorkspaceFile('agent.md')} disabled={savingAgentMd} size="xs">
                    {savingAgentMd ? t('saving') : t('saveAgentMd')}
                  </Button>
                )}
              </div>
              {editing ? (
                <textarea
                  rows={8}
                  value={agentMdInput}
                  onChange={(e) => setAgentMdInput(e.target.value)}
                  className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="agent.md content..."
                />
              ) : (
                <pre className="bg-surface-1 rounded p-3 text-xs text-muted-foreground overflow-auto whitespace-pre-wrap min-h-[120px]">
                  {agentMdInput || t('agentMdEmpty')}
                </pre>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">{t('otherMarkdownFiles')}</label>
              {loadingWorkspaceDocs ? (
                <div className="text-xs text-muted-foreground">{t('loadingWorkspaceFiles')}</div>
              ) : (
                <div className="space-y-2">
                  {workspaceDocs
                    .filter((doc) => !['identity.md', 'agent.md'].includes(doc.name))
                    .map((doc) => (
                      <div key={doc.name} className="bg-surface-1 rounded p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono text-foreground">{doc.name}</span>
                          <span className={`text-2xs ${doc.exists ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {doc.exists ? t('chars', { count: doc.content.length }) : t('missing')}
                          </span>
                        </div>
                        <pre className="text-xs text-muted-foreground overflow-auto whitespace-pre-wrap max-h-32">
                          {doc.exists ? doc.content : t('fileNotFound', { name: doc.name })}
                        </pre>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Sandbox */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">{t('sandbox')}</h5>
            {editing ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('mode')}</label>
                  <select
                    value={sandbox.mode || ''}
                    onChange={(e) => updateSandboxField('mode', e.target.value)}
                    className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="">{t('notConfigured')}</option>
                    <option value="all">{t('all')}</option>
                    <option value="non-main">{t('nonMain')}</option>
                    <option value="none">{t('none')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('workspaceAccess')}</label>
                  <select
                    value={sandbox.workspaceAccess || ''}
                    onChange={(e) => updateSandboxField('workspaceAccess', e.target.value)}
                    className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="">{t('notConfigured')}</option>
                    <option value="rw">{t('readWrite')}</option>
                    <option value="ro">{t('readOnly')}</option>
                    <option value="none">{t('none')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">{t('network')}</label>
                  <input
                    value={sandbox.network || ''}
                    onChange={(e) => updateSandboxField('network', e.target.value)}
                    className="w-full bg-surface-1 text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={t('none')}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">{t('mode')}:</span> <span className="text-foreground">{sandboxMode}</span></div>
                <div><span className="text-muted-foreground">{t('workspace')}:</span> <span className="text-foreground">{sandboxWorkspace}</span></div>
                <div><span className="text-muted-foreground">{t('network')}:</span> <span className="text-foreground">{sandboxNetwork}</span></div>
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">{t('tools')}</h5>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-green-400 font-medium mb-1">{t('allowList')}</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {toolAllow.map((tool: string, i: number) => (
                      <span key={`${tool}-${i}`} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 flex items-center gap-1">
                        {tool}
                        <Button onClick={() => removeTool('allow', i)} variant="ghost" size="icon-xs" className="text-green-400/60 hover:text-green-400 ml-1 h-auto w-auto p-0">&times;</Button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newAllowTool}
                      onChange={(e) => setNewAllowTool(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool('allow', newAllowTool); setNewAllowTool('') } }}
                      placeholder={t('addAllowedTool')}
                      className="flex-1 bg-surface-1 text-foreground rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <Button
                      onClick={() => { addTool('allow', newAllowTool); setNewAllowTool('') }}
                      variant="outline"
                      size="sm"
                      className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"
                    >
                      {t('add')}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-red-400 font-medium mb-1">{t('denyList')}</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {toolDeny.map((tool: string, i: number) => (
                      <span key={`${tool}-${i}`} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 flex items-center gap-1">
                        {tool}
                        <Button onClick={() => removeTool('deny', i)} variant="ghost" size="icon-xs" className="text-red-400/60 hover:text-red-400 ml-1 h-auto w-auto p-0">&times;</Button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newDenyTool}
                      onChange={(e) => setNewDenyTool(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool('deny', newDenyTool); setNewDenyTool('') } }}
                      placeholder={t('addDeniedTool')}
                      className="flex-1 bg-surface-1 text-foreground rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <Button
                      onClick={() => { addTool('deny', newDenyTool); setNewDenyTool('') }}
                      variant="outline"
                      size="sm"
                      className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                    >
                      {t('add')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {toolAllow.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-green-400 font-medium">{t('allowCount', { count: toolAllow.length })}:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {toolAllow.map((tool: string) => (
                        <span key={tool} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20">{tool}</span>
                      ))}
                    </div>
                  </div>
                )}
                {toolDeny.length > 0 && (
                  <div>
                    <span className="text-xs text-red-400 font-medium">{t('denyCount', { count: toolDeny.length })}:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {toolDeny.map((tool: string) => (
                        <span key={tool} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20">{tool}</span>
                      ))}
                    </div>
                  </div>
                )}
                {toolAllow.length === 0 && toolDeny.length === 0 && !toolRawPreview && (
                  <div className="text-xs text-muted-foreground">{t('noToolsConfigured')}</div>
                )}
                {toolRawPreview && (
                  <pre className="mt-3 text-xs text-muted-foreground bg-surface-1 rounded p-2 overflow-auto whitespace-pre-wrap">
                    {toolRawPreview}
                  </pre>
                )}
              </>
            )}
          </div>

          {/* Subagents */}
          <div className="bg-surface-1/50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-foreground mb-2">{t('subAgents')}</h5>
            {editing ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {(subagents.allowAgents || []).map((a: string, idx: number) => (
                    <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-violet-500/10 text-violet-400 rounded border border-violet-500/20">
                      {a}
                      <button
                        onClick={() => {
                          setConfig((prev: any) => {
                            const sa = { ...(prev.subagents || {}) }
                            const list = [...(sa.allowAgents || [])]
                            list.splice(idx, 1)
                            return { ...prev, subagents: { ...sa, allowAgents: list } }
                          })
                        }}
                        className="text-violet-400/60 hover:text-violet-400 ml-0.5"
                        title={`Remove sub-agent ${a}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t('addSubAgentPlaceholder')}
                    className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (!val) return
                        setConfig((prev: any) => {
                          const sa = { ...(prev.subagents || {}) }
                          const existing = Array.isArray(sa.allowAgents) ? sa.allowAgents : []
                          if (existing.includes(val)) return prev
                          return { ...prev, subagents: { ...sa, allowAgents: [...existing, val] } }
                        });
                        (e.target as HTMLInputElement).value = ''
                      }
                    }}
                  />
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={(e) => {
                      const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement | null
                      if (!input) return
                      const val = input.value.trim()
                      if (!val) return
                      setConfig((prev: any) => {
                        const sa = { ...(prev.subagents || {}) }
                        const existing = Array.isArray(sa.allowAgents) ? sa.allowAgents : []
                        if (existing.includes(val)) return prev
                        return { ...prev, subagents: { ...sa, allowAgents: [...existing, val] } }
                      })
                      input.value = ''
                    }}
                  >
                    {t('add')}
                  </Button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('subAgentModelOverride')}</label>
                  <select
                    value={subagents.model || ''}
                    onChange={(e) => {
                      setConfig((prev: any) => ({
                        ...prev,
                        subagents: { ...(prev.subagents || {}), model: e.target.value || undefined }
                      }))
                    }}
                    className="w-full mt-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">{t('defaultInheritFromAgent')}</option>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                {subagents.allowAgents && subagents.allowAgents.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {subagents.allowAgents.map((a: string) => (
                        <span key={a} className="px-2 py-0.5 text-xs bg-violet-500/10 text-violet-400 rounded border border-violet-500/20">{a}</span>
                      ))}
                    </div>
                    {subagents.model && (
                      <div className="text-xs text-muted-foreground mt-1">{t('modelLabel')}: {subagents.model}</div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">{t('noSubAgentsConfigured')}</div>
                )}
              </>
            )}
          </div>

          {/* Memory Search */}
          {memorySearch.sources && (
            <div className="bg-surface-1/50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('memorySearch')}</h5>
              <div className="flex gap-1">
                {memorySearch.sources.map((s: string) => (
                  <span key={s} className="px-2 py-0.5 text-xs bg-cyan-500/10 text-cyan-400 rounded">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {editing && (
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? t('saving') : t('save')}
          </Button>
          <Button
            onClick={() => {
              setEditing(false)
              setConfig(agent.config || {})
              setJsonInput(JSON.stringify(agent.config || {}, null, 2))
            }}
            variant="secondary"
          >
            {t('cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ===== Files Tab — Agent workspace file browser with inline editor =====

interface FileEntry {
  name: string
  exists: boolean
  content: string
}

export function FilesTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [workspace, setWorkspace] = useState<string | null>(null)

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/agents/${agent.id}/files`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to load files')
      }
      const data = await response.json()
      setWorkspace(data.workspace || null)
      const entries = Object.entries(data.files || {}).map(([name, value]: [string, any]) => ({
        name,
        exists: Boolean(value?.exists),
        content: String(value?.content || ''),
      }))
      setFiles(entries)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [agent.id])

  const activeEntry = activeFile ? files.find(f => f.name === activeFile) : null
  const baseContent = activeEntry?.content || ''
  const isDirty = activeFile ? draft !== baseContent : false

  const selectFile = (name: string) => {
    const entry = files.find(f => f.name === name)
    setActiveFile(name)
    setDraft(entry?.content || '')
  }

  const handleSave = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const response = await fetch(`/api/agents/${agent.id}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: activeFile, content: draft }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save file')
      }
      setFiles(prev => prev.map(f =>
        f.name === activeFile ? { ...f, exists: true, content: draft } : f
      ))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && files.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center py-8">
        <Loader variant="inline" label="Loading files" />
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('workspaceFiles')}</h4>
          {workspace && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{workspace}</p>
          )}
        </div>
        <Button onClick={loadFiles} size="sm" variant="secondary" disabled={loading}>
          {loading ? '...' : t('refresh')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[200px_1fr] gap-4 min-h-[400px]">
        {/* File list */}
        <div className="space-y-1 border-r border-border pr-3">
          {files.map(file => (
            <button
              key={file.name}
              onClick={() => selectFile(file.name)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                activeFile === file.name
                  ? 'bg-primary/10 text-foreground border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-1/50'
              }`}
            >
              <div className="font-mono text-xs">{file.name}</div>
              <div className="text-2xs mt-0.5">
                {file.exists
                  ? t('charCount', { count: file.content.length })
                  : <span className="text-amber-400">{t('missing')}</span>
                }
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div>
          {!activeEntry ? (
            <div className="text-muted-foreground text-sm flex items-center justify-center h-full">
              {t('selectFile')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono text-sm text-foreground">{activeEntry.name}</span>
                  {!activeEntry.exists && (
                    <span className="ml-2 px-1.5 py-0.5 text-2xs bg-amber-500/20 text-amber-400 rounded">{t('missing')}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setDraft(baseContent)}
                    size="xs"
                    variant="secondary"
                    disabled={!isDirty}
                  >
                    {t('reset')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    size="xs"
                    disabled={saving || !isDirty}
                  >
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={20}
                className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y"
                placeholder={activeEntry.exists ? '' : t('fileNotExistYet')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Tools Tab — Tool allow/deny list management =====

export function ToolsTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const agentConfig = (agent as any).config || {}
  const tools = agentConfig.tools || {}
  const toolAllow = Array.isArray(tools.allow) ? tools.allow : []
  const toolDeny = Array.isArray(tools.deny) ? tools.deny : []
  const toolAlsoAllow = Array.isArray(tools.alsoAllow) ? tools.alsoAllow : []
  const profile = tools.profile || 'default'

  const [allowList, setAllowList] = useState<string[]>(toolAllow)
  const [denyList, setDenyList] = useState<string[]>(toolDeny)
  const [alsoAllowList, setAlsoAllowList] = useState<string[]>(toolAlsoAllow)
  const [newAllow, setNewAllow] = useState('')
  const [newDeny, setNewDeny] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isDirty = JSON.stringify(allowList) !== JSON.stringify(toolAllow)
    || JSON.stringify(denyList) !== JSON.stringify(toolDeny)
    || JSON.stringify(alsoAllowList) !== JSON.stringify(toolAlsoAllow)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_config: {
            tools: {
              ...tools,
              allow: allowList,
              deny: denyList,
              alsoAllow: alsoAllowList,
            },
          },
          write_to_gateway: true,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save tools')
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addToList = (list: string[], setList: (v: string[]) => void, value: string) => {
    const trimmed = value.trim()
    if (!trimmed || list.includes(trimmed)) return
    setList([...list, trimmed])
  }

  const removeFromList = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('toolConfiguration')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('profileLabel')}: <span className="font-mono text-foreground">{profile}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {success && <span className="text-xs text-green-400">{t('saved')}</span>}
          <Button onClick={handleSave} size="sm" disabled={saving || !isDirty}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Allow list */}
      <div className="bg-surface-1/50 rounded-lg p-4">
        <h5 className="text-sm font-medium text-green-400 mb-2">{t('allowListCount', { count: allowList.length })}</h5>
        <div className="flex flex-wrap gap-1 mb-3">
          {allowList.map((tool, i) => (
            <span key={`${tool}-${i}`} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 rounded border border-green-500/20 flex items-center gap-1">
              {tool}
              <button onClick={() => removeFromList(allowList, setAllowList, i)} className="text-green-400/60 hover:text-green-400 ml-0.5">x</button>
            </span>
          ))}
          {allowList.length === 0 && <span className="text-xs text-muted-foreground">{t('noExplicitAllowList')}</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={newAllow}
            onChange={(e) => setNewAllow(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addToList(allowList, setAllowList, newAllow)
                setNewAllow('')
              }
            }}
            placeholder={t('addToolToAllowList')}
            className="flex-1 bg-surface-1 text-foreground rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button onClick={() => { addToList(allowList, setAllowList, newAllow); setNewAllow('') }} variant="secondary" size="xs">
            {t('add')}
          </Button>
        </div>
      </div>

      {/* Also-Allow list */}
      <div className="bg-surface-1/50 rounded-lg p-4">
        <h5 className="text-sm font-medium text-cyan-400 mb-2">{t('alsoAllowCount', { count: alsoAllowList.length })}</h5>
        <p className="text-2xs text-muted-foreground mb-2">{t('alsoAllowDesc')}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {alsoAllowList.map((tool, i) => (
            <span key={`${tool}-${i}`} className="px-2 py-0.5 text-xs bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 flex items-center gap-1">
              {tool}
              <button onClick={() => removeFromList(alsoAllowList, setAlsoAllowList, i)} className="text-cyan-400/60 hover:text-cyan-400 ml-0.5">x</button>
            </span>
          ))}
          {alsoAllowList.length === 0 && <span className="text-xs text-muted-foreground">{t('none')}</span>}
        </div>
      </div>

      {/* Deny list */}
      <div className="bg-surface-1/50 rounded-lg p-4">
        <h5 className="text-sm font-medium text-red-400 mb-2">{t('denyListCount', { count: denyList.length })}</h5>
        <div className="flex flex-wrap gap-1 mb-3">
          {denyList.map((tool, i) => (
            <span key={`${tool}-${i}`} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded border border-red-500/20 flex items-center gap-1">
              {tool}
              <button onClick={() => removeFromList(denyList, setDenyList, i)} className="text-red-400/60 hover:text-red-400 ml-0.5">x</button>
            </span>
          ))}
          {denyList.length === 0 && <span className="text-xs text-muted-foreground">{t('noDeniedTools')}</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={newDeny}
            onChange={(e) => setNewDeny(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addToList(denyList, setDenyList, newDeny)
                setNewDeny('')
              }
            }}
            placeholder={t('addToolToDenyList')}
            className="flex-1 bg-surface-1 text-foreground rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button onClick={() => { addToList(denyList, setDenyList, newDeny); setNewDeny('') }} variant="secondary" size="xs">
            {t('add')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Channels Tab — Per-agent channel assignment view =====

interface ChannelAccountInfo {
  id?: string
  connected?: boolean
  running?: boolean
  configured?: boolean
  enabled?: boolean
  probe?: { ok?: boolean }
}

interface ChannelEntryInfo {
  id: string
  label: string
  accounts: ChannelAccountInfo[]
}

export function ChannelsTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const [channels, setChannels] = useState<ChannelEntryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadChannels = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/channels')
      if (!response.ok) throw new Error('Failed to load channels')
      const data = await response.json()

      const snapshot = data.channels || data
      const channelOrder: string[] = snapshot.channelOrder || []
      const channelMeta: Array<{ id: string; label?: string }> = snapshot.channelMeta || []
      const channelAccounts: Record<string, ChannelAccountInfo[]> = snapshot.channelAccounts || {}
      const channelLabels: Record<string, string> = snapshot.channelLabels || {}

      const ids = new Set<string>()
      for (const id of channelOrder) ids.add(id)
      for (const entry of channelMeta) ids.add(entry.id)
      for (const id of Object.keys(channelAccounts)) ids.add(id)

      const entries: ChannelEntryInfo[] = Array.from(ids).map(id => {
        const meta = channelMeta.find(m => m.id === id)
        return {
          id,
          label: meta?.label || channelLabels[id] || id,
          accounts: channelAccounts[id] || [],
        }
      })

      setChannels(entries)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadChannels() }, [])

  if (loading && channels.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center py-8">
        <Loader variant="inline" label="Loading channels" />
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('channelStatus')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('channelStatusDesc', { agent: agent.name })}
          </p>
        </div>
        <Button onClick={loadChannels} size="sm" variant="secondary" disabled={loading}>
          {loading ? '...' : t('refresh')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {channels.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          {t('noChannelsFound')}
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(channel => {
            const total = channel.accounts.length
            const connected = channel.accounts.filter(a => {
              const probeOk = a.probe && typeof a.probe === 'object' && 'ok' in a.probe ? Boolean(a.probe.ok) : false
              return a.connected === true || a.running === true || probeOk
            }).length
            const enabled = channel.accounts.filter(a => a.enabled).length
            const configured = channel.accounts.filter(a => a.configured).length

            return (
              <div key={channel.id} className="bg-surface-1/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{channel.label}</div>
                  <div className="text-xs font-mono text-muted-foreground">{channel.id}</div>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{total > 0 ? t('connectedOf', { connected, total }) : t('noAccounts')}</span>
                  <span>{configured > 0 ? t('configuredCount', { count: configured }) : t('notConfigured')}</span>
                  <span className={enabled > 0 ? 'text-green-400' : ''}>{total > 0 ? t('enabledCount', { count: enabled }) : t('disabled')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== Cron Tab — Per-agent cron jobs =====

interface AgentCronJob {
  name: string
  description?: string
  agentId?: string
  schedule?: string
  cron?: string
  enabled?: boolean
  lastRun?: string | number | null
  nextRun?: string | number | null
  sessionTarget?: string
  state?: string
  payload?: any
}

export function CronTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const [allJobs, setAllJobs] = useState<AgentCronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const loadCron = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/cron?action=list')
      if (!response.ok) throw new Error('Failed to load cron jobs')
      const data = await response.json()
      setAllJobs(data.jobs || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCron() }, [])

  const agentName = agent.name.toLowerCase().replace(/\s+/g, '-')
  const agentJobs = showAll
    ? allJobs
    : allJobs.filter(j =>
        j.agentId === agent.name
        || j.agentId === agentName
        || j.agentId === String(agent.id)
      )

  const formatTime = (value: string | number | null | undefined) => {
    if (!value) return 'n/a'
    const d = typeof value === 'number' ? new Date(value) : new Date(value)
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString()
  }

  if (loading && allJobs.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center py-8">
        <Loader variant="inline" label="Loading cron jobs" />
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('cronJobs')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {showAll ? t('allCronJobsCount', { count: agentJobs.length, total: allJobs.length }) : t('agentCronJobsCount', { count: agentJobs.length, total: allJobs.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAll(!showAll)}
            size="xs"
            variant={showAll ? 'outline' : 'secondary'}
          >
            {showAll ? t('agentOnly') : t('showAll')}
          </Button>
          <Button onClick={loadCron} size="sm" variant="secondary" disabled={loading}>
            {loading ? '...' : t('refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {agentJobs.length === 0 ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          {showAll ? t('noCronJobsFound') : t('noCronJobsAssigned', { agent: agent.name })}
        </div>
      ) : (
        <div className="space-y-2">
          {agentJobs.map(job => (
            <div key={job.name} className="bg-surface-1/50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{job.name}</div>
                  {job.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{job.description}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 text-xs bg-surface-2 rounded font-mono">
                      {job.schedule || job.cron || t('noSchedule')}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      job.enabled ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {job.enabled ? t('enabled') : t('disabled')}
                    </span>
                    {job.sessionTarget && (
                      <span className="px-2 py-0.5 text-xs bg-surface-2 rounded text-muted-foreground">
                        {job.sessionTarget}
                      </span>
                    )}
                    {job.agentId && (
                      <span className="px-2 py-0.5 text-xs bg-violet-500/10 text-violet-400 rounded">
                        {job.agentId}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-1">
                  <div>{t('last')}: {formatTime(job.lastRun)}</div>
                  <div>{t('next')}: {formatTime(job.nextRun)}</div>
                  {job.state && <div className="font-mono">{job.state}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== Models Tab — Model fallback chain =====

export function ModelsTab({ agent }: { agent: Agent }) {
  const t = useTranslations('agentDetail')
  const agentConfig = (agent as any).config || {}
  const modelCfg = agentConfig.model || {}
  const modelPrimary = typeof modelCfg === 'string' ? modelCfg : (modelCfg.primary || '')
  const modelFallbacks: string[] = Array.isArray(modelCfg.fallbacks) ? modelCfg.fallbacks : []

  const [primary, setPrimary] = useState(modelPrimary)
  const [fallbacks, setFallbacks] = useState<string[]>(modelFallbacks)
  const [newFallback, setNewFallback] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [availableModels, setAvailableModels] = useState<Array<{ alias: string }>>([])

  useEffect(() => {
    fetch('/api/status?action=models')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.models) setAvailableModels(data.models)
      })
      .catch(() => {})
  }, [])

  const isDirty = primary !== modelPrimary || JSON.stringify(fallbacks) !== JSON.stringify(modelFallbacks)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_config: {
            model: {
              primary: (primary || '').trim(),
              fallbacks: fallbacks.filter(f => f && f.trim()),
            },
          },
          write_to_gateway: true,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save model config')
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addFallback = () => {
    const trimmed = newFallback.trim()
    if (!trimmed || fallbacks.includes(trimmed)) return
    setFallbacks([...fallbacks, trimmed])
    setNewFallback('')
  }

  const removeFallback = (index: number) => {
    setFallbacks(fallbacks.filter((_, i) => i !== index))
  }

  const moveFallback = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= fallbacks.length) return
    const next = [...fallbacks]
    const [item] = next.splice(index, 1)
    next.splice(newIndex, 0, item)
    setFallbacks(next)
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-lg font-medium text-foreground">{t('modelConfiguration')}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{t('modelConfigurationDesc')}</p>
        </div>
        <div className="flex items-center gap-2">
          {success && <span className="text-xs text-green-400">{t('saved')}</span>}
          <Button onClick={handleSave} size="sm" disabled={saving || !isDirty}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Primary model */}
      <div className="bg-surface-1/50 rounded-lg p-4">
        <h5 className="text-sm font-medium text-foreground mb-2">{t('primaryModel')}</h5>
        <select
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="">{t('default')}</option>
          {availableModels.map(m => (
            <option key={m.alias} value={m.alias}>{m.alias}</option>
          ))}
          {primary && !availableModels.find(m => m.alias === primary) && (
            <option value={primary}>{primary}</option>
          )}
        </select>
      </div>

      {/* Fallback chain */}
      <div className="bg-surface-1/50 rounded-lg p-4">
        <h5 className="text-sm font-medium text-foreground mb-2">{t('fallbackChainCount', { count: fallbacks.length })}</h5>
        <p className="text-2xs text-muted-foreground mb-3">
          {t('fallbackChainDesc')}
        </p>

        {fallbacks.length === 0 ? (
          <div className="text-xs text-muted-foreground mb-3">{t('noFallbackModels')}</div>
        ) : (
          <div className="space-y-1 mb-3">
            {fallbacks.map((fb, i) => (
              <div key={`${fb}-${i}`} className="flex items-center gap-2 bg-surface-1 rounded px-3 py-1.5">
                <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                <span className="flex-1 font-mono text-xs text-foreground">{fb}</span>
                <button
                  onClick={() => moveFallback(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                  title={t('moveUp')}
                >
                  ^
                </button>
                <button
                  onClick={() => moveFallback(i, 1)}
                  disabled={i === fallbacks.length - 1}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                  title={t('moveDown')}
                >
                  v
                </button>
                <button
                  onClick={() => removeFallback(i)}
                  className="text-xs text-red-400/60 hover:text-red-400 px-1"
                  title={t('remove')}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newFallback}
            onChange={(e) => setNewFallback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFallback()
              }
            }}
            list="model-fallback-suggestions"
            placeholder={t('addFallbackModel')}
            className="flex-1 bg-surface-1 text-foreground rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <datalist id="model-fallback-suggestions">
            {availableModels.map(m => (
              <option key={m.alias} value={m.alias} />
            ))}
          </datalist>
          <Button onClick={addFallback} variant="secondary" size="xs">
            {t('add')}
          </Button>
        </div>
      </div>
    </div>
  )
}
