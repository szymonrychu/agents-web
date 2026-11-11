import { describe, expect, test } from 'vitest'
import { stepsGraph } from './StepsGraph'
import { step } from './testUtils'

describe('stepsGraph', () => {
  test('a 3-step chain', () => {
    const steps = [
      step({ key: 'T-11', step: 1, title: 'A' }),
      step({ key: 'T-12', step: 2, title: 'B', deps: ['T-11'] }),
      step({ key: 'T-13', step: 3, title: 'C', deps: ['T-12'] }),
    ]
    expect(stepsGraph(steps)).toBe('graph TD\n  s1["1 A"] --> s2["2 B"]\n  s2 --> s3["3 C"]')
  })

  test('titles are escaped for quotes and newlines', () => {
    const steps = [step({ key: 'T-11', step: 1, title: 'say "hi"\nnow' }), step({ key: 'T-12', step: 2, title: 'B', deps: ['T-11'] })]
    expect(stepsGraph(steps)).toBe('graph TD\n  s1["1 say #quot;hi#quot; now"] --> s2["2 B"]')
  })

  test('a step without edges is still a node, in step order', () => {
    const steps = [step({ key: 'T-11', step: 1, title: 'A' }), step({ key: 'T-12', step: 2, title: 'B' })]
    expect(stepsGraph(steps)).toBe('graph TD\n  s1["1 A"]\n  s2["2 B"]')
  })

  test('a dependency on a key outside the list is ignored', () => {
    const steps = [step({ key: 'T-12', step: 2, title: 'B', deps: ['T-99'] })]
    expect(stepsGraph(steps)).toBe('graph TD\n  s2["2 B"]')
  })
})
