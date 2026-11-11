import { lazy, Suspense, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { ApiError } from '../api/client'
import type { PlanModel, Task, TaskPatch } from '../tasks/api'
import { FormError } from '../triggers'
import { getStepTask, insertStep, patchStep, setDeps, type Step } from './api'
import { CHANGED_MEANWHILE } from './PlanHeaderEditor'

const CodeEditor = lazy(() => import('../editor/CodeEditor'))

const MODELS: PlanModel[] = ['haiku', 'sonnet', 'opus', 'fable']
const isConflict = (e: unknown) => e instanceof ApiError && (e.status === 412 || e.status === 409)
const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

export type StepEditorTarget = { mode: 'new'; after?: number } | { mode: 'edit'; step: Step }

interface Props {
  target: StepEditorTarget
  /** Every step of the plan, in order. */
  steps: Step[]
  stepsVersion: number
  specKey: string
  onClose: () => void
  /** The plan changed (a save or a conflict): the parent refetches its steps. */
  onChanged: () => void
}

function Fields({ title, setTitle, model, setModel, body, setBody }: { title: string; setTitle: (v: string) => void; model: string; setModel: (v: string) => void; body: string; setBody: (v: string) => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
      <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField size="small" select label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
        <MenuItem value="">none</MenuItem>
        {MODELS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </TextField>
      <Box>
        <Typography color="text.secondary">Body</Typography>
        <Suspense fallback={<Typography color="text.secondary">Loading editor</Typography>}>
          <Box sx={{ height: 280, border: 1, borderColor: 'divider' }}>
            <CodeEditor path="step.md" doc={body} docVersion={0} readOnly={false} onChange={setBody} onSave={() => {}} />
          </Box>
        </Suspense>
      </Box>
    </Box>
  )
}

function NewStep({ props, onFail }: { props: Props; onFail: (e: unknown) => void }) {
  const { target, specKey, stepsVersion, onClose, onChanged } = props
  const [title, setTitle] = useState('')
  const [model, setModel] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try {
      await insertStep(specKey, {
        steps_version: stepsVersion,
        ...(target.mode === 'new' && target.after !== undefined ? { after: target.after } : {}),
        title: title.trim(),
        body,
        model: model === '' ? undefined : (model as PlanModel),
      })
      onChanged()
      onClose()
    } catch (e) {
      onFail(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <DialogContent>
        <Fields title={title} setTitle={setTitle} model={model} setModel={setModel} body={body} setBody={setBody} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || title.trim() === ''} onClick={() => void add()}>Add step</Button>
      </DialogActions>
    </>
  )
}

function EditStep({ props, task, onFail, onReload }: { props: Props; task: Task; onFail: (e: unknown) => void; onReload: () => void }) {
  const { steps, onClose, onChanged } = props
  const [title, setTitle] = useState(task.title)
  const [model, setModel] = useState<string>(task.model ?? '')
  const [body, setBody] = useState(task.body)
  const [deps, setDepKeys] = useState<string[]>(task.depends_on)
  const [busy, setBusy] = useState(false)
  const [depsError, setDepsError] = useState<Error | null>(null)

  const save = async () => {
    const patch: TaskPatch = { version: task.version }
    if (title.trim() !== task.title) patch.title = title.trim()
    if (body !== task.body) patch.body = body
    if (model !== (task.model ?? '')) patch.model = model === '' ? null : (model as PlanModel)
    setBusy(true)
    try {
      await patchStep(task.key, patch)
      onChanged()
      onClose()
    } catch (e) {
      onFail(e)
    } finally {
      setBusy(false)
    }
  }
  const saveDeps = async () => {
    setBusy(true)
    setDepsError(null)
    try {
      await setDeps(task.key, steps.filter((s) => deps.includes(s.key)).map((s) => s.key))
      onChanged()
      onReload()
    } catch (e) {
      if (isConflict(e)) onFail(e)
      else setDepsError(asError(e))
    } finally {
      setBusy(false)
    }
  }
  const toggle = (key: string) => setDepKeys((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))
  const sameDeps = deps.length === task.depends_on.length && deps.every((d) => task.depends_on.includes(d))
  return (
    <>
      <DialogContent>
        <Fields title={title} setTitle={setTitle} model={model} setModel={setModel} body={body} setBody={setBody} />
        <Box sx={{ display: 'flex', flexDirection: 'column', pt: 2 }}>
          <Typography color="text.secondary">Depends on</Typography>
          {steps.filter((s) => s.key !== task.key).map((s) => (
            <FormControlLabel key={s.key} control={<Checkbox size="small" checked={deps.includes(s.key)} onChange={() => toggle(s.key)} />} label={`${s.step} ${s.title}`} />
          ))}
          <FormError error={depsError} />
          <Box>
            <Button size="small" disabled={busy || sameDeps} onClick={() => void saveDeps()}>Save dependencies</Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || title.trim() === ''} onClick={() => void save()}>Save step</Button>
      </DialogActions>
    </>
  )
}

/** Adds a step or edits one (title, body, model and dependencies). A 412 or 409 reloads and says so. */
export function StepEditor(props: Props) {
  const { target, onClose, onChanged } = props
  const editKey = target.mode === 'edit' ? target.step.key : null
  const [task, setTask] = useState<Task | null>(null)
  const [gen, setGen] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    if (editKey === null) return
    let live = true
    getStepTask(editKey).then((t) => live && setTask(t), (e: unknown) => live && setError(asError(e)))
    return () => {
      live = false
    }
  }, [editKey, gen])

  const onFail = (e: unknown) => {
    if (isConflict(e)) {
      setChanged(true)
      setError(null)
      setTask(null)
      setGen((g) => g + 1)
      onChanged()
    } else setError(asError(e))
  }
  const title = target.mode === 'new' ? 'Add step' : `Edit step ${target.step.step}`
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-label={title}>
      <DialogTitle>{title}</DialogTitle>
      <Box sx={{ px: 3 }}>
        {changed && <Alert severity="warning">{CHANGED_MEANWHILE}</Alert>}
        <FormError error={error} />
      </Box>
      {target.mode === 'new' && <NewStep props={props} onFail={onFail} />}
      {target.mode === 'edit' && !task && !error && <DialogContent><Typography color="text.secondary">Loading</Typography></DialogContent>}
      {target.mode === 'edit' && task && <EditStep key={`${task.key}:${task.version}:${task.depends_on.join(',')}`} props={props} task={task} onFail={onFail} onReload={() => setGen((g) => g + 1)} />}
    </Dialog>
  )
}
