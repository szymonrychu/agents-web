import { diagnosticCount, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { languageFor, type LanguageId } from './languages'
import { syntaxChecker, syntaxDiagnostics } from './syntaxCheck'

const EXT: Record<LanguageId, string> = {
  python: 'main.py',
  yaml: 'values.yaml',
  json: 'package.json',
  terraform: 'main.tf',
  toml: 'pyproject.toml',
  plain: 'notes.txt',
}

/** A view-less state of `doc` with the language of `language` installed, as the editor builds it. */
const stateOf = (language: LanguageId, doc: string) => EditorState.create({ doc, extensions: [languageFor(EXT[language]).support] })

const check = (language: LanguageId, doc: string) => {
  const state = stateOf(language, doc)
  return { state, diagnostics: syntaxDiagnostics(language, state) }
}

/** 1-based line numbers the diagnostics start on. */
const linesOf = (state: EditorState, diagnostics: Diagnostic[]) => diagnostics.map((d) => state.doc.lineAt(d.from).number)

const PYTHON_VALID = `class Point:
    def __init__(self, x: int, y: int) -> None:
        self.x = x
        self.y = y


def norms(points: list[Point]) -> dict[str, float]:
    return {f"{p.x},{p.y}": (p.x ** 2 + p.y ** 2) ** 0.5 for p in points if p.x >= 0}
`

const TERRAFORM_VALID = `terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "names" {
  type    = list(string)
  default = ["a", "b"]
}

variable "env" {
  type = string
}

locals {
  prefix = "app-\${var.env}"
  upper  = [for n in var.names : upper(n)]
  by_name = { for n in var.names : n => "\${local.prefix}-\${n}" }
}

resource "aws_s3_bucket" "this" {
  bucket = "\${local.prefix}-bucket"
  policy = <<EOT
{
  "Version": "2012-10-17"
}
EOT
  tags = {
    Name = "bucket-\${var.env}"
  }
}
`

/** A flat YAML mapping of `count` unique keys, one per line. */
const flatYaml = (count: number) => Array.from({ length: count }, (_, i) => `k${i}: ${i}\n`).join('')

/** One broken sample per checked language with the line its first mark must be on. */
const BROKEN: [LanguageId, string, number][] = [
  ['json', '{"a": 1,}', 1],
  ['json', '{"a": 1', 1],
  ['yaml', 'a:\n  b: 1\n c: 2\n', 3],
  ['yaml', 'items: [1, 2\n', 1],
  ['yaml', 'a: 1\nb: 2\na: 3\n', 3],
  ['toml', 'a = 1\na = 2\n', 2],
  ['toml', 'a =\nb = 1\n', 1],
  ['toml', 'a = ', 1],
  ['python', 'def f(:\n    pass\n', 1],
  ['python', 'x = (', 1],
  ['terraform', 'resource "a" "b" {\n  x = 1\n', 2],
]

describe('syntaxDiagnostics', () => {
  it('json: a valid object has no diagnostic, a trailing comma one error inside the document', () => {
    expect(check('json', '{"a": 1}').diagnostics).toEqual([])
    const { state, diagnostics } = check('json', '{"a": 1,}')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].severity).toBe('error')
    expect(diagnostics[0].from).toBeGreaterThanOrEqual(0)
    expect(diagnostics[0].to).toBeLessThanOrEqual(state.doc.length)
  })

  it('yaml: a two-document stream is valid; a bad indentation and an unclosed flow sequence are marked on their line', () => {
    expect(check('yaml', 'a: 1\nb:\n  - x\n---\nc: 2\n').diagnostics).toEqual([])
    const indent = check('yaml', 'a:\n  b: 1\n c: 2\n')
    expect(indent.diagnostics.length).toBeGreaterThanOrEqual(1)
    expect(linesOf(indent.state, indent.diagnostics)).toContain(3)
    const flow = check('yaml', 'items: [1, 2\n')
    expect(flow.diagnostics.length).toBeGreaterThanOrEqual(1)
    expect(linesOf(flow.state, flow.diagnostics)).toContain(1)
  })

  it('yaml: a duplicate key is marked on its line, per mapping, in block and flow style', () => {
    const block = check('yaml', 'a: 1\nb: 2\na: 3\n')
    expect(block.diagnostics).toHaveLength(1)
    expect(linesOf(block.state, block.diagnostics)).toEqual([3])
    const flow = check('yaml', 'top: 1\nm: {x: 1, x: 2}\n')
    expect(flow.diagnostics).toHaveLength(1)
    expect(linesOf(flow.state, flow.diagnostics)).toEqual([2])
    expect(check('yaml', 'p:\n  a: 1\nq:\n  a: 2\n').diagnostics).toEqual([])
    expect(check('yaml', 'a: 1\n---\na: 2\n').diagnostics).toEqual([])
  })

  it('yaml: a duplicate key at the end of a 2000-key mapping is marked', () => {
    const doc = `${flatYaml(2000)}k0: again\n`
    const { state, diagnostics } = check('yaml', doc)
    expect(linesOf(state, diagnostics)).toEqual([2001])
  })

  it('yaml: a 50000-key flat mapping is checked well under a second, with no false error', () => {
    const state = stateOf('yaml', flatYaml(50_000))
    const started = performance.now()
    const diagnostics = syntaxDiagnostics('yaml', state)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(diagnostics).toEqual([])
  })

  it('toml: a valid table has no diagnostic; a duplicate key and a missing value get one error on the reported line', () => {
    expect(check('toml', '[tool.app]\nname = "x"\nversion = 2\n\n[tool.app.extra]\nflag = true\n').diagnostics).toEqual([])
    const dup = check('toml', 'a = 1\na = 2\n')
    expect(dup.diagnostics).toHaveLength(1)
    expect(linesOf(dup.state, dup.diagnostics)).toEqual([2])
    const missing = check('toml', 'a =\nb = 1\n')
    expect(missing.diagnostics).toHaveLength(1)
    expect(linesOf(missing.state, missing.diagnostics)).toEqual([1])
  })

  it('python: a class, function and comprehension are valid; def f(: is marked on line 1', () => {
    expect(check('python', PYTHON_VALID).diagnostics).toEqual([])
    const broken = check('python', 'def f(:\n    pass\n')
    expect(broken.diagnostics.length).toBeGreaterThanOrEqual(1)
    expect(linesOf(broken.state, broken.diagnostics)).toContain(1)
  })

  it('python: a long valid file has no diagnostic, finished or not within the parse timeout', () => {
    expect(check('python', PYTHON_VALID.repeat(3000)).diagnostics).toEqual([])
  })

  it('terraform: terraform, variable, resource and locals blocks with interpolations, a heredoc and a for are valid', () => {
    expect(check('terraform', TERRAFORM_VALID).diagnostics).toEqual([])
  })

  it('terraform: a block missing its closing brace is marked', () => {
    const { diagnostics } = check('terraform', 'resource "a" "b" {\n  x = 1\n')
    expect(diagnostics.length).toBeGreaterThanOrEqual(1)
  })

  it.each([
    '',
    '{"a": 1,}',
    'def f(:',
    'a = 1\na = 2\n',
    'a:\n  b: 1\n c: 2\n',
    'resource "a" {',
  ])('plain text never has a diagnostic: %j', (doc) => {
    expect(check('plain', doc).diagnostics).toEqual([])
  })

  it.each(BROKEN)('diagnostic ranges: %s %j is an error within the document, starting on line %i', (language, doc, line) => {
    const { state, diagnostics } = check(language, doc)
    expect(diagnostics.length).toBeGreaterThanOrEqual(1)
    for (const d of diagnostics) {
      expect(d.severity).toBe('error')
      expect(d.from).toBeGreaterThanOrEqual(0)
      expect(d.from).toBeLessThan(d.to)
      expect(d.to).toBeLessThanOrEqual(state.doc.length)
      expect(d.message).not.toBe('')
    }
    expect(state.doc.lineAt(diagnostics[0].from).number).toBe(line)
  })
})

/** Every TypeScript source file under `src` with its text. */
const SOURCES = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

describe('syntaxChecker', () => {
  it('checker extension: a view-less state carries the linter and reports diagnostics set on it', () => {
    const state = EditorState.create({ doc: '{"a": 1,}', extensions: [languageFor('x.json').support, syntaxChecker('json')] })
    expect(diagnosticCount(state)).toBe(0)
    const diagnostics = syntaxDiagnostics('json', state)
    const next = state.update(setDiagnostics(state, diagnostics)).state
    expect(diagnosticCount(next)).toBe(diagnostics.length)
    expect(diagnosticCount(next)).toBe(1)
  })

  it('checker extension: no source file imports the autocompletion package', () => {
    const banned = ['@codemirror', 'autocomplete'].join('/')
    expect(Object.keys(SOURCES)).toContain('./syntaxCheck.ts')
    expect(Object.entries(SOURCES).filter(([, text]) => text.includes(banned)).map(([path]) => path)).toEqual([])
  })
})
