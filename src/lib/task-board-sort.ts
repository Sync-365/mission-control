export type TaskBoardSortableTask = {
  id: number
  status: string
  created_at?: number | null
  updated_at?: number | null
  latest_comment_at?: number | null
  latest_review_at?: number | null
  latest_activity_at?: number | null
}

export function sortTasksForColumn<T extends TaskBoardSortableTask>(tasks: T[], columnKey: string): T[] {
  const sorted = [...tasks]

  if (columnKey === 'backlog') {
    return sorted.sort((a, b) => a.id - b.id)
  }

  return sorted.sort((a, b) => {
    const aActivity = a.latest_activity_at ?? Math.max(a.updated_at ?? 0, a.latest_comment_at ?? 0, a.latest_review_at ?? 0)
    const bActivity = b.latest_activity_at ?? Math.max(b.updated_at ?? 0, b.latest_comment_at ?? 0, b.latest_review_at ?? 0)
    const activityDelta = bActivity - aActivity
    if (activityDelta !== 0) return activityDelta

    const updatedDelta = (b.updated_at ?? 0) - (a.updated_at ?? 0)
    if (updatedDelta !== 0) return updatedDelta

    const createdDelta = (b.created_at ?? 0) - (a.created_at ?? 0)
    if (createdDelta !== 0) return createdDelta

    return b.id - a.id
  })
}
