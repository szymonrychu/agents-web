import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resetConfig, loadConfig } from '../config/backends'
import { answerDecision, getTask, listTasks, patchTask, patchTodoItem, replaceTodo, taskStreamUrl } from './api'
import { readFileSync } from 'node:fs'

const fetchMock = vi.fn()
beforeEach(async () => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await loadConfig(async () => new Response(JSON.stringify({ backends: [{ id: 'orchestrator', label: 'O', basePath: '/api/v1' }, { id: 'taskboard', label: 'T', basePath: '/tb/api/v1' }] })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetConfig()
})

const last = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url, method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(init.body as string) }
}

describe('taskboard client', () => {
  test('listTasks sends repeated label params over the configured base path', async () => {
    await listTasks({ status: 'done', session: 's1', labels: ['a', 'b'], cursor: 'c' })
    expect(last().url).toBe('/tb/api/v1/tasks?status=done&session=s1&label=a&label=b&cursor=c')
  })

  test('answer sends exactly choice or text, plus the note', async () => {
    await answerDecision('T-1', 4, { choice: 1, note: 'n' })
    expect(last()).toEqual({ url: '/tb/api/v1/tasks/T-1/decisions/4/answer', method: 'POST', body: { choice: 1, note: 'n' } })
    await answerDecision('T-1', 4, { text: 'mine' })
    expect(last().body).toEqual({ text: 'mine' })
  })

  test('patch, todo and get use the documented routes', async () => {
    await patchTask('T-1', { version: 3, labels: ['x'] })
    expect(last()).toEqual({ url: '/tb/api/v1/tasks/T-1', method: 'PATCH', body: { version: 3, labels: ['x'] } })
    await replaceTodo('T-1', [{ text: 'a', status: 'todo' }])
    expect(last()).toMatchObject({ url: '/tb/api/v1/tasks/T-1/todo', method: 'PUT', body: { items: [{ text: 'a', status: 'todo' }] } })
    await patchTodoItem('T-1', 7, { status: 'done' })
    expect(last()).toMatchObject({ url: '/tb/api/v1/tasks/T-1/todo/7', method: 'PATCH', body: { status: 'done' } })
    await getTask('T-1')
    expect(last().url).toBe('/tb/api/v1/tasks/T-1')
    expect(taskStreamUrl()).toBe('/tb/api/v1/stream')
  })

  test('no hard-coded host in client', () => {
    for (const f of ['api.ts', 'useTaskStream.ts']) {
      const src = readFileSync(`src/tasks/${f}`, 'utf8')
      expect(src).not.toMatch(/https?:\/\//)
      expect(src).not.toMatch(/localhost/)
    }
  })
})
