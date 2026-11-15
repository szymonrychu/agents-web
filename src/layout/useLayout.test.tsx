// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { setViewport, type ViewportOptions } from '../test/viewport'
import { theme } from '../theme'
import { useLayout, useTouchOrSmall } from './useLayout'

function Probe() {
  return (
    <>
      <span data-testid="layout">{useLayout()}</span>
      <span data-testid="touch">{String(useTouchOrSmall())}</span>
    </>
  )
}

function layoutAt(width: number, opts?: ViewportOptions): string {
  setViewport(width, opts)
  render(
    <ThemeProvider theme={theme}>
      <Probe />
    </ThemeProvider>,
  )
  return screen.getByTestId('layout').textContent ?? ''
}

afterEach(cleanup)

describe('useLayout', () => {
  test.each([
    [375, 'phone'],
    [599, 'phone'],
    [600, 'tablet'],
    [1199, 'tablet'],
    [1200, 'desktop'],
    [1920, 'desktop'],
  ])('width %i is %s', (width, expected) => {
    expect(layoutAt(width)).toBe(expected)
  })
})

describe('touch and landscape', () => {
  test('a coarse phone in landscape (844x390) is a phone', () => {
    expect(layoutAt(844, { coarse: true, height: 390 })).toBe('phone')
  })

  test('a mouse window of the same size is a tablet', () => {
    expect(layoutAt(844, { height: 390 })).toBe('tablet')
  })

  test('an iPad in portrait (1024x768, coarse) is a tablet', () => {
    expect(layoutAt(1024, { coarse: true, height: 768 })).toBe('tablet')
  })
})

describe('useTouchOrSmall', () => {
  test.each([
    [375, { coarse: true }, 'true'],
    [1440, { coarse: true }, 'true'],
    [1440, {}, 'false'],
    [800, {}, 'true'],
  ])('width %i with %j is %s', (width, opts, expected) => {
    layoutAt(width, opts)
    expect(screen.getByTestId('touch').textContent).toBe(expected)
  })
})
