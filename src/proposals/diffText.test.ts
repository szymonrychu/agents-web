import { describe, expect, it } from 'vitest'
import { docMode, initScriptsDoc, toDoc } from './diffText'

describe('toDoc', () => {
  it('an absent side is an empty doc', () => {
    expect(toDoc(null)).toBe('')
    expect(toDoc(undefined)).toBe('')
  })

  it('strings stay themselves, other scalars are JSON', () => {
    expect(toDoc('old')).toBe('old')
    expect(toDoc(3)).toBe('3')
    expect(toDoc(false)).toBe('false')
  })

  it('structured values are sorted YAML', () => {
    expect(toDoc({ b: 1, a: 2 })).toBe('a: 2\nb: 1\n')
  })

  it('text mode keeps strings only', () => {
    expect(toDoc(5, true)).toBe('')
    expect(toDoc('a\nb', true)).toBe('a\nb')
  })
})

describe('initScriptsDoc', () => {
  it('sections each entry under its index', () => {
    expect(initScriptsDoc(['echo a\necho b', 'make'])).toBe('# init_scripts[0]\necho a\necho b\n# init_scripts[1]\nmake')
  })

  it('absent or empty is an empty doc', () => {
    expect(initScriptsDoc(null)).toBe('')
    expect(initScriptsDoc(undefined)).toBe('')
    expect(initScriptsDoc([])).toBe('')
  })

  it('other values fall back to toDoc', () => {
    expect(initScriptsDoc({ a: 1 })).toBe('a: 1\n')
  })
})

describe('docMode', () => {
  it('picks raw text for prompts', () => {
    expect(docMode('schedule', 'prompt')).toBe('text')
    expect(docMode('preset', 'start_prompt')).toBe('text')
    expect(docMode('session', 'start_prompt')).toBe('text')
    expect(docMode(undefined, 'start_prompt')).toBe('text')
  })

  it('picks sections for init scripts', () => {
    expect(docMode('preset', 'init_scripts')).toBe('init_scripts')
  })

  it('picks YAML otherwise', () => {
    expect(docMode('schedule', 'cron')).toBe('yaml')
    expect(docMode('preset', 'prompt')).toBe('yaml')
  })
})
