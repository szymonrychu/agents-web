export interface DotenvPair {
  key: string
  value: string
}

export interface DotenvError {
  line: number
  message: string
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' }

function trailingOk(rest: string): boolean {
  return rest.trim() === '' || /^\s+#/.test(rest)
}

// Returns the decoded value, or an error message.
function parseValue(raw: string): { value: string } | { error: string } {
  const text = raw.trimStart()
  const quote = text[0]
  if (quote === '"') {
    let out = ''
    for (let i = 1; i < text.length; i++) {
      const ch = text[i]
      if (ch === '\\' && i + 1 < text.length) {
        const next = text[i + 1]
        out += ESCAPES[next] ?? ch + next
        i++
      } else if (ch === '"') {
        return trailingOk(text.slice(i + 1))
          ? { value: out }
          : { error: 'unexpected text after closing quote' }
      } else {
        out += ch
      }
    }
    return { error: 'unterminated quote' }
  }
  if (quote === "'") {
    const end = text.indexOf("'", 1)
    if (end < 0) return { error: 'unterminated quote' }
    return trailingOk(text.slice(end + 1))
      ? { value: text.slice(1, end) }
      : { error: 'unexpected text after closing quote' }
  }
  const comment = raw.indexOf(' #')
  return { value: (comment < 0 ? raw : raw.slice(0, comment)).trim() }
}

export function parseDotenv(text: string): { pairs: DotenvPair[]; errors: DotenvError[] } {
  const pairs: DotenvPair[] = []
  const errors: DotenvError[] = []
  const index = new Map<string, number>()
  text.split('\n').forEach((rawLine, i) => {
    const line = i + 1
    const trimmed = rawLine.replace(/\r$/, '').trim()
    if (trimmed === '' || trimmed.startsWith('#')) return
    const body = trimmed.replace(/^export\s+/, '')
    const eq = body.indexOf('=')
    if (eq < 0) {
      errors.push({ line, message: 'missing =' })
      return
    }
    const key = body.slice(0, eq).trim()
    if (key === '') {
      errors.push({ line, message: 'empty key' })
      return
    }
    const parsed = parseValue(body.slice(eq + 1))
    if ('error' in parsed) {
      errors.push({ line, message: parsed.error })
      return
    }
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, pairs.length)
      pairs.push({ key, value: parsed.value })
    } else {
      pairs[at].value = parsed.value
    }
  })
  return { pairs, errors }
}
