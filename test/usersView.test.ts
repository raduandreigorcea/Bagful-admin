import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'

// The Users page answers one question per person: can they be sent a
// notification. That answer comes from OneSignal, in a second request made after
// the page of users is known, so the two things worth pinning are that each
// person gets THEIR OWN state, and that OneSignal being unreachable leaves the
// list readable instead of breaking it.

const fetchUsers = vi.fn()
const fetchPushSubscribers = vi.fn()
const fetchClerkSummary = vi.fn().mockResolvedValue({ total: 3 })
const cachedSubscriber = vi.fn()

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/lib/data/users', () => ({ fetchUsers, isUserSort: () => true }))
vi.mock('../src/lib/data/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/data/services')>()),
  fetchPushSubscribers,
  fetchClerkSummary,
  fetchReplayers: vi.fn().mockResolvedValue([{ userId: 'user_a', replay: true }, { userId: 'user_b', replay: false }]),
  cachedSubscriber,
}))

const UsersView = (await import('../src/views/UsersView.vue')).default as unknown as Component

const stubs = {
  PageHeader: true,
  PanelCard: { props: ['note'], template: '<section><p class="note">{{ note }}</p><slot /></section>' },
  FilterBar: true,
  TablePager: true,
  UserChip: { props: ['name'], template: '<span>{{ name }}</span>' },
  UserId: true,
  CopyValue: true,
  // Renders only the two cells this page adds, because those are what is tested.
  DataTable: {
    props: ['rows', 'rowKey'],
    template: `<table><tbody>
      <tr v-for="r in rows" :key="r[rowKey]" class="row">
        <td class="name"><slot name="cell-display_name" :row="r" /></td>
        <td class="push"><slot name="cell-push" :row="r" /></td>
        <td class="devices"><slot name="cell-devices" :row="r" /></td>
        <td class="telemetry"><slot name="cell-telemetry" :row="r" /></td>
      </tr>
    </tbody></table>`,
  },
}

const user = (id: string, name: string) => ({
  user_id: id,
  display_name: name,
  image_url: null,
  lists: 0,
  owned_lists: 0,
  is_admin: false,
  first_seen: '2026-08-01T00:00:00.000Z',
  last_active: '2026-10-01T00:00:00.000Z',
  total_count: 3,
})

const phone = { kind: 'Android', enabled: true, model: 'Pixel 8', os: '15', appVersion: '0.8.2' }
const flush = () => new Promise((r) => setTimeout(r, 0))

async function mounted() {
  const wrapper = mount(UsersView, { global: { stubs } })
  await flush()
  await flush()
  return wrapper
}

beforeEach(() => {
  fetchUsers.mockReset()
  fetchPushSubscribers.mockReset()
  cachedSubscriber.mockReset()
  fetchUsers.mockResolvedValue({
    rows: [user('user_a', 'Ana'), user('user_b', 'Bob'), user('user_c', 'Cleo')],
    total: 3,
    offset: 0,
  })
})

describe('UsersView notifications', () => {
  it('gives each person their own state, and asks about exactly the people on the page', async () => {
    fetchPushSubscribers.mockResolvedValue([
      { userId: 'user_b', state: 'off', devices: [{ ...phone, enabled: false }], lastActive: null },
      { userId: 'user_a', state: 'on', devices: [phone, phone, { ...phone, enabled: false, model: 'Old' }], lastActive: null },
      { userId: 'user_c', state: 'none', devices: [], lastActive: null },
    ])
    const wrapper = await mounted()

    expect(fetchPushSubscribers.mock.calls[0]![0]).toEqual(['user_a', 'user_b', 'user_c'])
    const pushes = wrapper.findAll('.push').map((cell) => cell.text())
    expect(pushes).toEqual(['On', 'Off', 'No device'])
    expect(wrapper.findAll('.devices')[0]!.text()).toBe('Android · Pixel 8 ×2')
    expect(wrapper.findAll('.devices')[2]!.text()).toBe('')
    wrapper.unmount()
  })

  it('keeps the list readable and says why when OneSignal cannot be reached', async () => {
    fetchPushSubscribers.mockRejectedValue(new Error('upstream down'))
    const wrapper = await mounted()

    expect(wrapper.findAll('.row')).toHaveLength(3)
    expect(wrapper.findAll('.push').map((cell) => cell.text())).toEqual(['–', '–', '–'])
    expect(wrapper.find('.note').text()).toContain('Could not read notification state')
    wrapper.unmount()
  })

  it('shows what an earlier visit learned while the new answer is still on its way', async () => {
    cachedSubscriber.mockImplementation((id: string) =>
      id === 'user_a' ? { userId: 'user_a', state: 'on', devices: [phone], lastActive: null } : undefined,
    )
    fetchPushSubscribers.mockReturnValue(new Promise(() => {}))
    const wrapper = await mounted()

    expect(wrapper.findAll('.push').map((cell) => cell.text())).toEqual(['On', '…', '…'])
    wrapper.unmount()
  })

  it('shows who has session replay on, and a dash for who PostHog did not answer for', async () => {
    fetchPushSubscribers.mockResolvedValue([])
    const wrapper = await mounted()

    expect(wrapper.findAll('.telemetry').map((cell) => cell.text())).toEqual(['On', 'Off', '–'])
    wrapper.unmount()
  })

  it('does not ask OneSignal about an empty page', async () => {
    fetchUsers.mockResolvedValue({ rows: [], total: 0, offset: 0 })
    const wrapper = await mounted()

    expect(fetchPushSubscribers).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
