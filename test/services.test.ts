import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'

// Sentry, OneSignal and Clerk, through Bagful's admin-services edge function.
//
// What is worth pinning is how a failure is told apart, because each one sends
// the reader somewhere different: a secret nobody set (set it), a function
// nobody deployed (deploy it), a non-admin (the same "Not authorised" screen as
// every RPC), and anything else (an error with the vendor's own words).

const accounts = vi.hoisted(() => ({ ids: [] as string[] }))
vi.mock('../src/lib/data/users', () => ({
  fetchUsers: async () => ({ rows: accounts.ids.map((user_id) => ({ user_id })), total: accounts.ids.length, offset: 0 }),
}))

const calls = vi.hoisted(() => ({ name: '', body: null as unknown }))
const answer = vi.hoisted(() => ({ data: null as unknown, error: null as unknown }))

vi.mock('../src/lib/supabase', () => ({
  getAppSupabase: () => ({
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        calls.name = name
        calls.body = options.body
        return { data: answer.data, error: answer.error }
      },
    },
  }),
}))

const {
  ServiceUnavailable,
  fetchClerkUser,
  fetchPushNotifications,
  fetchSentryIssues,
  methodsLabel,
  deviceLabel,
  appVersionName,
  deviceRows,
  pushKind,
  pushStates,
  subscriberPill,
  pushTotals,
  serviceProblem,
  fetchVersionSpread,
} = await import('../src/lib/data/services')
const { describeError } = await import('../src/lib/useQuery')

const signal = () => new AbortController().signal

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

beforeEach(() => {
  answer.data = null
  answer.error = null
})

describe('asking admin-services', () => {
  it('names the service and view, and unwraps the payload', async () => {
    answer.data = { data: [{ id: '1' }] }
    await expect(fetchSentryIssues(signal())).resolves.toEqual([{ id: '1' }])
    expect(calls.name).toBe('admin-services')
    expect(calls.body).toEqual({ service: 'sentry', view: 'issues' })
  })

  it('sends the user id for one account', async () => {
    answer.data = { data: null }
    await expect(fetchClerkUser('user_2abcdefghij', signal())).resolves.toBeNull()
    expect(calls.body).toEqual({ service: 'clerk', view: 'user', userId: 'user_2abcdefghij' })
  })

  it('reports a missing secret by name', async () => {
    answer.error = httpError(503, { code: 'not_configured', missing: ['ONESIGNAL_REST_API_KEY'] })
    const error = await fetchPushNotifications(signal()).catch((e: Error) => e)
    expect(error).toBeInstanceOf(ServiceUnavailable)
    const problem = serviceProblem(error as Error)
    expect(problem?.title).toBe('OneSignal is not connected on this project')
    expect(problem?.message).toContain('ONESIGNAL_REST_API_KEY')
  })

  it('reads a 404 as the function not being deployed', async () => {
    answer.error = httpError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })
    const error = await fetchSentryIssues(signal()).catch((e: Error) => e)
    expect(serviceProblem(error as Error)?.title).toMatch(/not deployed/)
  })

  it('lets a non-admin reach the same screen every RPC does', async () => {
    answer.error = httpError(403, { code: 'not_admin', error: 'This account is not an admin of this project.' })
    const error = await fetchSentryIssues(signal()).catch((e: Error) => e)
    expect(serviceProblem(error as Error)).toBeNull()
    expect(describeError(error as Error).forbidden).toBe(true)
  })

  it('keeps the vendor failure in the message', async () => {
    answer.error = httpError(502, { code: 'upstream', error: 'Clerk refused the key this project holds (401).' })
    const error = await fetchClerkUser('user_2abcdefghij', signal()).catch((e: Error) => e)
    expect((error as Error).message).toContain('Clerk refused the key')
  })
})

describe('subscriberPill', () => {
  const phone = { kind: 'Android', enabled: true, model: 'Pixel 8', os: '15', appVersion: '0.8.2' }
  const base = { userId: 'user_x', lastActive: null }

  it('says nothing until there is an answer', () => {
    expect(subscriberPill(undefined)).toBeNull()
  })

  it('tells on, off and no device apart', () => {
    expect(subscriberPill({ ...base, state: 'on', devices: [phone] })).toMatchObject({ tone: 'good', label: 'On' })
    expect(subscriberPill({ ...base, state: 'off', devices: [{ ...phone, enabled: false }] })).toMatchObject({ tone: 'warn', label: 'Off' })
    expect(subscriberPill({ ...base, state: 'none', devices: [] })).toMatchObject({ tone: 'idle', label: 'No device' })
  })

  it('counts only the subscribed devices in the hover for On', () => {
    const web = { ...phone, kind: 'Chrome', enabled: false }
    expect(subscriberPill({ ...base, state: 'on', devices: [phone, web] })!.title).toBe('1 subscribed device.')
  })
})

describe('deviceLabel', () => {
  it('names the platform and, when known, the model', () => {
    expect(deviceLabel({ kind: 'Android', enabled: true, model: 'Pixel 8', os: null, appVersion: null })).toBe('Android · Pixel 8')
    expect(deviceLabel({ kind: 'Chrome', enabled: true, model: null, os: null, appVersion: null })).toBe('Chrome')
  })
})

describe('appVersionName', () => {
  it('turns the Android versionCode back into major.minor.patch', () => {
    expect(appVersionName('80022')).toBe('0.8.22')
    expect(appVersionName('1020345')).toBe('1.2.345')
  })
})

