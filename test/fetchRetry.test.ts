import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry, isSafeToRepeat, setTokenResolver } from '../src/lib/supabase'

const base = 'https://abc.supabase.co'

describe('isSafeToRepeat', () => {
  it('repeats reads: GET, a read RPC, the services function', () => {
    expect(isSafeToRepeat(`${base}/rest/v1/x`, 'GET')).toBe(true)
    expect(isSafeToRepeat(`${base}/rest/v1/rpc/admin_overview`, 'POST')).toBe(true)
    expect(isSafeToRepeat(`${base}/functions/v1/admin-services`, 'POST')).toBe(true)
  })

  it('never repeats a write', () => {
    for (const name of ['admin_grant', 'admin_delete_list', 'catalog_admin_merge', 'admin_ban_user']) {
      expect(isSafeToRepeat(`${base}/rest/v1/rpc/${name}`, 'POST')).toBe(false)
    }
    expect(isSafeToRepeat(`${base}/rest/v1/x`, 'DELETE')).toBe(false)
  })
})

describe('fetchWithRetry', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('repeats a read RPC once with a fresh token after a 401', async () => {
    const seen: (string | null)[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        seen.push(new Headers(init.headers).get('Authorization'))
        return new Response('{}', { status: seen.length === 1 ? 401 : 200 })
      }),
    )
    setTokenResolver(async (fresh) => (fresh ? 'new' : 'old'))

    const res = await fetchWithRetry(`${base}/rest/v1/rpc/admin_overview`, {
      method: 'POST',
      headers: { Authorization: 'Bearer old' },
    })

    expect(res.status).toBe(200)
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
  })

  it('does not repeat a write after a 401', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', spy)
    setTokenResolver(async () => 'x')

    const res = await fetchWithRetry(`${base}/rest/v1/rpc/admin_grant`, { method: 'POST' })

    expect(res.status).toBe(401)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
