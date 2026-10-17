import { describe, expect, it } from 'vitest'
import { listIconUrl, listLabel } from '../src/lib/listIcon'

// Vite may inline small SVGs as data URIs, so URLs are compared with each
// other rather than searched for the icon's name.
describe('listIconUrl', () => {
  it('resolves a stored icon name, an old emoji with a twin, and the empty default', () => {
    const tea = listIconUrl('tea-cup')
    expect(tea).toBeTruthy()
    expect(listIconUrl('☕')).toBe(tea)
    expect(tea).not.toBe(listIconUrl('heart'))
    expect(listIconUrl(null)).toBe(listIconUrl('bag'))
    expect(listIconUrl('boy')).toBe(listIconUrl('bag'))
  })

  it('leaves an unknown emoji to be drawn as text', () => {
    expect(listIconUrl('🐶')).toBeNull()
  })
})

describe('listLabel', () => {
  it('prefixes only a real emoji, never an icon name', () => {
    expect(listLabel('🐶', 'Dogs')).toBe('🐶 Dogs')
    expect(listLabel('tea-cup', 'Home')).toBe('Home')
    expect(listLabel(null, 'Home')).toBe('Home')
  })
})
