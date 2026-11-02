// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { LabelChips } from './LabelChips'
import { LabelEditor } from './LabelEditor'
import { MAX_LABELS, normalizeLabels } from './labels'

afterEach(cleanup)

describe('label editor', () => {
  test('label editor normalises and rejects invalid input', async () => {
    const onChange = vi.fn()
    render(<LabelEditor value={['a']} onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Labels' })
    await userEvent.type(input, '  Foo-Bar  {Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['a', 'foo-bar'])
    onChange.mockClear()
    await userEvent.type(input, 'bad label!{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/Invalid label "bad label!"/)).toBeTruthy()
  })

  test('normalizeLabels dedupes, keeps order and caps length and count', () => {
    expect(normalizeLabels([' A ', 'a', 'b'])).toEqual({ ok: true, labels: ['a', 'b'] })
    expect(normalizeLabels(['x'.repeat(41)]).ok).toBe(false)
    expect(normalizeLabels(['']).ok).toBe(false)
    expect(normalizeLabels(Array.from({ length: MAX_LABELS + 1 }, (_, i) => `l${i}`))).toEqual({ ok: false, error: 'At most 20 labels' })
  })

  test('chips call back with the clicked label', async () => {
    const onClick = vi.fn()
    render(<LabelChips labels={['x', 'y']} onClick={onClick} />)
    await userEvent.click(screen.getByText('y'))
    expect(onClick).toHaveBeenCalledWith('y')
  })
})
