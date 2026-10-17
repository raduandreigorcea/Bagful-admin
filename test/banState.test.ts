import { describe, expect, it } from 'vitest'
import { banState } from '../src/lib/banAccount'

describe('banState', () => {
  it('is one label for a ban in either place, and nothing for none', () => {
    expect(banState(true, true)).toMatchObject({ label: 'Banned', tone: 'bad' })
    expect(banState(true, false)).toMatchObject({ label: 'Banned', tone: 'bad' })
    expect(banState(false, true)).toMatchObject({ label: 'Banned', tone: 'bad' })
    expect(banState(false, false)).toBeNull()
  })
})