describe('fetchVersionSpread', () => {
  it('counts only accounts that exist here, and files the ones PostHog never saw under null', async () => {
    accounts.ids = ['user_a', 'user_b', 'user_c', 'user_d']
    answer.data = {
      data: [
        { userId: 'user_a', version: '0.8.19' },
        { userId: 'user_b', version: '0.8.19' },
        { userId: 'user_c', version: '0.7.34' },
        { userId: 'user_gone', version: '0.8.0' },
      ],
    }
    await expect(fetchVersionSpread(signal())).resolves.toEqual([
      { version: '0.8.19', people: 2 },
      { version: '0.7.34', people: 1 },
      { version: null, people: 1 },
    ])
  })
})

describe('deviceRows', () => {
  const pixel = { kind: 'Android', enabled: true, model: 'Pixel 7', os: null, appVersion: null as string | null }

  it('names each device once with its newest version, newest app first, web last', () => {
    const moto = { ...pixel, model: 'moto g(60)s', appVersion: '80030' }
    const web = { kind: 'Chrome', enabled: true, model: null, os: null, appVersion: null }
    expect(deviceRows([web, { ...pixel, appVersion: '80019' }, { ...pixel, appVersion: '80022' }, moto])).toEqual([
      { label: 'Android · moto g(60)s', version: '0.8.30' },
      { label: 'Android · Pixel 7', version: '0.8.22' },
      { label: 'Chrome', version: '' },
    ])
  })

  it('leaves out the unsubscribed ones while anything is subscribed, and shows them when nothing is', () => {
    const dead = { ...pixel, model: 'Old phone', enabled: false, appVersion: '70001' }
    expect(deviceRows([dead, pixel])).toEqual([{ label: 'Android · Pixel 7', version: '' }])
    expect(deviceRows([dead, dead])).toEqual([{ label: 'Android · Old phone', version: '0.7.1' }])
    expect(deviceRows([])).toEqual([])
  })
})

describe('pushKind', () => {
  it('tells an item, a checkout and the dashboard test apart', () => {
    expect(pushKind('radu added Bread')).toBe('added')
    expect(pushKind('Ana bought Milk, Eggs and 2 more')).toBe('bought')
    expect(pushKind('Test notification sent from production. If you can read this, push works.')).toBe('test')
  })

  it('goes by the earliest verb, so a product named after the other one does not flip it', () => {
    expect(pushKind('Ana added Bought Again Crisps')).toBe('added')
    expect(pushKind('Ana bought Added Sugar Free Cola')).toBe('bought')
  })

  it('says nothing for text it does not know', () => {
    expect(pushKind('')).toBeNull()
    expect(pushKind('Someone did something')).toBeNull()
  })
})

describe('pushStates', () => {
  const row = { id: 'n', text: '', at: null, delivered: 1, unsubscribed: 0, errored: 0, remaining: 0, canceled: false }
  const labels = (r: typeof row) => pushStates(r).map((state) => `${state.tone}:${state.label}`)

  it('calls a clean delivery delivered, and one that reached nobody what it is', () => {
    expect(labels(row)).toEqual(['good:Delivered'])
    expect(labels({ ...row, delivered: 0 })).toEqual(['idle:No devices'])
  })

  it('keeps Delivered beside every way it fell short, unsubscribed as a warning and errors as bad', () => {
    expect(labels({ ...row, delivered: 3, unsubscribed: 1, errored: 2 })).toEqual([
      'good:Delivered',
      'warn:1 unsubscribed',
      'bad:2 failed',
    ])
    expect(labels({ ...row, delivered: 0, unsubscribed: 1 })).toEqual(['warn:1 unsubscribed'])
  })

  it('reports sending and canceled instead of judging a delivery that is not over', () => {
    expect(labels({ ...row, remaining: 3 })).toEqual(['live:Sending'])
    expect(labels({ ...row, canceled: true })).toEqual(['idle:Canceled'])
  })

  it('explains each pill on hover', () => {
    for (const state of pushStates({ ...row, unsubscribed: 1, errored: 1 })) expect(state.title.length).toBeGreaterThan(10)
  })
})

describe('pushTotals', () => {
  it('adds up every notification', () => {
    const row = { id: 'n', text: '', at: null, remaining: 0, canceled: false }
    expect(
      pushTotals([
        { ...row, delivered: 2, unsubscribed: 1, errored: 0 },
        { ...row, delivered: 3, unsubscribed: 0, errored: 1 },
      ]),
    ).toEqual({ delivered: 5, unsubscribed: 1, errored: 1 })
  })
})

describe('methodsLabel', () => {
  it('says how someone signs in, in words', () => {
    expect(methodsLabel(['google', 'email'])).toBe('Google, Email code')
    expect(methodsLabel([])).toBe('Nothing set up')
  })
})

describe('recentCount', () => {
  it('adds up the last N days of an event across its breakdowns', async () => {
    const { recentCount } = await import('../src/lib/data/services')
    const activity = { counts: { search_performed: { '': [1, 2, 3, 4] }, other: { a: [9, 9], b: [1, 1] } } } as never
    expect(recentCount(activity, 'search_performed', 2)).toBe(7)
    expect(recentCount(activity, 'search_performed', 30)).toBe(10)
    expect(recentCount(activity, 'other', 1)).toBe(10)
    expect(recentCount(activity, 'missing', 7)).toBe(0)
  })
})
