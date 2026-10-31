import { ensureSyntaxTree, language, type Language } from '@codemirror/language'
import { jsonLanguage } from '@codemirror/lang-json'
import { pythonLanguage } from '@codemirror/lang-python'
import { yamlLanguage } from '@codemirror/lang-yaml'
import { EditorState, type Extension } from '@codemirror/state'
import { highlightTree, type Tag } from '@lezer/highlight'
import { hclLanguage } from 'codemirror-lang-hcl'
import { describe, expect, it } from 'vitest'
import { TOKENS, syntaxPalette } from '../theme'
import { editorChromeSpec, editorHighlight } from './highlight'
import { languageFor, type LanguageId } from './languages'

type Tree = NonNullable<ReturnType<typeof ensureSyntaxTree>>

/** The language an extension installs, read back through the state's language facet (null for none). */
const languageOf = (support: Extension): Language | null => EditorState.create({ extensions: [support] }).facet(language)

describe('languageFor', () => {
  const lezer: Record<Exclude<LanguageId, 'plain' | 'toml' | 'jinja'>, Language> = {
    python: pythonLanguage,
    yaml: yamlLanguage,
    json: jsonLanguage,
    terraform: hclLanguage,
  }
  const cases: [string, LanguageId][] = [
    ['main.py', 'python'],
    ['pkg/stubs/types.pyi', 'python'],
    ['SETUP.PY', 'python'],
    ['deploy/values.yaml', 'yaml'],
    ['.github/workflows/ci.yml', 'yaml'],
    ['package.json', 'json'],
    ['infra/main.tf.json', 'json'],
    ['infra/main.tf', 'terraform'],
    ['prod.tfvars', 'terraform'],
    ['config.HCL', 'terraform'],
    ['pyproject.toml', 'toml'],
    ['prompt.j2', 'jinja'],
    ['init.jinja', 'jinja'],
    ['init.JINJA2', 'jinja'],
  ]

  it.each(cases)('maps %s to %s with that language', (path, id) => {
    const { id: got, support } = languageFor(path)
    expect(got).toBe(id)
    const lang = languageOf(support)
    if (id === 'toml' || id === 'jinja') expect(lang?.name).toBe(id === 'toml' ? 'toml' : 'jinja2')
    else expect(lang).toBe(lezer[id as keyof typeof lezer])
  })

  it.each(['README.md', 'Makefile', 'notes.txt', '.env', 'src/.py', 'odd.constructor', 'archive.json.bak'])('maps %s to plain text with no language', (path) => {
    const { id, support } = languageFor(path)
    expect(id).toBe('plain')
    expect(support).toEqual([])
    expect(languageOf(support)).toBeNull()
  })
})

/** Classes of the `editorHighlight` specs coloured with the given palette entry. */
function classesFor(key: keyof typeof syntaxPalette): string[] {
  return editorHighlight.specs
    .filter((s) => s.color === syntaxPalette[key])
    .map((s) => editorHighlight.style([([] as Tag[]).concat(s.tag as Tag | Tag[])[0]]) ?? '')
}

/** Every highlighted token text of a tree with its classes. */
function styledTokens(tree: Tree, doc: string): Map<string, string> {
  const out = new Map<string, string>()
  highlightTree(tree, editorHighlight, (from, to, classes) => out.set(doc.slice(from, to), classes))
  return out
}

describe('editor highlighting', () => {
  const tomlTree = (doc: string): Tree => {
    const tree = ensureSyntaxTree(EditorState.create({ doc, extensions: [languageFor('x.toml').support] }), doc.length, 1000)
    if (!tree) throw new Error('toml parse did not finish')
    return tree
  }
  const samples: [LanguageId, string, (doc: string) => Tree, string, keyof typeof syntaxPalette][] = [
    ['python', 'def greet(name):\n    return "hi " + name\n', (d) => pythonLanguage.parser.parse(d), 'def', 'keyword'],
    ['yaml', 'name: web\nreplicas: 3\n', (d) => yamlLanguage.parser.parse(d), 'name', 'property'],
    ['json', '{"name": "web", "replicas": 3}', (d) => jsonLanguage.parser.parse(d), '"web"', 'string'],
    ['terraform', 'resource "aws_instance" "web" {\n  ami = "ami-123"\n}\n', (d) => hclLanguage.parser.parse(d), 'resource', 'type'],
    ['toml', 'title = "web"\n[server]\nport = 8080\n', tomlTree, 'title', 'property'],
  ]

  it.each(samples)('highlights every language: %s', (_id, doc, parse, token, key) => {
    const tokens = styledTokens(parse(doc), doc)
    const classes = tokens.get(token)
    expect(classes, `${token} is styled`).toBeTruthy()
    const expected = classesFor(key)
    expect(expected.length).toBeGreaterThan(0)
    expect(classes!.split(' ').some((c) => expected.includes(c)), `${token} uses the ${key} colour`).toBe(true)
  })
})

describe('editor appearance', () => {
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g
  const NAMED = /\b(white|black|red|orange|yellow|green|blue|purple|gray|grey|pink)\b/i
  const allowed = new Set<string>([...Object.values(syntaxPalette), ...Object.values(TOKENS)].flatMap((v) => (typeof v === 'string' ? [v] : [])))

  /** Every string value below a style object, with its key path, skipping the highlight `tag` fields. */
  function strings(value: unknown, path: string, out: [string, string][]): [string, string][] {
    if (typeof value === 'string') out.push([path, value])
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (k !== 'tag') strings(v, `${path}.${k}`, out)
    }
    return out
  }

  it('takes its colours from the theme', () => {
    const values = strings(editorHighlight.specs, 'highlight', strings(editorChromeSpec, 'chrome', []))
    const found: string[] = []
    for (const [path, v] of values) {
      expect(NAMED.test(v), `${path}: ${v} names a colour`).toBe(false)
      for (const c of v.match(COLOUR) ?? []) {
        expect(allowed.has(c), `${path}: ${c} is not a theme colour`).toBe(true)
        found.push(c)
      }
    }
    expect(found.length).toBeGreaterThan(0)
  })

  it('uses every syntaxPalette colour and gives every highlight spec a colour from the theme', () => {
    const colours = editorHighlight.specs.map((s) => s.color)
    for (const [key, hex] of Object.entries(syntaxPalette)) expect(colours, key).toContain(hex)
    for (const c of colours) expect(allowed.has(c as string), String(c)).toBe(true)
  })

  it('styles the editor chrome: background, gutters, cursor, selection, active line and lint markers', () => {
    const keys = Object.keys(editorChromeSpec).join('\n')
    for (const part of ['&', '.cm-gutters', '.cm-cursor', '.cm-selectionBackground', '.cm-activeLine', '.cm-lintRange-error', '.cm-lint-marker-error']) {
      expect(keys, part).toContain(part)
    }
  })
})
