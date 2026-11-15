import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { TOKENS } from './theme'

// vitest runs from the component root
const html = readFileSync('index.html', 'utf8')
const css = readFileSync('src/index.css', 'utf8')
const meta = (name: string) => new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`).exec(html)?.[1]

describe('index.html and index.css', () => {
  test('the viewport covers the notch and never blocks zoom', () => {
    expect(meta('viewport')).toBe('width=device-width, initial-scale=1, viewport-fit=cover')
    expect(html).not.toContain('maximum-scale')
    expect(html).not.toContain('user-scalable')
  })

  test('theme-color is the canvas colour and there is no manifest or touch icon', () => {
    expect(meta('theme-color')).toBe('#0f1013')
    expect(meta('theme-color')).toBe(TOKENS.bgCanvas)
    expect(html).not.toMatch(/rel="manifest"/)
    expect(html).not.toContain('apple-touch-icon')
  })

  test('html removes the double-tap delay and the rubber band', () => {
    expect(css).toMatch(/html\s*\{[^}]*touch-action:\s*manipulation/)
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior:\s*none/)
  })
})
