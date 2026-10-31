/** Syntax error marking for the file editor: parser errors as lint diagnostics, with no hints of any kind. */
import { jsonParseLinter } from '@codemirror/lang-json'
import { ensureSyntaxTree } from '@codemirror/language'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import type { EditorState, Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { parse as parseToml, TomlError } from 'smol-toml'
import { Composer, isScalar, Lexer, Parser, visit, type CST, type Document } from 'yaml'
import type { LanguageId } from './languages'

/** Most milliseconds one check spends finishing a Lezer or YAML parse; an unfinished parse reports nothing. */
const PARSE_TIMEOUT_MS = 500

/** YAML lexemes parsed between two deadline checks. */
const LEXEMES_PER_CHECK = 256

const jsonCheck = jsonParseLinter()

/** First line of a parser message; the libraries append code frames below it. */
const firstLine = (message: string) => message.split('\n', 1)[0]

/**
 * An error diagnostic over `[from, to)` clamped inside the document and at least one character wide, so a mark at
 * the very end of the file (where parsers report an unexpected end) is still visible.
 */
function errorAt(state: EditorState, from: number, to: number, message: string): Diagnostic {
  const length = state.doc.length
  if (length === 0) return { from: 0, to: 0, severity: 'error', message }
  const start = Math.min(Math.max(from, 0), length - 1)
  return { from: start, to: Math.min(Math.max(to, start + 1), length), severity: 'error', message }
}

/**
 * The documents of a YAML stream, or `null` when lexing and parsing do not finish within `PARSE_TIMEOUT_MS`.
 * Composition, linear in the parsed tokens, runs only on a finished parse, and without the library's duplicate key
 * check, which is quadratic in the keys of a mapping (`yamlDuplicateKeys` replaces it).
 */
function yamlDocuments(source: string): Document.Parsed[] | null {
  const deadline = performance.now() + PARSE_TIMEOUT_MS
  const parser = new Parser()
  const tokens: CST.Token[] = []
  let lexemes = 0
  for (const lexeme of new Lexer().lex(source)) {
    if (++lexemes % LEXEMES_PER_CHECK === 0 && performance.now() > deadline) return null
    tokens.push(...parser.next(lexeme))
  }
  tokens.push(...parser.end())
  return Array.from(new Composer({ uniqueKeys: false }).compose(tokens))
}

/** One error per repeated scalar key of each mapping of `doc`, in linear time; equality as the library's own check. */
function yamlDuplicateKeys(state: EditorState, doc: Document.Parsed): Diagnostic[] {
  const out: Diagnostic[] = []
  visit(doc, {
    Map: (_, map) => {
      const seen = new Set<unknown>()
      for (const { key } of map.items) {
        if (!isScalar(key) || !key.range || Number.isNaN(key.value)) continue
        if (seen.has(key.value)) out.push(errorAt(state, key.range[0], key.range[1], 'Map keys must be unique'))
        else seen.add(key.value)
      }
    },
  })
  return out
}

/** One diagnostic per document error and per duplicate key; a `---` stream is valid, an unfinished parse reports nothing. */
function yamlDiagnostics(state: EditorState): Diagnostic[] {
  const docs = yamlDocuments(state.doc.toString())
  if (!docs) return []
  return docs.flatMap((doc) => [
    ...doc.errors.map((e) => errorAt(state, e.pos[0], e.pos[1], firstLine(e.message))),
    ...yamlDuplicateKeys(state, doc),
  ])
}

function tomlDiagnostics(state: EditorState): Diagnostic[] {
  try {
    parseToml(state.doc.toString())
    return []
  } catch (e) {
    if (!(e instanceof TomlError)) throw e
    const from = state.doc.line(e.line).from + e.column - 1
    return [errorAt(state, from, from + 1, firstLine(e.message))]
  }
}

/** One diagnostic per error node of the complete Lezer tree; none when the parse does not finish in time. */
function treeDiagnostics(state: EditorState): Diagnostic[] {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS)
  if (!tree) return []
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  tree.iterate({
    enter: (node) => {
      if (!node.type.isError) return
      const d = errorAt(state, node.from, node.to, 'Syntax error')
      const key = `${d.from}:${d.to}`
      if (seen.has(key)) return
      seen.add(key)
      out.push(d)
    },
  })
  return out
}

/**
 * The syntax errors of a document, a pure function of the state: every diagnostic is an `error` with `from < to`
 * inside a non-empty document.
 *
 * @param language - the file's language (`languageFor`); python and terraform read the state's Lezer tree, so the
 *   state must carry that language's support; plain text is never checked. Python, terraform and yaml report nothing
 *   when their parse does not finish within `PARSE_TIMEOUT_MS`.
 */
export function syntaxDiagnostics(language: LanguageId, state: EditorState): Diagnostic[] {
  switch (language) {
    case 'json':
      return jsonCheck({ state } as EditorView).map((d) => errorAt(state, d.from, d.to, d.message))
    case 'yaml':
      return yamlDiagnostics(state)
    case 'toml':
      return tomlDiagnostics(state)
    case 'python':
    case 'terraform':
      return treeDiagnostics(state)
    case 'jinja':
    case 'plain':
      return []
  }
}

/** The editor extension marking syntax errors: the linter (default 750 ms delay) and its gutter, nothing else. */
export function syntaxChecker(language: LanguageId): Extension {
  return [linter((view) => syntaxDiagnostics(language, view.state)), lintGutter()]
}
