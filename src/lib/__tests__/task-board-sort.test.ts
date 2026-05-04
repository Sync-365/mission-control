import { describe, expect, it } from 'vitest'

import { sortTasksForColumn } from '../task-board-sort'

describe('sortTasksForColumn', () => {
  it('sorts backlog tasks by ascending id', () => {
    const tasks = [
      { id: 9, status: 'backlog', created_at: 100, updated_at: 100 },
      { id: 2, status: 'backlog', created_at: 300, updated_at: 300 },
      { id: 5, status: 'backlog', created_at: 200, updated_at: 200 },
    ]

    expect(sortTasksForColumn(tasks, 'backlog').map(task => task.id)).toEqual([2, 5, 9])
  })

  it('sorts non-backlog tasks by most recent activity first', () => {
    const tasks = [
      { id: 1, status: 'done', created_at: 100, updated_at: 150, latest_comment_at: 900 },
      { id: 2, status: 'done', created_at: 200, updated_at: 400, latest_review_at: 500 },
      { id: 3, status: 'done', created_at: 300, updated_at: 250, latest_activity_at: 800 },
    ]

    expect(sortTasksForColumn(tasks, 'done').map(task => task.id)).toEqual([1, 3, 2])
  })

  it('falls back to updated_at, then created_at, then id when activity matches', () => {
    const tasks = [
      { id: 1, status: 'review', created_at: 100, updated_at: 500, latest_activity_at: 700 },
      { id: 2, status: 'review', created_at: 300, updated_at: 500, latest_activity_at: 700 },
      { id: 3, status: 'review', created_at: 300, updated_at: 500, latest_activity_at: 700 },
    ]

    expect(sortTasksForColumn(tasks, 'review').map(task => task.id)).toEqual([3, 2, 1])
  })
})
