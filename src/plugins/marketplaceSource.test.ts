import { describe, expect, test } from 'vitest'
import { formatSource, parseSource } from './marketplaceSource'

describe('marketplaceSource', () => {
  test('formats each kind', () => {
    expect(formatSource({ kind: 'github', value: 'acme/tools', ref: '' })).toBe('acme/tools')
    expect(formatSource({ kind: 'github', value: 'acme/tools', ref: 'v1' })).toBe('acme/tools#v1')
    expect(formatSource({ kind: 'git', value: 'https://git.example.com/a/b.git', ref: 'main' })).toBe('https://git.example.com/a/b.git#main')
    expect(formatSource({ kind: 'url', value: 'https://x.io/marketplace.json', ref: '' })).toBe('https://x.io/marketplace.json')
    expect(formatSource({ kind: 'directory', value: '/opt/market', ref: '' })).toBe('/opt/market')
  })
  test('empty value formats to empty', () => {
    expect(formatSource({ kind: 'github', value: '', ref: 'v1' })).toBe('')
  })
  test('parses each kind', () => {
    expect(parseSource('acme/tools#v1')).toEqual({ kind: 'github', value: 'acme/tools', ref: 'v1' })
    expect(parseSource('https://git.example.com/a/b.git#main')).toEqual({ kind: 'git', value: 'https://git.example.com/a/b.git', ref: 'main' })
    expect(parseSource('git@github.com:a/b.git')).toEqual({ kind: 'git', value: 'git@github.com:a/b.git', ref: '' })
    expect(parseSource('https://x.io/marketplace.json')).toEqual({ kind: 'url', value: 'https://x.io/marketplace.json', ref: '' })
    expect(parseSource('./local')).toEqual({ kind: 'directory', value: './local', ref: '' })
    expect(parseSource('~/m')).toEqual({ kind: 'directory', value: '~/m', ref: '' })
    expect(parseSource('')).toEqual({ kind: 'github', value: '', ref: '' })
  })
  test('round trips', () => {
    for (const s of ['acme/tools', 'acme/tools#v2', 'https://h/x.git#r', 'https://h/m.json', '/abs/dir']) expect(formatSource(parseSource(s))).toBe(s)
  })
  test('source errors per kind', async () => {
    const { sourceError } = await import('./marketplaceSource')
    expect(sourceError({ kind: 'github', value: 'nope', ref: '' })).toMatch(/owner\/repo/)
    expect(sourceError({ kind: 'github', value: 'a/b', ref: '' })).toBeNull()
    expect(sourceError({ kind: 'git', value: 'ftp://x', ref: '' })).toMatch(/git URL/)
    expect(sourceError({ kind: 'url', value: 'http://x/m.json', ref: '' })).toBeNull()
    expect(sourceError({ kind: 'url', value: 'x', ref: '' })).toMatch(/http/)
    expect(sourceError({ kind: 'directory', value: '', ref: '' })).toMatch(/required/)
  })
  test('rejects a github: prefix and other non owner/repo strings, accepts what Claude Code accepts', async () => {
    const { sourceError, parseSource: parse } = await import('./marketplaceSource')
    const bad = ['github:owner/repo', 'owner', 'owner/', '/repo', 'a/b/c', 'a b/c', 'owner/repo.git:x']
    for (const v of bad) expect(sourceError({ kind: 'github', value: v, ref: '' }), v).toMatch(/owner\/repo/)
    for (const v of ['owner/repo', 'my-org/my_repo.v2']) expect(sourceError({ kind: 'github', value: v, ref: '' }), v).toBeNull()
    for (const v of ['https://host/a/b.git', 'ssh://git@host/a/b.git', 'git://host/a/b', 'git@host:a/b.git']) expect(sourceError({ kind: 'git', value: v, ref: '' }), v).toBeNull()
    expect(sourceError({ kind: 'git', value: 'github:owner/repo', ref: '' })).toMatch(/git URL/)
    for (const v of ['./m', '../m', '/abs/m', '~/m']) expect(sourceError({ kind: 'directory', value: v, ref: '' }), v).toBeNull()
    expect(sourceError({ kind: 'directory', value: 'github:owner/repo', ref: '' })).toMatch(/path/)
    expect(sourceError({ kind: 'directory', value: 'rel/dir', ref: '' })).toMatch(/path/)
    // a stored bad string stays visible as invalid instead of being reinterpreted
    expect(sourceError(parse('github:owner/repo'))).not.toBeNull()
  })
})
