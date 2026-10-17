import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MethodBadges from '../src/components/MethodBadges.vue'

// The logos replace words, so the words have to survive somewhere a person or a
// screen reader can reach them.
describe('MethodBadges', () => {
  it('draws a logo per method and keeps the names in the label', () => {
    const wrapper = mount(MethodBadges, { props: { methods: ['google', 'apple', 'microsoft', 'email'] } })
    expect(wrapper.findAll('svg')).toHaveLength(4)
    expect(wrapper.attributes('aria-label')).toBe('Google, Apple, Microsoft, Email code')
    expect(wrapper.attributes('title')).toBe('Google, Apple, Microsoft, Email code')
  })

  it('names a method it has no logo for, and shows a dash for none', () => {
    expect(mount(MethodBadges, { props: { methods: ['linkedin_oidc'] } }).text()).toBe('Linkedin_oidc')
    expect(mount(MethodBadges, { props: { methods: [] } }).text()).toBe('–')
  })
})
