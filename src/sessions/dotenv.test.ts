import { describe, expect, it } from 'vitest'
import { parseDotenv } from './dotenv'

const p = (text: string) => parseDotenv(text)

describe('parseDotenv', () => {
  it('skips blank lines and full-line comments', () => {
    expect(p('\n  \n# c\n   # d\nA=1\n')).toEqual({ pairs: [{ key: 'A', value: '1' }], errors: [] })
  })

  it('drops the export prefix', () => {
    expect(p('export A=1\n  export B=2').pairs).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
    ])
  })

  it('handles CRLF and surrounding whitespace', () => {
    expect(p('A=1\r\n  B =  two words  \r\n').pairs).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two words' },
    ])
  })

  it('handles unquoted values with and without inline comments', () => {
    expect(p('A=1 # c\nB=x#y\nC=\nD=a=b\nE= # c').pairs).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'x#y' },
      { key: 'C', value: '' },
      { key: 'D', value: 'a=b' },
      { key: 'E', value: '' },
    ])
  })

  it('decodes double-quoted escapes', () => {
    const r = p('A="a\\nb\\tc\\"d\\\\e # not"  # comment\nB="\\x"\nC=""')
    expect(r.errors).toEqual([])
    expect(r.pairs).toEqual([
      { key: 'A', value: 'a\nb\tc"d\\e # not' },
      { key: 'B', value: '\\x' },
      { key: 'C', value: '' },
    ])
  })

  it('keeps single-quoted values literal', () => {
    const r = p("A='a\\nb # c'\nB='x' # c")
    expect(r.errors).toEqual([])
    expect(r.pairs).toEqual([
      { key: 'A', value: 'a\\nb # c' },
      { key: 'B', value: 'x' },
    ])
  })

  it('keeps the last value of a repeated key at its first position', () => {
    expect(p('A=1\nB=2\nA=3').pairs).toEqual([
      { key: 'A', value: '3' },
      { key: 'B', value: '2' },
    ])
  })

  it('reports errors with 1-based line numbers and keeps valid lines', () => {
    const r = p('A=1\nnoequals\n=v\nB="open\nC=\'open\nD="x" y\nE=\'x\'y\nF=2')
    expect(r.pairs).toEqual([
      { key: 'A', value: '1' },
      { key: 'F', value: '2' },
    ])
    expect(r.errors).toEqual([
      { line: 2, message: 'missing =' },
      { line: 3, message: 'empty key' },
      { line: 4, message: 'unterminated quote' },
      { line: 5, message: 'unterminated quote' },
      { line: 6, message: 'unexpected text after closing quote' },
      { line: 7, message: 'unexpected text after closing quote' },
    ])
  })

  it('treats an escaped closing quote as unterminated', () => {
    expect(p('A="x\\"').errors).toEqual([{ line: 1, message: 'unterminated quote' }])
  })
})
