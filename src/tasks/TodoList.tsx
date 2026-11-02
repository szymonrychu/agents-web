import { useState } from 'react'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { FormError } from '../triggers'
import { patchTodoItem, replaceTodo, type Task, type TodoStatus } from './api'

const STATES: { value: TodoStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'inprogress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export interface TodoListProps {
  task: Task
  onChanged: () => void
}

export function TodoList({ task, onChanged }: TodoListProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }
  const items = task.todo.map(({ text: t, status }) => ({ text: t, status }))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormError error={error} />
      {task.todo.length === 0 && <Typography color="text.secondary">No todo items</Typography>}
      {task.todo.map((item) => (
        <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            aria-label={`Status of ${item.text}`}
            value={item.status}
            onChange={(_, next: TodoStatus | null) => next !== null && run(() => patchTodoItem(task.key, item.id, { status: next }))}
          >
            {STATES.map((s) => (
              <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography sx={{ flexGrow: 1, textDecoration: item.status === 'done' ? 'line-through' : undefined }}>{item.text}</Typography>
          <IconButton size="small" aria-label={`Remove ${item.text}`} onClick={() => run(() => replaceTodo(task.key, items.filter((_, i) => i !== task.todo.indexOf(item))))}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField size="small" label="New item" value={text} onChange={(e) => setText(e.target.value)} sx={{ flexGrow: 1 }} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <Button
          disabled={text.trim() === ''}
          onClick={() => run(async () => {
            await replaceTodo(task.key, [...items, { text: text.trim(), status: 'todo' }])
            setText('')
          })}
        >
          Add
        </Button>
      </Box>
    </Box>
  )
}
