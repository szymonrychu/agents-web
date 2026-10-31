/** The file editor's languages: which CodeMirror language a file opens with, chosen by its file name. */
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'
import { StreamLanguage } from '@codemirror/language'
import { jinja2 } from '@codemirror/legacy-modes/mode/jinja2'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import type { Extension } from '@codemirror/state'
import { hcl } from 'codemirror-lang-hcl'

export type LanguageId = 'python' | 'yaml' | 'json' | 'terraform' | 'toml' | 'jinja' | 'plain'

const tomlLanguage = StreamLanguage.define(toml)
const jinjaLanguage = StreamLanguage.define(jinja2)

/** Lower-cased last extension to language; `.tf.json` ends in `.json`, so Terraform's JSON syntax opens as json. */
const BY_EXTENSION = new Map<string, Exclude<LanguageId, 'plain'>>([
  ['py', 'python'],
  ['pyi', 'python'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['json', 'json'],
  ['tf', 'terraform'],
  ['tfvars', 'terraform'],
  ['hcl', 'terraform'],
  ['toml', 'toml'],
  ['j2', 'jinja'],
  ['jinja', 'jinja'],
  ['jinja2', 'jinja'],
])

const SUPPORT: Record<Exclude<LanguageId, 'plain'>, () => Extension> = {
  python: () => python(),
  yaml: () => yaml(),
  json: () => json(),
  terraform: () => hcl(),
  toml: () => tomlLanguage,
  jinja: () => jinjaLanguage,
}

/**
 * The language of a file and the extension that installs it; anything unrecognised is plain text with no extension.
 *
 * @param path - workspace path of the file; only its last segment counts, case-insensitively, and a dot file such as
 *   `.env` has no extension.
 */
export function languageFor(path: string): { id: LanguageId; support: Extension } {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const dot = name.lastIndexOf('.')
  const id = dot > 0 ? BY_EXTENSION.get(name.slice(dot + 1)) : undefined
  return id ? { id, support: SUPPORT[id]() } : { id: 'plain', support: [] }
}
