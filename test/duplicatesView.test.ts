import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Component } from 'vue'

// The Duplicates page makes the catalog's only merges a person decides, live for
// both apps. What can go wrong is wiring: the wrong product kept, a "different"
// that forgets a pair, an Undo that undoes another row. So each button is
// clicked through the template, not called on the component.

const fetchNearDuplicates = vi.fn()
const mergeProducts = vi.fn().mockResolvedValue('merge-9')
const rejectGroup = vi.fn().mockResolvedValue(undefined)
const fetchMerges = vi.fn()
const unmerge = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/lib/data/duplicates', () => ({
  fetchNearDuplicates,
  mergeProducts,
  rejectGroup,
  fetchMerges,
  unmerge,
}))

const DuplicatesView = (await import('../src/views/DuplicatesView.vue')).default as unknown as Component

const stubs = {
  PageHeader: { template: '<div />' },
  PanelCard: { props: ['note'], template: '<section><slot name="actions" /><slot /><slot name="footer" /></section>' },
  SegmentedControl: {
    props: ['modelValue', 'segments'],
    emits: ['update:modelValue'],
    template: `<span><button v-for="s in segments" :key="s.value" class="seg__item" :data-value="s.value"
      @click="$emit('update:modelValue', s.value)">{{ s.label }}</button></span>`,
  },
  StateBlock: { props: ['title'], template: '<div class="state">{{ title }}</div>' },
  TablePager: { emits: ['go'], template: `<nav><button class="pager__next" @click="$emit('go', 25)">next</button></nav>` },
  ConfirmDialog: {
    props: ['open', 'title'],
    emits: ['confirm', 'cancel'],
    template: `<div v-if="open" class="dialog">{{ title }}<button class="dialog__go" @click="$emit('confirm')">go</button></div>`,
  },
  DataTable: {
    props: ['rows', 'rowKey'],
    template: `<table><tr v-for="r in rows" :key="r[rowKey]" class="row">
      <td><slot name="cell-drop_name" :row="r" /></td><td><slot name="cell-actions" :row="r" /></td></tr></table>`,
  },
}

const group = {
  family: 'mountain dew|ml:1000|1',
  total: 1,
  products: [
    { id: 'p-a', name: 'Mountain Dew 1L', brand: 'Mountain Dew', match_key: 'k1', retailers: ['carrefour', 'auchan'] },
    { id: 'p-b', name: 'Bautura carbogazoasa cu gust de citrice 1L', brand: 'Mountain Dew', match_key: 'k2', retailers: ['mega-image'] },
    { id: 'p-c', name: 'Mountain Dew Pitch Black 1L', brand: 'Mountain Dew', match_key: 'k3', retailers: ['penny'] },
  ],
}

const record = {
  id: 'm-1', keep_id: 'p-a', keep_name: 'Mountain Dew 1L', drop_name: 'Bautura carbogazoasa Mountain Dew, 1 l',
  source: 'cleanup', merged_by: null, merged_at: '2026-10-08T10:00:00Z', undone_at: null, total: 1,
}

function mountView() {
  return mount(DuplicatesView, { global: { stubs } })
}

describe('DuplicatesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchNearDuplicates.mockResolvedValue({ rows: [group], total: 1, offset: 0 })
    fetchMerges.mockResolvedValue({ rows: [record], total: 1, offset: 0 })
  })

  it('shows each group with every product and its shops', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.dup')).toHaveLength(1)
    expect(wrapper.text()).toContain('Bautura carbogazoasa cu gust de citrice 1L')
    expect(wrapper.text()).toContain('mega-image')
  })

  it('merges the ticked products into the first one ticked', async () => {
    const wrapper = mountView()
    await flushPromises()

    const boxes = wrapper.findAll('.dup input[type="checkbox"]')
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    await wrapper.find('.dup__same').trigger('click')
    await flushPromises()

    expect(mergeProducts).toHaveBeenCalledTimes(1)
    expect(mergeProducts.mock.calls[0].slice(0, 2)).toEqual(['p-a', 'p-b'])
    expect(fetchNearDuplicates).toHaveBeenCalledTimes(2)
  })

  it('cannot merge fewer than two products', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.dup input[type="checkbox"]')[0].setValue(true)
    expect(wrapper.find('.dup__same').attributes('disabled')).toBeDefined()
  })

  it('says to tick the products until two are ticked', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.dup__hint').text()).toBe('Tick the ones that are the same')
    const boxes = wrapper.findAll('.dup input[type="checkbox"]')
    await boxes[0].setValue(true)
    expect(wrapper.find('.dup__hint').text()).toBe('Tick one more')
    await boxes[1].setValue(true)
    expect(wrapper.find('.dup__hint').exists()).toBe(false)
  })

  it('says every pair in a group is different', async () => {
    const wrapper = mountView()
    await flushPromises()

    fetchNearDuplicates.mockResolvedValue({ rows: [], total: 0, offset: 0 })
    await wrapper.find('.dup__different').trigger('click')
    await flushPromises()

    expect(rejectGroup).toHaveBeenCalledTimes(1)
    expect(rejectGroup.mock.calls[0][0]).toEqual(['p-a', 'p-b', 'p-c'])
    expect(wrapper.findAll('.dup')).toHaveLength(0)
  })

  // Review, 2026-10-08: a failure left the page showing what the loop had
  // already merged, and a retry then failed on every one of those.
  it('reloads the group after a failed merge, and says why', async () => {
    const wrapper = mountView()
    await flushPromises()

    mergeProducts.mockRejectedValueOnce(new Error('both products carry a barcode'))
    const boxes = wrapper.findAll('.dup input[type="checkbox"]')
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    await wrapper.find('.dup__same').trigger('click')
    await flushPromises()

    expect(fetchNearDuplicates).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('both products carry a barcode')
  })

  it('steps back a page when the last group on it is decided', async () => {
    const wrapper = mountView()
    await flushPromises()

    fetchNearDuplicates.mockResolvedValueOnce({ rows: [], total: 0, offset: 25 })
    await wrapper.find('.pager__next').trigger('click')
    await flushPromises()

    expect(fetchNearDuplicates.mock.calls.at(-1)?.[0]).toMatchObject({ offset: 0 })
  })

  it('undoes a merge from the Merged tab, after asking', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.seg__item[data-value="merged"]').trigger('click')
    await flushPromises()
    await wrapper.find('.row .u-btn').trigger('click')
    expect(wrapper.find('.dialog').exists()).toBe(true)
    await wrapper.find('.dialog__go').trigger('click')
    await flushPromises()

    expect(unmerge.mock.calls[0][0]).toBe('m-1')
  })
})
