import { expect, test } from 'vitest'
import { headingId } from './headingId'

test('slugs_and_dedupes', () => {
  const seen = new Map<string, number>()
  expect(headingId('Intro', seen)).toBe('intro')
  expect(headingId('Intro', seen)).toBe('intro-2')
  expect(headingId('Intro', seen)).toBe('intro-3')
  expect(headingId('  Hello, World! (v2) ', seen)).toBe('hello-world-v2')
})

test('empty_text_falls_back', () => {
  expect(headingId('!!!', new Map())).toBe('section')
})
