// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { TasksRoute, taskPath } from './routes'

// The pages need the taskboard backend config and have their own tests; here only the routing is under test.
vi.mock('./TasksPage', () => ({ TasksPage: () => null }))
vi.mock('./TaskDetail', () => ({ TaskDetail: () => null }))

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tasks/*" element={<TasksRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('tasks routes', () => {
  test('taskPath builds the deep link', () => {
    expect(taskPath('T-5')).toBe('/tasks/T-5')
  })

  test('/tasks renders the list route', () => {
    at('/tasks')
    expect(screen.getByTestId('tasks-list-route')).toBeTruthy()
  })

  test('/tasks/T-5 renders the detail route with the key', () => {
    at('/tasks/T-5')
    expect(screen.getByTestId('task-route').getAttribute('data-key')).toBe('T-5')
  })

  test('unknown /tasks/x/y shows not found', () => {
    at('/tasks/x/y')
    expect(screen.getByTestId('tasks-not-found')).toBeTruthy()
    expect(screen.queryByTestId('task-route')).toBeNull()
  })
})
