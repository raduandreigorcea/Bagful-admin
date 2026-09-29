import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'

// The app-catalog product form. What is pinned here is the base weight: it is a
// type="number" input, and v-model hands a typed number back as a number, not
// the string the form started from. submit() used to call .trim() on it and
// crash the page.

vi.mock('../src/lib/useModal', () => ({ useModal: () => {} }))

const ProductFormDialog = (await import('../src/components/ProductFormDialog.vue'))
  .default as unknown as Component

describe('ProductFormDialog', () => {
  it('submits a base weight that was typed into the field', async () => {
    const wrapper = mount(ProductFormDialog, {
      props: { open: true, product: null, busy: false, error: '' },
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()

    await wrapper.find('input').setValue('Typed product')
    await wrapper.find('input[type="number"]').setValue('12')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Typed product', baseWeight: 12 })
  })

  it('asks the browser to hold a barcode to 8-14 digits, like the table does', () => {
    const wrapper = mount(ProductFormDialog, {
      props: { open: true, product: null, busy: false, error: '' },
      global: { stubs: { Teleport: true } },
    })
    const input = wrapper.findAll('input').find((i) => i.attributes('inputmode') === 'numeric')!
    expect(input.attributes('pattern')).toBe('[0-9]{8,14}')
  })
})
