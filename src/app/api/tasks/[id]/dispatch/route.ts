import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase, db_helpers } from '@/lib/db'
import { dispatchAssignedTasks } from '@/lib/task-dispatch'
import { logger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id } = await params
    const taskId = Number(id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 })
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1
    const task = db.prepare('SELECT id, title, status, assigned_to FROM tasks WHERE id = ? AND workspace_id = ?')
      .get(taskId, workspaceId) as { id: number; title: string; status: string; assigned_to: string | null } | undefined

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.assigned_to) {
      return NextResponse.json({ error: 'Assign the task to an agent before dispatching it.' }, { status: 400 })
    }
    if (task.status === 'in_progress') {
      return NextResponse.json({ error: 'Task is already in progress.' }, { status: 409 })
    }
    if (['done', 'review', 'quality_review'].includes(task.status)) {
      return NextResponse.json({ error: `Task is already ${task.status.replace(/_/g, ' ')}.` }, { status: 409 })
    }

    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      UPDATE tasks
      SET status = 'assigned', error_message = NULL, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(now, taskId, workspaceId)

    db_helpers.logActivity(
      'task_dispatch_manual',
      'task',
      taskId,
      auth.user.display_name || auth.user.username || 'admin',
      `Manual dispatch requested for "${task.title}"`,
      { previous_status: task.status, assigned_to: task.assigned_to },
      workspaceId,
    )

    const result = await dispatchAssignedTasks(taskId)
    return NextResponse.json({ ...result, taskId })
  } catch (error: any) {
    logger.error({ err: error }, 'Manual task dispatch failed')
    return NextResponse.json({ error: error?.message || 'Failed to dispatch task' }, { status: 500 })
  }
}
