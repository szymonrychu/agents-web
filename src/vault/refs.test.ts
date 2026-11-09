import { describe, expect, test } from 'vitest'
import type { EntryView } from './api'
import { effectiveLabels, entryAllowed, isVaultRef, refText } from './refs'

describe('label rule', () => {
  test('test_untagged_entry_allowed', () => {
    expect(entryAllowed([], ['project:a'])).toBe(true)
  })
  test('test_tag_only_entry_allowed', () => {
    expect(entryAllowed(['github', 'admin'], ['project:a'])).toBe(true)
  })
  test('test_project_label_restricts', () => {
    expect(entryAllowed(['project:a'], effectiveLabels([], 'b'))).toBe(false)
    expect(entryAllowed(['project:a'], effectiveLabels([], 'a'))).toBe(true)
  })
  test('test_mixed_labels', () => {
    expect(entryAllowed(['github', 'project:a', 'project:c'], ['project:c'])).toBe(true)
  })
  test('test_effective_labels', () => {
    expect(effectiveLabels(['x', 'project:a'], 'a')).toEqual(['x', 'project:a'])
    expect(effectiveLabels(['x'], 'a')).toEqual(['x', 'project:a'])
  })
})

describe('refs', () => {
  test('test_is_vault_ref', () => {
    expect(isVaultRef({ vault: 'u', env: 'E' })).toBe(true)
    expect(isVaultRef({ vault: 'u', env: 'E', value: 'x' })).toBe(false)
    expect(isVaultRef({ value: 'x', expand: false })).toBe(false)
    expect(isVaultRef(null)).toBe(false)
    expect(isVaultRef('s')).toBe(false)
  })
  test('test_ref_text', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const byId = new Map([[id, { id, name: 'GitHub' } as EntryView]])
    expect(refText({ vault: id, env: 'GITHUB_TOKEN' }, byId)).toBe('GitHub / GITHUB_TOKEN')
    expect(refText({ vault: '33955e8e-aaaa-4bbb-8ccc-000000000000', env: 'GITHUB_TOKEN' }, byId)).toBe('vault 33955e8e / GITHUB_TOKEN')
  })
})
