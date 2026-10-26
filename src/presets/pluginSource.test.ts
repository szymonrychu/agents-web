import { describe, expect, it } from 'vitest'
import { pluginSourceError } from './pluginSource'

describe('pluginSourceError', () => {
  it.each([
    'git::https://github.com/szymonrychu/any-mcp',
    'git::https://github.com/szymonrychu/any-mcp.git',
    'git::https://example.com/group/sub/repo.git',
    'git::https://example.com:8443/repo',
    'git::https://github.com/szymonrychu/any-mcp//examples/petstore',
    'git::https://github.com/szymonrychu/any-mcp?ref=v0.5.0',
    'git::https://github.com/szymonrychu/any-mcp//examples/petstore?ref=v0.5.0',
    'git::https://github.com/szymonrychu/any-mcp.git//examples/petstore?ref=feature/x_y-1.2',
    'git::https://github.com/o/r//./sub?ref=0123abcdef',
    'github.com/szymonrychu/any-mcp',
    'github.com/szymonrychu/any-mcp.git',
    'github.com/szymonrychu/any-mcp//examples/petstore',
    'github.com/szymonrychu/any-mcp?ref=main',
    'github.com/szymonrychu/any-mcp//examples/petstore?ref=v0.5.0',
  ])('accepts remote sources: %s', (text) => {
    expect(pluginSourceError(text)).toBeUndefined()
  })

  it.each([
    './plugins/mine',
    '../plugins/mine',
    '/opt/plugins/mine',
    'git::ssh://git@github.com/szymonrychu/any-mcp.git',
    'git::ssh://git@github.com/szymonrychu/any-mcp.git//sub?ref=main',
    'git::file:///srv/git/repo.git',
    'git@github.com:szymonrychu/any-mcp.git',
  ])('refuses local and non-https sources: %s', (text) => {
    expect(pluginSourceError(text)).toMatch(/only https git sources are allowed/)
  })

  it.each([
    ['git::https://github.com/o/r?depth=1', /query key 'depth'/],
    ['git::https://github.com/o/r?sshkey=abc', /query key 'sshkey'/],
    ['github.com/o/r?ref=main&depth=1', /query key 'depth'/],
    ['github.com/o/r?foo=bar', /query key 'foo'/],
    ['git::https://github.com/o/r?', /empty query/],
    ['git::https://github.com/o/r?ref=', /ref is empty/],
    ['github.com/o/r?ref', /ref is empty/],
    ['git::https://github.com/o/r?ref=-main', /ref must not start with '-'/],
    ['git::https://github.com/o/r?ref=a..b', /ref must not contain '\.\.'/],
    ['github.com/o/r?ref=../x', /ref must not contain '\.\.'/],
    ['git::https://github.com/o/r?ref=a b', /ref may hold only/],
    ['git::https://github.com/o/r?ref=v1;rm', /ref may hold only/],
    ['git::https://github.com/o/r?ref=a&ref=b', /ref is given more than once/],
    ['git::https://github.com/o/r///abs', /subdir must be relative/],
    ['github.com/o/r///abs', /subdir must be relative/],
    ['git::https://github.com/o/r//', /subdir has an empty segment/],
    ['git::https://github.com/o/r//a//b', /subdir has an empty segment/],
    ['git::https://github.com/o/r//a/', /subdir has an empty segment/],
    ['git::https://github.com/o/r//../x', /subdir must not have a '\.\.' segment/],
    ['github.com/o/r//a/../../x?ref=main', /subdir must not have a '\.\.' segment/],
    ['szymonrychu/any-mcp', /accepted forms/],
    ['https://github.com/szymonrychu/any-mcp', /accepted forms/],
    ['git+https://github.com/szymonrychu/any-mcp', /accepted forms/],
    ['git::http://github.com/o/r', /accepted forms/],
    ['git::github.com/o/r', /accepted forms/],
    ['git::https://', /accepted forms/],
    ['git::https://github.com', /accepted forms/],
    ['git::https://github.com/', /accepted forms/],
    ['github.com/szymonrychu', /accepted forms/],
    ['github.com/o/r/extra', /accepted forms/],
    ['github.com//r', /accepted forms/],
    ['gitlab.com/o/r', /accepted forms/],
  ])('refuses malformed sources: %s', (text, problem) => {
    expect(pluginSourceError(text)).toMatch(problem)
  })

  it('names the source in every message', () => {
    expect(pluginSourceError('github.com/o/r?depth=1')).toBe("plugin source 'github.com/o/r?depth=1': unsupported query key 'depth', only ref is allowed")
  })

  it.each([
    ['  github.com/o/r  ', undefined],
    ['\tgit::https://github.com/o/r//sub?ref=main\n', undefined],
    [' ./local ', /only https git sources are allowed/],
  ])('trims and refuses empty: surrounding whitespace in %j', (text, expected) => {
    if (expected === undefined) expect(pluginSourceError(text)).toBeUndefined()
    else expect(pluginSourceError(text)).toMatch(expected)
  })

  it.each(['', '   ', '\t\n'])('trims and refuses empty: %j', (text) => {
    expect(pluginSourceError(text)).toBe('plugin source is empty')
  })
})
