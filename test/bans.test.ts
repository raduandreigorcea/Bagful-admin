import { describe, expect, it } from 'vitest'
import { mergeBans } from '../src/lib/bans'

const app = (id: string) => ({
  user_id: id, display_name: 'Pip', image_url: null, banned_at: '2026-08-25T09:00:00.000Z', lists: 1,
  reason: 'spam', banned_by: 'user_admin', banned_by_name: null, banned_by_image_url: null,
})
const clerk = (id: string, name: string | null = null) => ({
  id, name, email: `${id}@x.io`, imageUrl: null, methods: [], createdAt: null, lastSignInAt: null,
  lastActiveAt: null, twoFactor: false, banned: true, locked: false,
})

describe('mergeBans', () => {
  it('marks a ban held in both places once, and keeps the app row\'s details', () => {
    const rows = mergeBans([app('user_a')], [clerk('user_a')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: 'user_a', inApp: true, inClerk: true, reason: 'spam' })
  })

  it('shows a Clerk-only ban with what Clerk knows, and an app-only ban as app-only', () => {
    const rows = mergeBans([app('user_a')], [clerk('user_b', 'Bea')])
    expect(rows.find((r) => r.user_id === 'user_a')).toMatchObject({ inApp: true, inClerk: false })
    expect(rows.find((r) => r.user_id === 'user_b')).toMatchObject({
      display_name: 'Bea', inApp: false, inClerk: true, banned_at: null, lists: null,
    })
  })

  it('falls back to the email when Clerk has no name', () => {
    expect(mergeBans([], [clerk('user_c')])[0]!.display_name).toBe('user_c@x.io')
  })
})
